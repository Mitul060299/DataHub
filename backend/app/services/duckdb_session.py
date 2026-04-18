"""
DuckDB Session Manager
Maintains a module-level dict of persistent in-memory DuckDB connections
keyed by session_id (f"{user_id}:{chat_session_id}").

Connections older than max_age_seconds are removed on every get_connection call
to prevent memory leaks on long-running Render instances.
"""
from __future__ import annotations

import hashlib
import os
import re
import tempfile
import time
import threading
import concurrent.futures
from pathlib import Path
from typing import Optional

# ── Disk persistence ─────────────────────────────────────────────────────────
# Each session gets a `.duckdb` file on disk so VIEWs survive process restarts
# and brief Render free-tier suspensions.  Set DUCKDB_SESSION_DIR=":memory:" to
# fall back to the legacy in-memory behaviour (faster but loses state on any
# process restart, requiring a full PipelineStepDB replay on the next request).
_SESSION_DIR_ENV = os.environ.get("DUCKDB_SESSION_DIR", "").strip()
if _SESSION_DIR_ENV == ":memory:":
    _SESSION_DIR: Optional[Path] = None
else:
    _SESSION_DIR = Path(_SESSION_DIR_ENV) if _SESSION_DIR_ENV else (
        Path(tempfile.gettempdir()) / "datahub_duckdb_sessions"
    )
    try:
        _SESSION_DIR.mkdir(parents=True, exist_ok=True)
    except Exception:
        # Disk unavailable (read-only FS, permissions) — fall back to in-memory.
        _SESSION_DIR = None


def _session_db_path(session_id: str) -> Optional[Path]:
    """Return the on-disk path for *session_id*, or None if persistence is off."""
    if _SESSION_DIR is None:
        return None
    # session_id typically looks like "user_id:chat_session_id" — colons are
    # unsafe on Windows.  Hash to keep filenames short and filesystem-safe.
    digest = hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:32]
    return _SESSION_DIR / f"sess_{digest}.duckdb"


def _delete_session_file(session_id: str) -> None:
    """Best-effort delete of the on-disk session db (and its WAL sidecar)."""
    p = _session_db_path(session_id)
    if p is None:
        return
    for path in (p, p.with_suffix(p.suffix + ".wal")):
        try:
            if path.exists():
                path.unlink()
        except Exception:
            pass

# Maximum seconds a single DuckDB query may run before being cancelled.
# Override via DUCKDB_QUERY_TIMEOUT_S env var (0 = disabled).
QUERY_TIMEOUT_SECONDS: int = int(os.environ.get("DUCKDB_QUERY_TIMEOUT_S", "60"))

# SQL operations that the LLM must never issue against session data.
# Blocking is enforced at execute_in_session(); internal helpers that
# deliberately create/drop objects call conn.execute() directly.
_BLOCKED_DML = re.compile(
    r"^\s*(DROP\s|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\w|TRUNCATE)",
    re.IGNORECASE | re.MULTILINE,
)

# duckdb is imported lazily inside get_connection() so the ~100 MB native
# library is not loaded into process RSS until the first AI pipeline query.
# Type annotations stay correct because this file uses `from __future__ import
# annotations` (all annotations are treated as strings at runtime).

_lock = threading.Lock()
_sessions: dict[str, duckdb.DuckDBPyConnection] = {}
_last_used: dict[str, float] = {}

MAX_SESSION_AGE_SECONDS = 1800  # 30 minutes — comfortable on 2 GB Standard
_CLEANUP_INTERVAL_SECONDS = 300  # run background cleanup every 5 minutes

# Hard cap on concurrent open DuckDB sessions.  Each session can use up to
# 256 MB (SET memory_limit below).  8 sessions × 256 MB = 2 GB max, but
# realistic peak on a single-worker instance is 3-4 concurrent users.
# The oldest-idle session is evicted when this limit would be exceeded.
_MAX_SESSIONS: int = int(os.environ.get("DUCKDB_MAX_SESSIONS", "8"))

# Evict oldest sessions aggressively when process RSS exceeds this.
# Set to 1400 MB (70% of a 2 GB Render Standard instance) so eviction fires
# well before the OS OOM-killer fires at 2048 MB.
# Override via DUCKDB_HIGH_MEMORY_MB env var to match your instance tier.
_HIGH_MEMORY_THRESHOLD_MB: float = float(os.environ.get("DUCKDB_HIGH_MEMORY_MB", "1400"))

# Under pressure: evict sessions idle longer than this many seconds.
# 300 s = 5 minutes on 2 GB — less aggressive than the 512 MB era.
_HIGH_PRESSURE_TTL_SECONDS: int = int(os.environ.get("DUCKDB_HIGH_PRESSURE_TTL_S", "300"))


class SessionExpiredError(RuntimeError):
    """Raised when a session connection is lost or has been cleaned up."""


class QueryTimeoutError(RuntimeError):
    """Raised when a DuckDB query exceeds QUERY_TIMEOUT_SECONDS."""


