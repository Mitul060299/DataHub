from urllib.parse import urlparse, urlunparse

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
from .config import settings


class Base(DeclarativeBase):
	pass


def _resolve_db_url(raw_url: str) -> tuple[str, bool]:
    """
    Detect whether the DATABASE_URL points at Supabase's Session-mode pooler
    (port 5432) and, if so, rewrite it to Transaction-mode (port 6543).

    Transaction mode supports far more concurrent clients — the server-side
    pool is shared across all connections rather than one connection per client.

    Returns (resolved_url, is_transaction_mode).
    """
    parsed = urlparse(raw_url)
    host = parsed.hostname or ""
    port = parsed.port or 5432

    # Supabase pooler hostnames contain 'pooler.supabase.com'
    is_supabase_pooler = "pooler.supabase.com" in host

    if is_supabase_pooler and port == 5432:
        # Rewrite to Transaction mode port
        netloc = parsed.netloc.replace(":5432", ":6543") if ":5432" in parsed.netloc else f"{parsed.hostname}:6543"
        if parsed.username:
            user_info = parsed.netloc.split("@")[0]
            netloc = f"{user_info}@{parsed.hostname}:6543"
        resolved = urlunparse(parsed._replace(netloc=netloc))
        return resolved, True

    return raw_url, is_supabase_pooler and port == 6543


_DB_URL, _IS_TRANSACTION_MODE = _resolve_db_url(settings.database_url)

# Pool strategy:
#   - Transaction mode (port 6543): light pool — connections are short-lived
#     and released back to the server-side pool after each transaction.        
#   - Session mode  (port 5432):  use NullPool — one DBAPI connection per
#     SQLAlchemy connection request, returned immediately on close().
#     This avoids holding connections across the gunicorn worker lifetime.
#   - Any other DB (e.g. localhost Postgres): standard pool.
if _IS_TRANSACTION_MODE:
    engine = create_engine(
        _DB_URL,
        pool_pre_ping=True,
        # Keep a modest pool — 3 connections per worker is plenty for
        # Transaction mode because connections aren't held between requests.
        pool_size=3,
        max_overflow=2,
        pool_recycle=300,
        pool_timeout=30,
    )
elif "pooler.supabase.com" in _DB_URL and ":5432" in _DB_URL:
    # Fallback: we couldn't rewrite the URL (unusual) — use NullPool so we
    # never hold more than one connection at a time per request.
    engine = create_engine(_DB_URL, poolclass=NullPool, pool_pre_ping=True)
else:
    engine = create_engine(
        _DB_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        pool_recycle=600,
        pool_timeout=30,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
	db = SessionLocal()
	try:
		yield db
	finally:
		db.close()
