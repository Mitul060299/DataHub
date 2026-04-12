import os
import time

from fastapi import APIRouter
import redis

from ..config import settings

router = APIRouter()

_START_TIME = time.monotonic()


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


@router.get("/health/memory")
def health_memory() -> dict:
    """Diagnostic endpoint: process memory, open DuckDB sessions, MemorySaver thread count."""
    try:
        import psutil
        proc = psutil.Process(os.getpid())
        rss_mb = proc.memory_info().rss / 1024 / 1024
    except Exception:
        rss_mb = -1

    try:
        from ..services.duckdb_session import _sessions
        duckdb_sessions = len(_sessions)
    except Exception:
        duckdb_sessions = -1

    try:
        from ..services.agent.graph import agent_graph
        memsaver_threads = len(agent_graph.checkpointer.storage)
    except Exception:
        memsaver_threads = -1

    uptime_seconds = int(time.monotonic() - _START_TIME)

    return {
        "status": "ok",
        "rss_mb": round(rss_mb, 1),
        "duckdb_sessions": duckdb_sessions,
        "memsaver_threads": memsaver_threads,
        "uptime_seconds": uptime_seconds,
    }
