from __future__ import annotations

import re
import time
from typing import Any

import duckdb
import pandas as pd
from sqlalchemy.orm import Session

from ..config import settings
from .object_storage import StorageService
from .query_cache import QueryCacheService


class DuckDBService:
    _db: duckdb.DuckDBPyConnection | None = None

    @classmethod
    def _ensure_db(cls) -> duckdb.DuckDBPyConnection:
        if cls._db is None:
            cls._db = duckdb.connect(database=":memory:")
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
        result = cls.query_parquet(storage_path, query)
        execution_time_ms = int((time.time() - start_time) * 1000)

        QueryCacheService.set(db, dataset_id, user_id, query, result, execution_time_ms)
        return result, False

    @classmethod
    def query_parquet(cls, storage_path: str, query: str) -> list[dict[str, Any]]:
        connection = cls._ensure_db()
        file_path = StorageService.get_query_path(storage_path)
        sql_query = cls._inject_path(query, file_path)
        return cls._execute(connection, sql_query)

    @classmethod
    def get_preview(cls, storage_path: str, limit: int = 100) -> dict[str, Any]:
        connection = cls._ensure_db()
        file_path = StorageService.get_query_path(storage_path)
        sql_query = f"SELECT * FROM read_parquet('{file_path}') LIMIT {int(limit)}"
        rows = cls._execute(connection, sql_query)
        columns = list(rows[0].keys()) if rows else []
        return {"rows": rows, "columns": columns}

    @classmethod
    def query_rows(cls, rows: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
        connection = cls._ensure_db()
        dataset_df = pd.DataFrame(rows or [])
        view_name = "dataset_rows"
        connection.register(view_name, dataset_df)
        try:
            sql_query = cls._inject_relation(query, view_name)
            return cls._execute(connection, sql_query)
        finally:
            try:
                connection.unregister(view_name)
            except Exception:
                pass

    @classmethod
    def transform_rows(cls, rows: list[dict[str, Any]], sql: str) -> list[dict[str, Any]]:
        connection = cls._ensure_db()
        dataset_df = pd.DataFrame(rows or [])
        connection.register("dataset_source", dataset_df)
        try:
            connection.execute("DROP TABLE IF EXISTS dataset")
            connection.execute("CREATE TEMP TABLE dataset AS SELECT * FROM dataset_source")

            transformed_sql = cls._normalize_dataset_sql(sql)
            statements = cls._split_sql_statements(transformed_sql)
            if not statements:
                return rows

            last_result: list[dict[str, Any]] | None = None
            for statement in statements:
                if cls._is_select_statement(statement):
                    last_result = cls._execute(connection, statement)
                else:
                    connection.execute(statement)

            if last_result is not None:
                return last_result

            return cls._execute(connection, "SELECT * FROM dataset")
        finally:
            try:
                connection.execute("DROP TABLE IF EXISTS dataset")
            except Exception:
                pass
            try:
                connection.unregister("dataset_source")
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
        normalized = re.sub(r"\btable\b", "dataset", normalized, flags=re.IGNORECASE)
        return re.sub(r"\bdataset_rows\b", "dataset", normalized, flags=re.IGNORECASE)

    @staticmethod
    def _split_sql_statements(sql: str) -> list[str]:
        statements = [statement.strip() for statement in (sql or "").split(";")]
        return [statement for statement in statements if statement]

    @staticmethod
    def _is_select_statement(sql: str) -> bool:
        return bool(re.match(r"^\s*(select|with)\b", sql, flags=re.IGNORECASE))

    @staticmethod
    def _execute(connection: duckdb.DuckDBPyConnection, sql: str) -> list[dict[str, Any]]:
        result = connection.execute(sql)
        columns = [col[0] for col in result.description]
        rows = result.fetchall()
        return [dict(zip(columns, row)) for row in rows]
