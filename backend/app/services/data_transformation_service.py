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
from ..models_db import DatasetMetaDB, TransformationHistoryDB
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
        if is_large:
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
        if not dataset.storage_path:
            raise ValueError("Dataset storage path is missing")

        start_time = time.time()
        result_rows = DuckDBService.query_parquet(dataset.storage_path, transformation["sql"])
        execution_time_ms = int((time.time() - start_time) * 1000)

        DataTransformationService._save_history(
            db,
            dataset_id,
            user_id,
            transformation,
            affected_rows=str(len(result_rows)),
            status="completed",
            error_message=None,
            execution_time_ms=execution_time_ms,
        )

        if DataTransformationService._changes_structure(transformation.get("operation", "")):
            df = pd.DataFrame(result_rows)
            schema = DataConversionService._infer_schema(df) if not df.empty else {}
            stats = DataConversionService._generate_stats(df, schema) if not df.empty else {}
            dataset.schema_json = schema
            dataset.stats_json = stats
            dataset.columns = list(df.columns)
            dataset.row_count = int(df.shape[0])
            db.commit()

        columns = list(result_rows[0].keys()) if result_rows else []
        return {
            "success": True,
            "rowCount": len(result_rows),
            "previewData": result_rows[:100],
            "columns": columns,
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
        if not dataset.storage_path:
            raise ValueError("Dataset storage path is missing")

        start_time = time.time()
        _job_store.update(job_id, progress=25)
        count_sql = f"SELECT COUNT(*) AS total_count FROM ({transformation['sql']}) AS subquery"
        count_rows = DuckDBService.query_parquet(dataset.storage_path, count_sql)
        total_count = int(count_rows[0]["total_count"]) if count_rows else 0

        _job_store.update(job_id, progress=60)
        preview_sql = f"SELECT * FROM ({transformation['sql']}) AS subquery LIMIT 100"
        preview_rows = DuckDBService.query_parquet(dataset.storage_path, preview_sql)
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
