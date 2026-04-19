from __future__ import annotations

import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any
import threading

import pandas as pd
from redis import Redis
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models_db import DatasetMetaDB, DatasetDataDB, DatasetChunkDB, TransformationHistoryDB
from ..services.duckdb_service import DuckDBService
from ..services.data_conversion import DataConversionService


class RedisJobStore:
    def __init__(self, redis_url: str) -> None:
        self._client: Redis | None = None
        self._available = False
        if not redis_url:
            return
        try:
            client = Redis.from_url(redis_url, decode_responses=True)
            client.ping()
            self._client = client
            self._available = True
        except Exception:
            self._client = None
            self._available = False

    def is_available(self) -> bool:
        return self._available and self._client is not None

    def set(self, key: str, payload: dict[str, Any], ttl_seconds: int = 86400) -> None:
        if not self.is_available():
            return
        assert self._client is not None
        self._client.setex(key, ttl_seconds, json.dumps(payload))

    def get(self, key: str) -> dict[str, Any] | None:
        if not self.is_available():
            return None
        assert self._client is not None
        raw = self._client.get(key)
        if not raw:
            return None
        try:
            payload = json.loads(raw)
        except Exception:
            return None
        return payload if isinstance(payload, dict) else None


class TransformationJobStore:
    def __init__(self, redis_store: RedisJobStore) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._redis = redis_store

    def create(self, dataset_id: str, user_id: str, transformation: dict[str, Any]) -> str:
        job_id = str(uuid.uuid4())
        with self._lock:
            payload = {
                "jobId": job_id,
                "datasetId": dataset_id,
                "userId": user_id,
                "transformation": transformation,
                "status": "queued",
                "progress": 0,
                "result": None,
                "error": None,
            }
            self._jobs[job_id] = payload
            if self._redis.is_available():
                self._redis.set(self._redis_key(job_id), payload)
        return job_id

    def update(self, job_id: str, **updates: Any) -> None:
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].update(updates)
                payload = self._jobs[job_id]
                if self._redis.is_available():
                    self._redis.set(self._redis_key(job_id), payload)

    def get(self, job_id: str) -> dict[str, Any] | None:
        if self._redis.is_available():
            cached = self._redis.get(self._redis_key(job_id))
            if cached:
                return cached
        with self._lock:
            return self._jobs.get(job_id)

    @staticmethod
    def _redis_key(job_id: str) -> str:
        return f"transformations:job:{job_id}"


_redis_store = RedisJobStore(settings.redis_url)
_job_store = TransformationJobStore(_redis_store)
_executor = ThreadPoolExecutor(max_workers=2)
_CHUNK_SIZE = 1000
_UNDO_SNAPSHOT_PREFIX = "__UNDO_SNAPSHOT__:"
_UNDO_MAX_ROWS = 50000
_PARQUET_TRANSFORM_MEMORY_LIMIT = "512MB"
_PARQUET_STATS_SAMPLE = 10_000


