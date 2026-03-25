from urllib.parse import urlparse, urlunparse
import re

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
from .config import settings


class Base(DeclarativeBase):
	pass


def _resolve_db_url(raw_url: str) -> tuple[str, bool]:
    """
    If DATABASE_URL points at Supabase's Session-mode pooler (port 5432),
    rewrite to Transaction-mode (port 6543) so the server-side pool is shared
    across all clients and the 'MaxClientsInSessionMode' cap is never hit.

    Uses regex replacement on the raw string — avoids urlparse scheme issues
    with non-standard schemes like 'postgresql+psycopg'.

    Returns (resolved_url, is_transaction_mode).
    """
    is_supabase_pooler = "pooler.supabase.com" in raw_url

    if is_supabase_pooler:
        # Replace :5432 immediately before / or end-of-netloc with :6543.
        # The pattern matches :5432 followed by / (path start) or end-of-string.
        rewritten = re.sub(r":5432(/|$)", r":6543\1", raw_url)
        is_transaction_mode = ":6543" in rewritten
        return rewritten, is_transaction_mode

    return raw_url, False


_DB_URL, _IS_TRANSACTION_MODE = _resolve_db_url(settings.database_url)

# Pool strategy:
#   - Transaction mode (port 6543): small pool — connections released after
#     each transaction back to Supabase's server-side pool.
#   - Session mode still on port 5432 (rewrite failed): NullPool — never
#     hold an idle connection so we stay under the hard cap.
#   - Any other DB (local Postgres, etc.): standard pool.
if _IS_TRANSACTION_MODE:
    engine = create_engine(
        _DB_URL,
        pool_pre_ping=True,
        pool_size=8,
        max_overflow=12,
        pool_recycle=300,
        pool_timeout=15,
    )
elif "pooler.supabase.com" in _DB_URL:
    # Session-mode fallback: one DBAPI connection per request, released immediately.
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
