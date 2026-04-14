"""
DuckDB Session Manager
Maintains a module-level dict of persistent in-memory DuckDB connections
keyed by session_id (f"{user_id}:{chat_session_id}").

Connections older than max_age_seconds are removed on every get_connection call
to prevent memory leaks on long-running Render instances.
"""
from __future__ import annotations

import os
import time
import threading
from typing import Optional

import duckdb

_lock = threading.Lock()
_sessions: dict[str, duckdb.DuckDBPyConnection] = {}
_last_used: dict[str, float] = {}

MAX_SESSION_AGE_SECONDS = 1800  # 30 minutes
_CLEANUP_INTERVAL_SECONDS = 900  # run background cleanup every 15 minutes

# Evict oldest sessions more aggressively when process RSS exceeds this.
# Default 400 MB = 80 % of a 512 MB Render instance.
# Override via DUCKDB_HIGH_MEMORY_MB env var to match your instance tier.
_HIGH_MEMORY_THRESHOLD_MB: float = float(os.environ.get("DUCKDB_HIGH_MEMORY_MB", "400"))


class SessionExpiredError(RuntimeError):
    """Raised when a session connection is lost or has been cleaned up."""


def _process_rss_mb() -> float:
    """Return current process RSS in MB, or -1 if psutil is unavailable."""
    try:
        import psutil
        return psutil.Process(os.getpid()).memory_info().rss / 1024 / 1024
    except Exception:
        return -1.0


def _cleanup_stale(max_age_seconds: int = MAX_SESSION_AGE_SECONDS) -> int:
    """Remove sessions unused for longer than max_age_seconds.

    Under memory pressure (RSS > _HIGH_MEMORY_THRESHOLD_MB) the effective TTL
    is halved so oldest sessions are evicted before the OS OOM-killer fires.

    Returns the number of sessions evicted.
    """
    import logging as _logging
    _logger = _logging.getLogger(__name__)

    rss_mb = _process_rss_mb()
    effective_ttl = max_age_seconds
    if rss_mb > 0 and rss_mb > _HIGH_MEMORY_THRESHOLD_MB:
        effective_ttl = max_age_seconds // 2
        _logger.warning(
            "DUCKDB_HIGH_MEMORY_PRESSURE: RSS=%.1f MB > threshold=%.0f MB — "
            "evicting sessions idle > %ds (normal TTL %ds)",
            rss_mb, _HIGH_MEMORY_THRESHOLD_MB, effective_ttl, max_age_seconds,
        )

    now = time.monotonic()
    stale = [sid for sid, ts in _last_used.items() if now - ts > effective_ttl]
    for sid in stale:
        try:
            conn = _sessions.pop(sid, None)
            if conn is not None:
                conn.close()
        except Exception:
            pass
        _last_used.pop(sid, None)
    return len(stale)


def get_connection(session_id: str) -> duckdb.DuckDBPyConnection:
    """
    Return the persistent DuckDB connection for *session_id*, creating it if
    it does not yet exist.  Raises SessionExpiredError with a user-friendly
    message if the connection was garbage-collected or forcibly closed.
    """
    with _lock:
        _cleanup_stale()

        conn = _sessions.get(session_id)
        if conn is not None:
            # Quick sanity-check — a GC'd connection raises on any call
            try:
                conn.execute("SELECT 1")
                _last_used[session_id] = time.monotonic()
                return conn
            except Exception:
                _sessions.pop(session_id, None)
                _last_used.pop(session_id, None)
                raise SessionExpiredError(
                    "Your workspace session has expired. "
                    "Please re-upload your files to start a new session."
                )

        # Create a new in-memory connection.
        # The memory limit prevents a runaway query from OOM-killing the whole
        # OS process — DuckDB throws a catchable exception instead.
        new_conn = duckdb.connect(database=":memory:")
        new_conn.execute("SET memory_limit='256MB'")
        _sessions[session_id] = new_conn
        _last_used[session_id] = time.monotonic()
        return new_conn


def close_session(session_id: str) -> None:
    """Explicitly tear down a session and release its connection."""
    with _lock:
        conn = _sessions.pop(session_id, None)
        _last_used.pop(session_id, None)
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def register_view(session_id: str, view_name: str, parquet_path: str) -> None:
    """
    Register a source file as a lazy DuckDB VIEW in the session so it can be
    queried by name without materialising all rows up-front.
    """
    conn = get_connection(session_id)
    conn.execute(
        f"CREATE OR REPLACE VIEW {view_name} AS "
        f"SELECT * FROM read_parquet('{parquet_path}')"
    )


def register_table_from_sql(session_id: str, table_name: str, sql: str) -> int:
    """
    Materialise a derived table from *sql* into the session connection and
    return the resulting row count.
    """
    conn = get_connection(session_id)
    conn.execute(f"CREATE OR REPLACE TABLE {table_name} AS {sql}")
    result = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
    return int(result[0]) if result else 0