def _chunk_rows(rows: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [rows[index : index + size] for index in range(0, len(rows), size)]


def _load_dataset_rows(dataset: DatasetMetaDB, db: Session) -> list[dict[str, Any]]:
    chunks = (
        db.query(DatasetChunkDB)
        .filter(DatasetChunkDB.dataset_id == dataset.id)
        .order_by(DatasetChunkDB.chunk_index.asc())
        .all()
    )
    if chunks:
        rows: list[dict[str, Any]] = []
        for chunk in chunks:
            rows.extend(chunk.rows or [])
        return rows

    data = db.query(DatasetDataDB).filter(DatasetDataDB.id == dataset.id).first()
    if data:
        return list(data.rows or [])

    if dataset.storage_path:
        preview = DuckDBService.get_preview(dataset.storage_path, limit=max(1, _UNDO_MAX_ROWS))
        return list(preview.get("rows") or [])

    return []


def _write_dataset_rows(dataset_id: str, rows: list[dict[str, Any]], db: Session) -> None:
    db.query(DatasetChunkDB).filter(DatasetChunkDB.dataset_id == dataset_id).delete()
    db.query(DatasetDataDB).filter(DatasetDataDB.id == dataset_id).delete()

    chunks = _chunk_rows(rows, _CHUNK_SIZE)
    for index, chunk in enumerate(chunks):
        db.add(
            DatasetChunkDB(
                id=f"{dataset_id}:{index}",
                dataset_id=dataset_id,
                chunk_index=index,
                rows=chunk,
            )
        )

    if len(rows) <= 5000:
        db.add(
            DatasetDataDB(
                id=dataset_id,
                rows=rows,
            )
        )


def _build_undo_snapshot(dataset: DatasetMetaDB, current_rows: list[dict[str, Any]]) -> str | None:
    if len(current_rows) > _UNDO_MAX_ROWS:
        return None
    payload = {
        "rows": current_rows,
        "columns": list(dataset.columns or []),
        "row_count": int(dataset.row_count or len(current_rows)),
        "schema_json": dataset.schema_json or {},
        "stats_json": dataset.stats_json or {},
    }
    return _UNDO_SNAPSHOT_PREFIX + json.dumps(payload)


def _parse_undo_snapshot(raw: str | None) -> dict[str, Any] | None:
    if not raw or not raw.startswith(_UNDO_SNAPSHOT_PREFIX):
        return None
    try:
        payload = json.loads(raw[len(_UNDO_SNAPSHOT_PREFIX) :])
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _create_transformed_dataset_version(
    source_dataset: DatasetMetaDB,
    transformed_rows: list[dict[str, Any]],
    df: pd.DataFrame,
    db: Session,
) -> DatasetMetaDB:
    schema = DataConversionService._infer_schema(df) if not df.empty else {}
    stats = DataConversionService._generate_stats(df, schema) if not df.empty else {}

    from .persistence_policy import materialize_dataset
    output_dataset = materialize_dataset(
        db,
        triggered_by="transform",
        id=str(uuid.uuid4()),
        user_id=source_dataset.user_id,
        workspace_id=source_dataset.workspace_id or "default",
        name=(source_dataset.name or "dataset") + " (transformed)",
        description=source_dataset.description,
        source_type=source_dataset.source_type,
        storage_provider=source_dataset.storage_provider,
        storage_path=None,
        file_format=source_dataset.file_format,
        schema_json=schema,
        stats_json=stats,
        columns=list(df.columns),
        row_count=int(df.shape[0]),
        status="ready",
        error_message=None,
        access_tier=source_dataset.access_tier or "hot",
        parent_id=source_dataset.id,
    )
    db.flush()
    return output_dataset


def _transform_via_parquet(
    source_dataset: DatasetMetaDB,
    user_id: str,
    transformation: dict[str, Any],
    db: Session,
) -> dict[str, Any]:
    """Push a SQL transformation fully into DuckDB by reading directly from the
    source Parquet file in object storage.

    This never materialises all rows as Python dicts, so it handles 1M+ row
    datasets without OOM.  The result is written as a new Parquet file and a
    new ``DatasetMetaDB`` row with ``storage_path`` set — so subsequent
    transforms on the output also use this fast path.

    No ``DatasetChunkDB`` / ``DatasetDataDB`` rows are written for the output.
    Undo is not supported for Parquet-backed transforms (same as the existing
    behaviour for datasets with > ``_UNDO_MAX_ROWS`` rows).
    """
    import io

    import duckdb as _duckdb
    import pyarrow.parquet as pq

    from ..services.calculated_columns_service import CalculatedColumnsService
    from ..services.data_conversion import DataConversionService
    from ..services.object_storage import StorageService

    sql = transformation.get("sql") or ""
    # get_query_path returns a filesystem path (local) or a pre-signed HTTPS
    # URL (S3/R2/GCS).  Both are readable by DuckDB without extra credentials.
    source_path = StorageService.get_query_path(source_dataset.storage_path)
    # SQL-escape single quotes that could appear in filesystem paths on Windows.
    safe_path = source_path.replace("'", "''")

    start_time = time.time()

    conn = _duckdb.connect(database=":memory:")
    try:
        conn.execute(f"SET memory_limit='{_PARQUET_TRANSFORM_MEMORY_LIMIT}';")
        conn.execute("SET threads=2;")
        # httpfs is needed for HTTPS (pre-signed) URLs; ignore if already loaded.
        try:
            conn.execute("LOAD httpfs;")
        except Exception:
            try:
                conn.execute("INSTALL httpfs;")
                conn.execute("LOAD httpfs;")
            except Exception:
                pass  # local file paths don't need httpfs

        # Register the source Parquet as a VIEW called `dataset` — the name
        # expected by all user-generated SQL.  Inject any calculated columns
        # the same way transform_rows does.
        base_sql = f"SELECT * FROM read_parquet('{safe_path}')"
        if source_dataset.id:
            base_sql = CalculatedColumnsService.inject_calculated_columns(
                base_sql, source_dataset.id
            )
        DuckDBService._execute_statement(
            conn,
            f"CREATE VIEW dataset AS {base_sql}",
            allowed_paths=[source_path],
        )

        # Normalise user SQL (strips CREATE TABLE wrappers, fixes alias quirks).
        normalized_sql = DuckDBService._normalize_dataset_sql(sql)
        if not normalized_sql:
            normalized_sql = "SELECT * FROM dataset"

        # Materialise the full transform result inside DuckDB.
        conn.execute(f"CREATE TABLE result AS {normalized_sql}")

        total_rows: int = conn.execute("SELECT COUNT(*) FROM result").fetchone()[0]  # type: ignore[index]

        # Fetch a small sample for schema and stats inference — avoids loading
        # millions of rows into pandas.
        sample_df: pd.DataFrame = conn.execute(
            f"SELECT * FROM result LIMIT {_PARQUET_STATS_SAMPLE}"
        ).fetchdf()
        schema = DataConversionService._infer_schema(sample_df) if not sample_df.empty else {}
        stats = DataConversionService._generate_stats(sample_df, schema) if not sample_df.empty else {}
        columns: list[str] = list(sample_df.columns)

        # Build an API-safe preview from the already-fetched sample.
        preview_df = sample_df.head(100)
        preview_rows: list[dict[str, Any]] = (
            preview_df.astype(object)
            .where(pd.notnull(preview_df), None)
            .to_dict(orient="records")
        )

        # Write the full result to Parquet via Arrow — columnar, never Python dicts.
        arrow_table = conn.execute("SELECT * FROM result").fetch_arrow_table()
        buf = io.BytesIO()
        pq.write_table(arrow_table, buf, compression="zstd")
        parquet_bytes = buf.getvalue()

    finally:
        conn.close()

    execution_time_ms = int((time.time() - start_time) * 1000)

    # Upload the new Parquet file to object storage.
    new_dataset_id = str(uuid.uuid4())
    new_storage_path = StorageService.upload(
        user_id=user_id,
        dataset_id=new_dataset_id,
        buffer=parquet_bytes,
        file_name=f"{new_dataset_id}.parquet",
        storage_tier=source_dataset.access_tier or "hot",
    )

    # Persist the output dataset.  storage_path is set so future transforms
    # also take this fast path.  No DB chunk rows are written.
    from .persistence_policy import materialize_dataset
    output_dataset = materialize_dataset(
        db,
        triggered_by="transform",
        id=new_dataset_id,
        user_id=source_dataset.user_id,
        workspace_id=source_dataset.workspace_id or "default",
        name=(source_dataset.name or "dataset") + " (transformed)",
        description=source_dataset.description,
        source_type=source_dataset.source_type,
        storage_provider=source_dataset.storage_provider,
        storage_path=new_storage_path,
        file_format="parquet",
        schema_json=schema,
        stats_json=stats,
        columns=columns,
        row_count=int(total_rows),
        status="ready",
        error_message=None,
        access_tier=source_dataset.access_tier or "hot",
        parent_id=source_dataset.id,
    )
    db.flush()

    DataTransformationService._save_history(
        db,
        output_dataset.id,
        user_id,
        transformation,
        affected_rows=str(total_rows),
        status="completed",
        error_message=None,  # no undo snapshot for Parquet-backed transforms
        execution_time_ms=execution_time_ms,
    )
    db.commit()

    return {
        "success": True,
        "rowCount": int(total_rows),
        "previewData": preview_rows,
        "columns": columns,
        "outputDataset": {
            "id": output_dataset.id,
            "name": output_dataset.name,
            "rowCount": output_dataset.row_count,
            "parentId": output_dataset.parent_id,
        },
    }


class DataTransformationService:
    @staticmethod
    def execute_transformation(
        dataset_id: str,
        user_id: str,
        transformation: dict[str, Any],
        db: Session,
    ) -> dict[str, Any]:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise ValueError("Dataset not found")

        is_large = int(dataset.row_count or 0) > 1_000_000
        if is_large and not dataset.storage_path:
            # Large chunk-only dataset: run in a background thread to avoid
            # blocking the request for the duration of the transform.
            job_id = _job_store.create(dataset_id, user_id, transformation)
            _executor.submit(_run_background_job, job_id, dataset_id, user_id, transformation)
            return {"jobId": job_id}

        result = DataTransformationService._execute_immediate(
            dataset_id, user_id, transformation, db
        )
        return {"result": result}

    @staticmethod
    def _execute_immediate(
        dataset_id: str,
        user_id: str,
        transformation: dict[str, Any],
        db: Session,
    ) -> dict[str, Any]:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise ValueError("Dataset not found")

        # Fast path: dataset is backed by a Parquet file in object storage.
        # Push the SQL entirely into DuckDB without loading rows into Python.
        if dataset.storage_path:
            return _transform_via_parquet(dataset, user_id, transformation, db)

        current_rows = _load_dataset_rows(dataset, db)
        undo_snapshot = _build_undo_snapshot(dataset, current_rows)

        start_time = time.time()
        result_rows = DuckDBService.transform_rows(current_rows, transformation["sql"], dataset_id=dataset_id)
        execution_time_ms = int((time.time() - start_time) * 1000)

        df = pd.DataFrame(result_rows)
        transformed_rows = df.astype(object).where(pd.notnull(df), None).to_dict(orient="records")

        output_dataset = _create_transformed_dataset_version(dataset, transformed_rows, df, db)
        _write_dataset_rows(output_dataset.id, transformed_rows, db)
        db.commit()

        DataTransformationService._save_history(
            db,
            output_dataset.id,
            user_id,
            transformation,
            affected_rows=str(len(result_rows)),
            status="completed",
            error_message=undo_snapshot,
            execution_time_ms=execution_time_ms,
        )

        columns = list(result_rows[0].keys()) if result_rows else []
        return {
            "success": True,
            "rowCount": len(result_rows),
            "previewData": result_rows[:100],
            "columns": columns,
            "outputDataset": {
                "id": output_dataset.id,
                "name": output_dataset.name,
                "rowCount": output_dataset.row_count,
                "parentId": output_dataset.parent_id,
            },
        }

    @staticmethod
    def get_job_status(job_id: str) -> dict[str, Any]:
        job = _job_store.get(job_id)
        if not job:
            return {"status": "not_found"}
        return {
            "status": job.get("status"),
            "progress": job.get("progress", 0),
            "result": job.get("result"),
            "error": job.get("error"),
        }

    @staticmethod
    def undo_last_transformation(dataset_id: str, user_id: str, db: Session) -> dict[str, Any]:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise ValueError("Dataset not found")

        history = (
            db.query(TransformationHistoryDB)
            .filter(TransformationHistoryDB.dataset_id == dataset_id)
            .filter(TransformationHistoryDB.user_id == user_id)
            .order_by(TransformationHistoryDB.created_at.desc())
            .all()
        )

        snapshot_payload: dict[str, Any] | None = None
        source_history_id: str | None = None
        for row in history:
            parsed = _parse_undo_snapshot(row.error_message)
            if parsed is not None:
                snapshot_payload = parsed
                source_history_id = row.id
                break

        if snapshot_payload is None:
            raise ValueError("No undo snapshot available for this dataset")

        snapshot_rows = snapshot_payload.get("rows")
        if not isinstance(snapshot_rows, list):
            raise ValueError("Undo snapshot is invalid")

        normalized_rows = pd.DataFrame(snapshot_rows).astype(object).where(pd.notnull(pd.DataFrame(snapshot_rows)), None).to_dict(orient="records")
        _write_dataset_rows(dataset_id, normalized_rows, db)

        dataset.columns = list(snapshot_payload.get("columns") or [])
        dataset.row_count = int(snapshot_payload.get("row_count") or len(normalized_rows))
        dataset.schema_json = snapshot_payload.get("schema_json") or {}
        dataset.stats_json = snapshot_payload.get("stats_json") or {}
        db.commit()

        DataTransformationService._save_history(
            db,
            dataset_id,
            user_id,
            {
                "operation": "undo",
                "sql": "-- undo last transformation",
                "description": f"Undo transformation {source_history_id or ''}".strip(),
            },
            affected_rows=str(len(normalized_rows)),
            status="completed",
            error_message=None,
            execution_time_ms=None,
        )

        return {
            "success": True,
            "dataset_id": dataset_id,
            "rowCount": len(normalized_rows),
            "columns": dataset.columns,
        }

    @staticmethod
    def _changes_structure(operation: str) -> bool:
        structural_ops = {
            "select_columns",
            "drop_columns",
            "rename_columns",
            "create_column",
            "split_column",
            "merge_columns",
            "group_by",
            "pivot",
            "unpivot",
            "join",
            "union",
        }
        return operation in structural_ops

    @staticmethod
    def _save_history(
        db: Session,
        dataset_id: str,
        user_id: str,
        transformation: dict[str, Any],
        affected_rows: str,
        status: str,
        error_message: str | None,
        execution_time_ms: int | None,
    ) -> None:
        db.add(
            TransformationHistoryDB(
                id=str(uuid.uuid4()),
                dataset_id=dataset_id,
                user_id=user_id,
                operation=transformation.get("operation") or "",
                sql=transformation.get("sql") or "",
                description=transformation.get("description"),
                affected_rows=affected_rows,
                execution_time_ms=execution_time_ms,
                status=status,
                error_message=error_message,
            )
        )
        db.commit()


def _run_background_job(
    job_id: str,
    dataset_id: str,
    user_id: str,
    transformation: dict[str, Any],
) -> None:
    _job_store.update(job_id, status="running", progress=5)
    db = SessionLocal()
    try:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise ValueError("Dataset not found")
        # Fast path: Parquet-backed dataset — push transform into DuckDB.
        if dataset.storage_path:
            _job_store.update(job_id, progress=20)
            result = _transform_via_parquet(dataset, user_id, transformation, db)
            _job_store.update(job_id, status="completed", progress=100, result=result)
            return
        current_rows = _load_dataset_rows(dataset, db)

        start_time = time.time()
        _job_store.update(job_id, progress=25)
        transformed_rows = DuckDBService.transform_rows(current_rows, transformation["sql"], dataset_id=dataset_id)
        total_count = len(transformed_rows)

        _job_store.update(job_id, progress=60)
        preview_rows = transformed_rows[:100]
        execution_time_ms = int((time.time() - start_time) * 1000)

        DataTransformationService._save_history(
            db,
            dataset_id,
            user_id,
            transformation,
            affected_rows=str(total_count),
            status="completed",
            error_message=None,
            execution_time_ms=execution_time_ms,
        )

        _job_store.update(
            job_id,
            status="completed",
            progress=100,
            result={
                "success": True,
                "rowCount": total_count,
                "previewData": preview_rows,
            },
        )
    except Exception as exc:
        _job_store.update(job_id, status="failed", progress=100, error=str(exc))
    finally:
        db.close()
