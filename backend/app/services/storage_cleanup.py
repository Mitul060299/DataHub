"""Reliable object-storage deletion with a retry queue.

Both the dataset and artifact delete endpoints used to call
``StorageService.delete`` in a try/except that only logged a warning on
failure.  When that warning fired the Postgres row was still gone but the
underlying S3 / R2 / Azure object lingered forever -- silent storage cost.

This module replaces that pattern with two helpers:

* :func:`safe_storage_delete` -- attempts the delete inline.  On any
  exception it enqueues a row in ``pending_storage_deletes`` so a
  background drainer can retry later.  Always returns; never raises.

* :func:`drain_pending_storage_deletes` -- callable from the APScheduler
  job (and from tests).  Walks ready rows, retries each delete with an
  exponential backoff, and either removes the queue row on success or
  pushes ``next_attempt_at`` further out on failure.

The functions intentionally accept either a live SQLAlchemy ``Session``
or open their own short-lived session so they can be invoked from request
handlers, scheduler jobs, and unit tests alike.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models_db import PendingStorageDeleteDB
from .object_storage import StorageService

logger = logging.getLogger(__name__)

# Retry policy: 5 attempts at 1m, 5m, 30m, 2h, 12h before giving up.
# Index = number of failed attempts already recorded.
_BACKOFF_SECONDS = (60, 300, 1800, 7200, 43200)
MAX_ATTEMPTS = len(_BACKOFF_SECONDS)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _next_attempt(attempts: int) -> datetime:
    idx = min(max(attempts, 0), len(_BACKOFF_SECONDS) - 1)
    return _now() + timedelta(seconds=_BACKOFF_SECONDS[idx])


def safe_storage_delete(
    storage_path: Optional[str],
    *,
    source: str = "dataset",
    db: Optional[Session] = None,
) -> bool:
    """Best-effort delete that NEVER raises and ALWAYS leaves the system
    in a recoverable state.

    Returns ``True`` if the delete succeeded immediately, ``False`` if it
    failed and was queued for retry (or if ``storage_path`` was empty).
    """
    if not storage_path:
        return True
    try:
        StorageService.delete(storage_path)
        return True
    except Exception as exc:  # noqa: BLE001 -- intentional broad catch
        logger.warning(
            "storage delete failed (%s) for %s -- queueing for retry: %s",
            source, storage_path, exc,
        )
        _enqueue_for_retry(storage_path, source=source, error=str(exc), db=db)
        return False


def _enqueue_for_retry(
    storage_path: str,
    *,
    source: str,
    error: str,
    db: Optional[Session],
) -> None:
    own_session = db is None
    session = db or SessionLocal()
    try:
        row = PendingStorageDeleteDB(
            id=str(uuid.uuid4()),
            storage_path=storage_path,
            source=source,
            attempts=0,
            last_error=error[:1000],
            next_attempt_at=_next_attempt(0),
            last_attempt_at=_now(),
        )
        session.add(row)
        if own_session:
            session.commit()
        else:
            # Caller controls the transaction -- flush so an immediate query
            # in the same request can see the row.
            session.flush()
    except Exception as enqueue_exc:  # noqa: BLE001
        # If the queue insert itself fails, log loudly but do not raise --
        # the caller is in a delete handler and the user already saw their
        # row vanish.  The orphan is logged for manual cleanup.
        logger.error(
            "could not enqueue pending storage delete for %s: %s "
            "(orphan storage object will remain)",
            storage_path, enqueue_exc,
        )
        if own_session:
            try:
                session.rollback()
            except Exception:
                pass
    finally:
        if own_session:
            try:
                session.close()
            except Exception:
                pass


def drain_pending_storage_deletes(
    *,
    db: Optional[Session] = None,
    limit: int = 50,
    now: Optional[datetime] = None,
) -> dict:
    """Pop ready rows from the queue and try each delete.

    Returns ``{"attempted": int, "succeeded": int, "failed": int,
    "abandoned": int}``.  ``abandoned`` rows have hit ``MAX_ATTEMPTS``
    and will not be retried -- they are removed from the queue and only
    a log line records them.  An ops alert can be wired to that log line
    later.
    """
    own_session = db is None
    session = db or SessionLocal()
    stats = {"attempted": 0, "succeeded": 0, "failed": 0, "abandoned": 0}
    try:
        cutoff = now or _now()
        ready = (
            session.query(PendingStorageDeleteDB)
            .filter(PendingStorageDeleteDB.next_attempt_at <= cutoff)
            .order_by(PendingStorageDeleteDB.next_attempt_at.asc())
            .limit(limit)
            .all()
        )
        for row in ready:
            stats["attempted"] += 1
            try:
                StorageService.delete(row.storage_path)
                session.delete(row)
                stats["succeeded"] += 1
            except Exception as exc:  # noqa: BLE001
                row.attempts = (row.attempts or 0) + 1
                row.last_error = str(exc)[:1000]
                row.last_attempt_at = _now()
                if row.attempts >= MAX_ATTEMPTS:
                    logger.error(
                        "abandoning storage delete after %d attempts: %s -- %s",
                        row.attempts, row.storage_path, exc,
                    )
                    session.delete(row)
                    stats["abandoned"] += 1
                else:
                    row.next_attempt_at = _next_attempt(row.attempts)
                    stats["failed"] += 1
        if own_session:
            session.commit()
        else:
            session.flush()
    except Exception as exc:  # noqa: BLE001
        logger.exception("drain_pending_storage_deletes crashed: %s", exc)
        if own_session:
            try:
                session.rollback()
            except Exception:
                pass
    finally:
        if own_session:
            try:
                session.close()
            except Exception:
                pass
    return stats


def schedule_storage_cleanup_job(scheduler) -> None:
    """Wire :func:`drain_pending_storage_deletes` into the APScheduler.

    Runs every 10 minutes.  Idempotent: replaces an existing job with the
    same id on subsequent calls (matches the pattern used by the other
    scheduler hooks in this codebase).
    """
    from apscheduler.triggers.interval import IntervalTrigger
    scheduler.add_job(
        drain_pending_storage_deletes,
        IntervalTrigger(minutes=10),
        id="storage-cleanup",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