def register_view_from_sql(session_id: str, view_name: str, sql: str) -> None:
    """Create a lazy VIEW from a SQL expression — zero RAM, deferred execution."""
    conn = get_connection(session_id)
    conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS {sql}")


def drop_table_or_view(session_id: str, name: str) -> None:
    """Drop a table or view from the session, ignoring errors if it doesn't exist."""
    try:
        conn = get_connection(session_id)
        conn.execute(f"DROP TABLE IF EXISTS {name}")
        conn.execute(f"DROP VIEW IF EXISTS {name}")
    except Exception:
        pass


def _coerce(value: object) -> object:
    """Convert DuckDB native C-extension types to plain Python JSON-safe types.

    DuckDB returns int64/uint64/Decimal/date/timestamp as non-standard objects
    that may pass isinstance(x, int) but still fail json.dumps on some builds.
    Coerce them all to plain Python primitives here so every caller is safe.
    """
    if value is None:
        return None
    t = type(value).__name__
    if t in ("int", "int8", "int16", "int32", "int64",
             "uint8", "uint16", "uint32", "uint64", "hugeint"):
        return int(value)
    if t in ("float", "float32", "float64", "double", "Decimal"):
        import math as _math
        v = float(value)
        return None if (_math.isnan(v) or _math.isinf(v)) else v
    if t in ("date", "time", "datetime", "timestamp", "timedelta", "interval"):
        return str(value)
    if isinstance(value, (list, tuple)):
        return [_coerce(item) for item in value]
    if isinstance(value, dict):
        return {k: _coerce(v) for k, v in value.items()}
    return value


def execute_in_session(session_id: str, sql: str) -> list[dict]:
    """Run *sql* on the session connection and return rows as list[dict]."""
    conn = get_connection(session_id)
    rel = conn.execute(sql)
    columns = [desc[0] for desc in rel.description]
    return [{col: _coerce(val) for col, val in zip(columns, row)} for row in rel.fetchall()]


def table_exists(session_id: str, name: str) -> bool:
    """Return True if *name* is a known table or view in the session."""
    try:
        conn = get_connection(session_id)
        result = conn.execute(
            "SELECT COUNT(*) FROM duckdb_tables() WHERE table_name = ? "
            "UNION ALL "
            "SELECT COUNT(*) FROM duckdb_views() WHERE view_name = ?",
            [name, name],
        ).fetchall()
        return any(r[0] > 0 for r in result)
    except Exception:
        return False


# ── Background cleanup thread ─────────────────────────────────────────────────
# Without this, _cleanup_stale() only ran when a *new* session was opened.
# Idle sessions after their 2-hour TTL were never reclaimed on quiet instances.

def get_session_stats() -> dict:
    """Point-in-time snapshot of session manager state.

    Used by GET /health/sessions.  Safe to call from any thread.
    """
    now = time.monotonic()
    with _lock:
        active = len(_sessions)
        ages = [now - ts for ts in _last_used.values()]
    oldest_minutes = round(max(ages) / 60, 1) if ages else 0.0
    rss_mb = _process_rss_mb()
    return {
        "active_sessions": active,
        "oldest_session_age_minutes": oldest_minutes,
        "process_rss_mb": round(rss_mb, 1) if rss_mb >= 0 else None,
        "high_memory_threshold_mb": _HIGH_MEMORY_THRESHOLD_MB,
        "under_memory_pressure": (rss_mb > 0 and rss_mb > _HIGH_MEMORY_THRESHOLD_MB),
        "session_ttl_seconds": MAX_SESSION_AGE_SECONDS,
        "cleanup_interval_seconds": _CLEANUP_INTERVAL_SECONDS,
    }


def _cleanup_loop() -> None:
    import logging as _logging
    _logger = _logging.getLogger(__name__)
    while True:
        time.sleep(_CLEANUP_INTERVAL_SECONDS)
        try:
            with _lock:
                before = len(_sessions)
            evicted = _cleanup_stale()
            rss_mb = _process_rss_mb()
            with _lock:
                after = len(_sessions)
            # Always log every run — if this line is absent in Render logs after
            # 15 min the thread has died silently; redeploy to recover.
            _logger.info(
                "DUCKDB_CLEANUP_RUN: evicted=%d active=%d rss_mb=%.1f pressure=%s",
                evicted, after,
                rss_mb if rss_mb >= 0 else -1,
                str(rss_mb > 0 and rss_mb > _HIGH_MEMORY_THRESHOLD_MB),
            )
        except Exception as exc:
            _logging.getLogger(__name__).warning(
                "DUCKDB_CLEANUP_ERROR: cleanup thread iteration failed: %s", exc
            )


threading.Thread(target=_cleanup_loop, daemon=True, name="duckdb-session-cleanup").start()
