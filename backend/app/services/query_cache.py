from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
from typing import Any

import redis
from sqlalchemy.orm import Session

from ..config import settings
from ..models_db import QueryCacheDB, DatasetMetaDB


_redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)


class QueryCacheService:
    @staticmethod
    def get_cache_key(dataset_id: str, query: str) -> tuple[str, str]:
        hash_value = hashlib.md5(f"{dataset_id}:{query}".encode("utf-8")).hexdigest()
        return f"query:{dataset_id}:{hash_value}", hash_value

    @classmethod
    def get(cls, db: Session, dataset_id: str, query: str) -> tuple[Any | None, bool]:
        if not settings.enable_query_cache:
            return None, False

        cache_key, query_hash = cls.get_cache_key(dataset_id, query)
        cached = _redis.get(cache_key)
        if cached:
            cls._record_cache_hit(db, dataset_id, query_hash)
            return json.loads(cached), True

        now = datetime.now(timezone.utc)
        row = (
            db.query(QueryCacheDB)
            .filter(QueryCacheDB.query_hash == query_hash)
            .filter(QueryCacheDB.expires_at > now)
            .first()
        )
        if row and row.result_json is not None:
            _redis.setex(cache_key, settings.query_cache_ttl_seconds, json.dumps(row.result_json))
            cls._record_cache_hit(db, dataset_id, query_hash)
            return row.result_json, True

        return None, False

    @classmethod
    def set(cls, db: Session, dataset_id: str, user_id: str | None, query: str, result: Any, execution_time_ms: int) -> None:
        if not settings.enable_query_cache:
            return

        cache_key, query_hash = cls.get_cache_key(dataset_id, query)
        _redis.setex(cache_key, settings.query_cache_ttl_seconds, json.dumps(result))

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=settings.query_cache_ttl_seconds)

        existing = db.query(QueryCacheDB).filter(QueryCacheDB.query_hash == query_hash).first()
        if existing:
            existing.result_json = result
            existing.result_row_count = len(result) if isinstance(result, list) else 0
            existing.execution_time_ms = execution_time_ms
            existing.expires_at = expires_at
            existing.last_accessed_at = now
        else:
            db.add(
                QueryCacheDB(
                    id=hashlib.md5(f"{dataset_id}:{now.isoformat()}".encode("utf-8")).hexdigest(),
                    dataset_id=dataset_id,
                    user_id=user_id,
                    query_hash=query_hash,
                    query_sql=query,
                    result_json=result,
                    result_row_count=len(result) if isinstance(result, list) else 0,
                    execution_time_ms=execution_time_ms,
                    expires_at=expires_at,
                    last_accessed_at=now,
                )
            )

        cls._touch_dataset(db, dataset_id)
        db.commit()

    @classmethod
    def clear_dataset_cache(cls, db: Session, dataset_id: str) -> None:
        for key in _redis.scan_iter(match=f"query:{dataset_id}:*"):
            _redis.delete(key)
        db.query(QueryCacheDB).filter(QueryCacheDB.dataset_id == dataset_id).delete()
        db.commit()

    @classmethod
    def clean_expired(cls, db: Session) -> int:
        now = datetime.now(timezone.utc)
        deleted = db.query(QueryCacheDB).filter(QueryCacheDB.expires_at <= now).delete()
        db.commit()
        return int(deleted or 0)

    @classmethod
    def stats_last_24h(cls, db: Session) -> dict[str, Any]:
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        rows = db.query(QueryCacheDB).filter(QueryCacheDB.created_at >= since).all()
        total_hits = sum(row.cache_hits for row in rows)
        avg_exec = 0
        if rows:
            total_exec = sum(row.execution_time_ms or 0 for row in rows)
            avg_exec = int(round(total_exec / len(rows)))
        hit_rate = 0
        if rows:
            hit_rate = int(round((total_hits / len(rows)) * 100))
        return {
            "last24Hours": {
                "totalQueries": len(rows),
                "cacheHits": total_hits,
                "avgExecutionTimeMs": avg_exec,
                "cacheHitRate": f"{hit_rate}%",
            }
        }

    @staticmethod
    def _record_cache_hit(db: Session, dataset_id: str, query_hash: str) -> None:
        now = datetime.now(timezone.utc)
        row = db.query(QueryCacheDB).filter(QueryCacheDB.query_hash == query_hash).first()
        if row:
            row.cache_hits = int(row.cache_hits or 0) + 1
            row.last_accessed_at = now
        QueryCacheService._touch_dataset(db, dataset_id)
        db.commit()

    @staticmethod
    def _touch_dataset(db: Session, dataset_id: str) -> None:
        now = datetime.now(timezone.utc)
        db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).update(
            {
                DatasetMetaDB.last_queried_at: now,
                DatasetMetaDB.query_count: (DatasetMetaDB.query_count + 1),
            }
        )