class BlockedSQLError(ValueError):
    """Raised when LLM-generated SQL contains a forbidden write operation."""


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
        # Use a very short TTL under pressure to free memory fast and prevent
        # the heap-corruption crash ("corrupted size vs. prev_size").
        effective_ttl = _HIGH_PRESSURE_TTL_SECONDS
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
        _delete_session_file(sid)
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
                    "Your AI session has expired (server restarted or memory was reclaimed). "
                    "Please re-run your pipeline steps to restore the session, then try again."
                )

        # Enforce the concurrent-session cap before creating a new connection.
        # If at the limit, evict the oldest-idle session to make room.
        if len(_sessions) >= _MAX_SESSIONS:
            oldest_sid = min(_last_used, key=_last_used.get)  # type: ignore[arg-type]
            try:
                old = _sessions.pop(oldest_sid, None)
                if old is not None:
                    old.close()
            except Exception:
                pass
            _last_used.pop(oldest_sid, None)
            _delete_session_file(oldest_sid)

        # Create a new connection.  Disk-backed by default so VIEWs survive
        # process restarts; falls back to :memory: when DUCKDB_SESSION_DIR=:memory:
        # or when the chosen directory is unwritable.
        # 256 MB per session — comfortable on the 2 GB Standard instance.
        # DuckDB throws a catchable OutOfMemoryError instead of corrupting the heap.
        import duckdb  # lazy import — defers ~100 MB native library load until first AI query
        _db_path = _session_db_path(session_id)
        _db_target = str(_db_path) if _db_path is not None else ":memory:"
        try:
            new_conn = duckdb.connect(database=_db_target)
        except Exception as _disk_exc:
            # Disk file may be corrupt (killed mid-write) — remove it and retry
            # in-memory so the user is never left without a working session.
            import logging as _dlog
            _dlog.getLogger(__name__).warning(
                "DUCKDB_DISK_OPEN_FAILED: %s — falling back to in-memory", _disk_exc,
            )
            if _db_path is not None:
                try:
                    _db_path.unlink(missing_ok=True)
                except Exception:
                    pass
            new_conn = duckdb.connect(database=":memory:")
        new_conn.execute("SET memory_limit='256MB'")
        try:
            new_conn.execute("SET threads=1")
        except Exception:
            pass
        # Install/load httpfs so views over S3/HTTPS-signed-URL parquet files work.
        try:
            new_conn.execute("INSTALL httpfs;")
            new_conn.execute("LOAD httpfs;")
        except Exception:
            pass
        # Mirror DuckDBService storage-credential configuration so session views
        # can reach the same S3/R2 bucket that uploaded the parquet files.
        try:
            from ..config import settings as _settings
            _provider = (_settings.storage_provider or "local").lower()
            if _provider == "r2":
                new_conn.execute(
                    "SET s3_endpoint=?",
                    [f"{_settings.r2_account_id}.r2.cloudflarestorage.com"],
                )
                new_conn.execute("SET s3_access_key_id=?", [_settings.r2_access_key_id])
                new_conn.execute("SET s3_secret_access_key=?", [_settings.r2_secret_access_key])
                new_conn.execute("SET s3_url_style='path'")
            elif _provider == "s3":
                new_conn.execute("SET s3_region=?", [_settings.s3_region])
                new_conn.execute("SET s3_access_key_id=?", [_settings.s3_access_key_id])
                new_conn.execute("SET s3_secret_access_key=?", [_settings.s3_secret_access_key])
        except Exception:
            pass
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
    _delete_session_file(session_id)


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
    """Run *sql* on the session connection and return rows as list[dict].

    Raises:
        BlockedSQLError  — if *sql* contains a forbidden write-DML operation.
        QueryTimeoutError — if execution exceeds QUERY_TIMEOUT_SECONDS.
    """
    # ── 1. DML guard ────────────────────────────────────────────────────────
    # Strip leading line comments before pattern-matching so a comment
    # line cannot shadow a DROP/DELETE that follows it.
    _stripped = re.sub(r"^\s*--[^\n]*\n", "", sql, flags=re.MULTILINE).lstrip()
    if _BLOCKED_DML.match(_stripped):
        raise BlockedSQLError(
            f"Blocked SQL operation: write DML is not permitted in agent steps. "
            f"Starts with: {_stripped[:80]!r}"
        )

    # ── 2. Execute with timeout ─────────────────────────────────────────────
    conn = get_connection(session_id)

    def _run() -> list[dict]:
        rel = conn.execute(sql)
        columns = [desc[0] for desc in rel.description]
        return [{col: _coerce(val) for col, val in zip(columns, row)} for row in rel.fetchall()]

    if QUERY_TIMEOUT_SECONDS <= 0:
        # Timeout disabled — run inline (avoids thread overhead).
        return _run()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as _pool:
        _future = _pool.submit(_run)
        try:
            return _future.result(timeout=QUERY_TIMEOUT_SECONDS)
        except concurrent.futures.TimeoutError:
            # Signal DuckDB to abort the running query, then surface a clean error.
            try:
                conn.interrupt()
            except Exception:
                pass
            raise QueryTimeoutError(
                f"Query exceeded the {QUERY_TIMEOUT_SECONDS}s time limit and was cancelled. "
                "Try a more specific filter or a smaller dataset."
            )


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
