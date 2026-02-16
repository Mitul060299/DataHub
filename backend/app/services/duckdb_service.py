from __future__ import annotations

import re
import time
from typing import Any

import duckdb
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

    @staticmethod
    def _inject_path(query: str, file_path: str) -> str:
        pattern = re.compile(r"\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)", re.IGNORECASE)
        replacement = f"FROM read_parquet('{file_path}')"
        return pattern.sub(replacement, query, count=1)

    @staticmethod
    def _execute(connection: duckdb.DuckDBPyConnection, sql: str) -> list[dict[str, Any]]:
        result = connection.execute(sql)
        columns = [col[0] for col in result.description]
        rows = result.fetchall()
        return [dict(zip(columns, row)) for row in rows]
