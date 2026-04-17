from __future__ import annotations

import re
import threading
import time
from typing import Any

import pandas as pd
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models_db import DatasetChunkDB, DatasetDataDB, DatasetMetaDB
from .duckdb.path_guard import guard_duckdb_sql_paths
from .object_storage import StorageService
from .query_cache import QueryCacheService


class DuckDBService:
    _db: duckdb.DuckDBPyConnection | None = None
    _db_lock: threading.Lock = threading.Lock()

    @classmethod
    def _ensure_db(cls) -> duckdb.DuckDBPyConnection:
        if cls._db is None:
            with cls._db_lock:
                if cls._db is None:
                    import duckdb  # noqa: PLC0415 — lazy to avoid native-ext load at startup
                    cls._db = duckdb.connect(database=":memory:")
                    try:
                        cls._db.execute("SET memory_limit='512MB';")
                        cls._db.execute("SET threads=1;")
                    except Exception:
                        pass
                    try:
                        cls._db.execute("INSTALL httpfs;")
                        cls._db.execute("LOAD httpfs;")
                    except Exception:
                        pass
                    cls._configure_storage()
        return cls._db

    @classmethod
    def _configure_storage(cls) -> None:
        if cls._db is None:
            return
        provider = settings.storage_provider.lower()
        if provider == "r2":
            cls._db.execute(
                "SET s3_endpoint=?",
                [f"{settings.r2_account_id}.r2.cloudflarestorage.com"],
            )
            cls._db.execute("SET s3_access_key_id=?", [settings.r2_access_key_id])
            cls._db.execute("SET s3_secret_access_key=?", [settings.r2_secret_access_key])
            cls._db.execute("SET s3_url_style='path'")
        elif provider == "s3":
            cls._db.execute("SET s3_region=?", [settings.s3_region])
            cls._db.execute("SET s3_access_key_id=?", [settings.s3_access_key_id])
            cls._db.execute("SET s3_secret_access_key=?", [settings.s3_secret_access_key])

    @classmethod
    def query_with_cache(cls, db: Session, dataset_id: str, user_id: str | None, storage_path: str, query: str) -> tuple[list[dict[str, Any]], bool]:
        cached, hit = QueryCacheService.get(db, dataset_id, query)
        if hit and cached is not None:
            return cached, True

        start_time = time.time()
        result = cls.query_parquet(storage_path, query, dataset_id=dataset_id)
        execution_time_ms = int((time.time() - start_time) * 1000)

        QueryCacheService.set(db, dataset_id, user_id, query, result, execution_time_ms)
        return result, False

    @classmethod
    def query_parquet(cls, storage_path: str, query: str, dataset_id: str | None = None) -> list[dict[str, Any]]:
        connection = cls._ensure_db()
        file_path = StorageService.get_query_path(storage_path)
        sql_query = cls._inject_path(query, file_path)
        if dataset_id:
            from .calculated_columns_service import CalculatedColumnsService

            sql_query = CalculatedColumnsService.inject_calculated_columns(sql_query, dataset_id)
        return cls._execute(connection, sql_query, allowed_paths=[file_path])

    @classmethod
    def get_preview(cls, storage_path: str, limit: int = 100) -> dict[str, Any]:
        connection = cls._ensure_db()
        file_path = StorageService.get_query_path(storage_path)
        sql_query = f"SELECT * FROM read_parquet('{file_path}') LIMIT {int(limit)}"
        rows = cls._execute(connection, sql_query, allowed_paths=[file_path])
        columns = list(rows[0].keys()) if rows else []
        return {"rows": rows, "columns": columns}

    @classmethod
    def preview_page(
        cls,
        storage_path: str,
        offset: int,
        limit: int,
        allowed_columns: list[str] | None = None,
        sort_by: str | None = None,
        sort_dir: str = "asc",
        filter_col: str | None = None,
        filter_op: str | None = None,
        filter_val: str | None = None,
        skip_count: bool = False,
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Return (page_rows, total_matching_rows) for a Parquet file via DuckDB.

        Column name inputs are validated against allowed_columns before being
        embedded in SQL.  Filter values are passed via DuckDB parameter binding
        (never interpolated) to prevent injection.  At most `limit` rows ever
        reach Python memory.

        When skip_count=True the COUNT(*) scan is skipped and 0 is returned for
        total — callers that already have meta.row_count should pass skip_count=True
        to avoid a redundant full-file scan that can spike memory.
        """
        import duckdb as _duckdb  # noqa: PLC0415
        connection = cls._ensure_db()
        file_path = StorageService.get_query_path(storage_path)

        # Validate column names — strip any quoting/special chars, then check
        # against the known schema so nothing untrusted reaches the SQL string.
        def _safe_col(name: str | None) -> str | None:
            if not name:
                return None
            clean = re.sub(r'["\';\\]', "", name)
            if allowed_columns is not None and clean not in allowed_columns:
                return None
            return clean

        safe_filter_col = _safe_col(filter_col)
        safe_sort_col = _safe_col(sort_by)

        # Build parameterised WHERE clause
        where_sql = ""
        params: list[Any] = []
        if safe_filter_col and filter_op and filter_val is not None:
            col_expr = f'"{safe_filter_col}"'
            if filter_op == "contains":
                where_sql = f"WHERE LOWER(CAST({col_expr} AS VARCHAR)) LIKE LOWER(?)"
                params.append(f"%{filter_val}%")
            elif filter_op == "eq":
                where_sql = f"WHERE CAST({col_expr} AS VARCHAR) = ?"
                params.append(str(filter_val))
            elif filter_op == "gt":
                where_sql = f"WHERE TRY_CAST({col_expr} AS DOUBLE) > ?"
                params.append(float(filter_val))
            elif filter_op == "lt":
                where_sql = f"WHERE TRY_CAST({col_expr} AS DOUBLE) < ?"
                params.append(float(filter_val))

        order_sql = ""
        if safe_sort_col:
            direction = "DESC" if (sort_dir or "asc").lower() == "desc" else "ASC"
            order_sql = f'ORDER BY "{safe_sort_col}" {direction} NULLS LAST'

        base_from = f"FROM read_parquet('{file_path}') {where_sql}"
        guarded_from = guard_duckdb_sql_paths(base_from, allowed_paths=[file_path])

        # Count — skip when no filter is active; the caller has meta.row_count and
        # will override the value anyway, so the full-file scan is wasted work that
        # can spike DuckDB memory on large Parquet files.
        try:
            if skip_count:
                total = 0  # caller must use meta.row_count
            else:
                count_result = connection.execute(f"SELECT COUNT(*) {guarded_from}", params).fetchone()
                total = int(count_result[0]) if count_result else 0

            # Data page
            data_sql = f"SELECT * {guarded_from} {order_sql} LIMIT ? OFFSET ?"
            result = connection.execute(data_sql, params + [int(limit), int(offset)])
            columns = [col[0] for col in result.description]
            rows = [dict(zip(columns, row)) for row in result.fetchall()]

            return rows, total
        except Exception:
            # Reset the singleton so the next request gets a fresh connection
            # rather than hitting a corrupted/hung state.
            cls._db = None
            raise

    @classmethod
    def transform_rows(cls, rows: list[dict[str, Any]], sql: str, dataset_id: str | None = None) -> list[dict[str, Any]]:
        connection = cls._ensure_db()
        dataset_df = pd.DataFrame(rows or [])
        connection.register("dataset_source", dataset_df)
        try:
            cls._execute_statement(connection, "DROP TABLE IF EXISTS dataset")
            base_select = "SELECT * FROM dataset_source"
            if dataset_id:
                from .calculated_columns_service import CalculatedColumnsService

                base_select = CalculatedColumnsService.inject_calculated_columns(base_select, dataset_id)
            cls._execute_statement(connection, f"CREATE TEMP TABLE dataset AS {base_select}")

            transformed_sql = cls._normalize_dataset_sql(sql)
            statements = cls._split_sql_statements(transformed_sql)
            if not statements:
                return rows

            last_result: list[dict[str, Any]] | None = None
            for statement in statements:
                if cls._is_select_statement(statement):
                    last_result = cls._execute(connection, statement)
                else:
                    cls._execute_statement(connection, statement)

            if last_result is not None:
                return last_result

            return cls._execute(connection, "SELECT * FROM dataset")
        finally:
            try:
                cls._execute_statement(connection, "DROP TABLE IF EXISTS dataset")
            except Exception:
                pass
            try:
                connection.unregister("dataset_source")
            except Exception:
                pass

    @classmethod
    def transform_named_relations(
        cls,
        relation_rows: dict[str, list[dict[str, Any]]],
        sql: str,
        output_relation: str = "dataset",
        dataset_id: str | None = None,
    ) -> list[dict[str, Any]]:
        connection = cls._ensure_db()
        relation_rows = relation_rows or {}
        table_names = [name for name in relation_rows.keys() if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name or "")]
        if output_relation not in table_names:
            table_names.append(output_relation)

        try:
            for name in table_names:
                cls._execute_statement(connection, f"DROP TABLE IF EXISTS {name}")

            for name in table_names:
                rows = relation_rows.get(name) or []
                frame = pd.DataFrame(rows)
                source_name = f"{name}_source"
                connection.register(source_name, frame)
                try:
                    base_select = f"SELECT * FROM {source_name}"
                    if dataset_id and name == output_relation:
                        from .calculated_columns_service import CalculatedColumnsService

                        base_select = CalculatedColumnsService.inject_calculated_columns(base_select, dataset_id)
                    cls._execute_statement(connection, f"CREATE TEMP TABLE {name} AS {base_select}")
                finally:
                    try:
                        connection.unregister(source_name)
                    except Exception:
                        pass

            normalized_sql = cls._normalize_dataset_sql(sql)
            statements = cls._split_sql_statements(normalized_sql)
            if not statements:
                return cls._execute(connection, f"SELECT * FROM {output_relation}")

            last_result: list[dict[str, Any]] | None = None
            for statement in statements:
                if cls._is_select_statement(statement):
                    last_result = cls._execute(connection, statement)
                else:
                    cls._execute_statement(connection, statement)

            if last_result is not None:
                return last_result

            return cls._execute(connection, f"SELECT * FROM {output_relation}")
        finally:
            for name in table_names:
                try:
                    cls._execute_statement(connection, f"DROP TABLE IF EXISTS {name}")
                except Exception:
                    pass

    @staticmethod
    def _inject_path(query: str, file_path: str) -> str:
        pattern = re.compile(r"\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)", re.IGNORECASE)
        replacement = f"FROM read_parquet('{file_path}')"
        return pattern.sub(replacement, query, count=1)

    @staticmethod
    def _inject_relation(query: str, relation_name: str) -> str:
        pattern = re.compile(r"\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)", re.IGNORECASE)
        replacement = f"FROM {relation_name}"
        return pattern.sub(replacement, query, count=1)

    @staticmethod
    def _normalize_dataset_sql(sql: str) -> str:
        normalized = (sql or "").strip()
        if not normalized:
            return normalized
        # Strip "CREATE [OR REPLACE] [TEMP] TABLE <name> AS" prefix.
        # In the transform_rows context only the SELECT result matters;
        # the source table is always registered as 'dataset', so the CREATE
        # would fail anyway.  Extracting the bare SELECT fixes the error and
        # ensures the right rows are returned.
        normalized = re.sub(
            r"^CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+\S+\s+AS\s+",
            "", normalized, flags=re.IGNORECASE,
        )
        # Replace bare `table` or `dataset_rows` used as a table-name alias.
        # Restrict to FROM/JOIN positions so we don't corrupt any remaining DDL
        # keywords (e.g. DROP TABLE, CREATE TABLE in multi-statement SQL).
        normalized = re.sub(r"\b(FROM|JOIN)\s+table\b", r"\1 dataset", normalized, flags=re.IGNORECASE)
        return re.sub(r"\bdataset_rows\b", "dataset", normalized, flags=re.IGNORECASE)

    @staticmethod
    def _split_sql_statements(sql: str) -> list[str]:
        statements = [statement.strip() for statement in (sql or "").split(";")]
        return [statement for statement in statements if statement]

    @staticmethod
    def _is_select_statement(sql: str) -> bool:
        return bool(re.match(r"^\s*(select|with)\b", sql, flags=re.IGNORECASE))

    @staticmethod
    def _execute_statement(
        connection: duckdb.DuckDBPyConnection,
        sql: str,
        allowed_paths: list[str] | None = None,
    ) -> None:
        guarded_sql = guard_duckdb_sql_paths(sql, allowed_paths=allowed_paths)
        connection.execute(guarded_sql)

    @staticmethod
    def _execute(
        connection: duckdb.DuckDBPyConnection,
        sql: str,
        allowed_paths: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        guarded_sql = guard_duckdb_sql_paths(sql, allowed_paths=allowed_paths)
        result = connection.execute(guarded_sql)
        columns = [col[0] for col in result.description]
        rows = result.fetchall()

        import math as _math

        def _safe(v: object) -> object:
            """Coerce DuckDB/numpy types to plain Python so ormsgpack can checkpoint them."""
            if v is None:
                return None
            t = type(v).__name__
            if t in ("int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64", "hugeint"):
                return int(v)
            if t in ("float32", "float64", "double", "Decimal"):
                f = float(v)
                return None if (_math.isnan(f) or _math.isinf(f)) else f
            if t in ("date", "time", "datetime", "timestamp", "timedelta", "interval"):
                return str(v)
            if isinstance(v, (list, tuple)):
                return [_safe(item) for item in v]
            if isinstance(v, dict):
                return {k: _safe(item) for k, item in v.items()}
            return v

        return [{col: _safe(val) for col, val in zip(columns, row)} for row in rows]

    @classmethod
    def _load_dataset_rows(cls, dataset_id: str) -> tuple[DatasetMetaDB | None, list[dict[str, Any]]]:
        db = SessionLocal()
        try:
            dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
            if not dataset:
                return None, []

            chunks = (
                db.query(DatasetChunkDB)
                .filter(DatasetChunkDB.dataset_id == dataset_id)
                .order_by(DatasetChunkDB.chunk_index.asc())
                .all()
            )
            if chunks:
                rows: list[dict[str, Any]] = []
                for chunk in chunks:
                    rows.extend(chunk.rows or [])
                return dataset, rows

            data = db.query(DatasetDataDB).filter(DatasetDataDB.id == dataset_id).first()
            if data and isinstance(data.rows, list):
                return dataset, list(data.rows)

            if dataset.storage_path:
                # Use a small fixed limit — callers only need rows to infer schema
                # or column stats; loading the full dataset causes OOM on large files.
                preview = cls.get_preview(dataset.storage_path, limit=50)
                return dataset, list(preview.get("rows") or [])

            return dataset, []
        finally:
            db.close()

    @staticmethod
    def _infer_schema_from_rows(rows: list[dict[str, Any]]) -> dict[str, str]:
        if not rows:
            return {}
        sample = rows[0]
        schema: dict[str, str] = {}
        for column, value in sample.items():
            schema[column] = type(value).__name__ if value is not None else "unknown"
        return schema

    @classmethod
    def get_schema(cls, dataset_id: str) -> dict:
        dataset, rows = cls._load_dataset_rows(dataset_id)
        if dataset and isinstance(dataset.schema_json, dict) and dataset.schema_json:
            return dict(dataset.schema_json)
        return cls._infer_schema_from_rows(rows)

    @classmethod
    def get_column_stats(cls, dataset_id: str) -> dict:
        dataset, rows = cls._load_dataset_rows(dataset_id)
        if dataset and isinstance(dataset.stats_json, dict) and dataset.stats_json:
            return dict(dataset.stats_json)
        if not rows:
            return {}

        import math as _math

        def _scalar(v: Any) -> Any:
            """Coerce a pandas/numpy scalar to a plain Python type for msgpack/JSON safety."""
            if v is None:
                return None
            # pandas Timestamp, Period, Timedelta, etc. expose .isoformat()
            if hasattr(v, "isoformat"):
                return v.isoformat()
            # numpy scalars expose .item() which converts to the corresponding Python type
            if hasattr(v, "item"):
                try:
                    v = v.item()
                except (ValueError, TypeError):
                    return str(v)
            if isinstance(v, float) and (_math.isnan(v) or _math.isinf(v)):
                return None
            return v

        frame = pd.DataFrame(rows)
        stats: dict[str, dict[str, Any]] = {}
        for column in frame.columns:
            series = frame[column]
            non_null = series.dropna()
            stats[column] = {
                "nulls": int(series.isna().sum()),
                "min": None if non_null.empty else _scalar(non_null.min()),
                "max": None if non_null.empty else _scalar(non_null.max()),
                "unique": int(non_null.nunique(dropna=True)),
            }
        return stats

    @classmethod
    def get_sample_rows(cls, dataset_id: str, limit: int = 10) -> list:
        _, rows = cls._load_dataset_rows(dataset_id)
        return rows[: max(0, int(limit))]

    @classmethod
    def execute_sql(cls, dataset_id: str, sql: str) -> dict:
        _, rows = cls._load_dataset_rows(dataset_id)
        before_count = len(rows)
        transformed_rows = cls.transform_rows(rows, sql, dataset_id=dataset_id)
        after_count = len(transformed_rows)
        rows_affected = abs(after_count - before_count)
        if rows_affected == 0 and (sql or "").strip():
            rows_affected = after_count
        return {
            "rows_affected": rows_affected,
            "success": True,
        }
