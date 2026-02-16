from fastapi import APIRouter
import redis

from ..config import settings

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/health/extended")
def health_extended() -> dict:
    cache_status = "disconnected"
    try:
        client = redis.Redis.from_url(settings.redis_url)
        cache_status = "connected" if client.ping() else "disconnected"
    except Exception:
        cache_status = "disconnected"

    return {
        "status": "ok",
        "storage": settings.storage_provider,
        "cache": cache_status,
        "duckdb": "ready",
    }
