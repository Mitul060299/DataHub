"""Per-step Parquet snapshot retention sweep.

``StepEngine.snapshot_to_parquet`` writes a Parquet file to object storage
after every successful pipeline step and stores the path on
``PipelineStepDB.snapshot_path``.  These snapshots are an O(1) replay
optimisation -- they are *transient* data, not user-visible artifacts.

Without a sweep they accumulate forever and dominate storage cost for any
active user.  This module purges snapshots that are either:

  1. Older than ``SNAPSHOT_RETENTION_DAYS`` (default 30) -- the safety
     net for stale sessions, or
  2. Beyond the most recent ``SNAPSHOT_KEEP_PER_SESSION`` (default 20)
     entries within a session -- the per-dataset cap that bounds storage
     growth for active users.

The actual S3/GCS/Azure delete is best-effort via ``safe_storage_delete``
which queues retries on failure; we always NULL the ``snapshot_path``
column so the row is never re-attempted on the next sweep.

Replay logic in ``_replay_session_views`` already falls back to
re-executing ``duckdb_sql`` when ``snapshot_path`` is missing, so an
evicted snapshot is correctness-safe -- only slower to restore.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models_db import PipelineStepDB
from .storage_cleanup import safe_storage_delete

logger = logging.getLogger(__name__)


def _retention_days() -> int:
    raw = os.getenv("SNAPSHOT_RETENTION_DAYS", "30")
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return 30


def _keep_per_session() -> int:
    raw = os.getenv("SNAPSHOT_KEEP_PER_SESSION", "20")
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return 20


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _evict(step: PipelineStepDB, *, source: str, db: Session) -> bool:
    """Drop the storage object and NULL the path on the row.

    Returns True if the storage delete succeeded immediately, False if it
    was queued for retry.  In both cases the column is cleared so the row
    is not re-scanned on the next sweep.
    """
    path = step.snapshot_path
    step.snapshot_path = None
    if not path:
        return True
    return safe_storage_delete(path, source=source, db=db)


def purge_old_snapshots(
    *,
    db: Optional[Session] = None,
    retention_days: Optional[int] = None,
    keep_per_session: Optional[int] = None,
    now: Optional[datetime] = None,
    limit: int = 500,
) -> dict:
    """Sweep step snapshots, returning ``{scanned, purged, errors}``.

    Two passes:
      1. **TTL pass** -- evict every row whose ``snapshot_path`` is older
         than the retention cutoff.  This bounds storage for abandoned
         sessions.
      2. **Cap pass** -- for sessions that still have more than the
         configured cap of snapshots, evict the oldest entries beyond
         the cap.

    ``limit`` bounds the total number of evictions per invocation so the
    sweep stays bounded regardless of backlog.
    """
    own_session = db is None
    session = db or SessionLocal()
    days = retention_days if retention_days is not None else _retention_days()
    cap = keep_per_session if keep_per_session is not None else _keep_per_session()
    cutoff = (now or _now()) - timedelta(days=days)
    stats = {"scanned": 0, "purged": 0, "errors": 0}

    try:
        # ------------------------------------------------------------ TTL
        ttl_rows = (
            session.query(PipelineStepDB)
            .filter(PipelineStepDB.snapshot_path.isnot(None))
            .filter(PipelineStepDB.created_at < cutoff)
            .order_by(PipelineStepDB.created_at.asc())
            .limit(limit)
            .all()
        )
        for step in ttl_rows:
            stats["scanned"] += 1
            try:
                if _evict(step, source="pipeline_snapshot_ttl", db=session):
                    stats["purged"] += 1
                else:
                    # safe_storage_delete queued a retry; NULL was still set
                    stats["purged"] += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "purge_old_snapshots TTL: eviction failed for step %s: %s",
                    step.id, exc,
                )
                stats["errors"] += 1

        # ------------------------------------------------------------ Cap
        remaining = max(0, limit - stats["scanned"])
        if remaining > 0:
            over_cap_sessions = (
                session.query(
                    PipelineStepDB.session_id,
                    func.count(PipelineStepDB.id).label("n"),
                )
                .filter(PipelineStepDB.snapshot_path.isnot(None))
                .filter(PipelineStepDB.session_id.isnot(None))
                .group_by(PipelineStepDB.session_id)
                .having(func.count(PipelineStepDB.id) > cap)
                .all()
            )
            for sid, _n in over_cap_sessions:
                if remaining <= 0:
                    break
                rows = (
                    session.query(PipelineStepDB)
                    .filter(PipelineStepDB.session_id == sid)
                    .filter(PipelineStepDB.snapshot_path.isnot(None))
                    .order_by(
                        PipelineStepDB.step_number.desc(),
                        PipelineStepDB.created_at.desc(),
                    )
                    .all()
                )
                # Keep the most recent ``cap`` entries; evict the rest.
                for step in rows[cap:]:
                    if remaining <= 0:
                        break
                    stats["scanned"] += 1
                    remaining -= 1
                    try:
                        _evict(step, source="pipeline_snapshot_cap", db=session)
                        stats["purged"] += 1
                    except Exception as exc:  # noqa: BLE001
                        logger.warning(
                            "purge_old_snapshots cap: eviction failed for step %s: %s",
                            step.id, exc,
                        )
                        stats["errors"] += 1

        if own_session:
            session.commit()
        else:
            session.flush()
    except Exception as exc:  # noqa: BLE001
        logger.exception("purge_old_snapshots crashed: %s", exc)
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


def schedule_snapshot_retention_job(scheduler) -> None:
    """Wire :func:`purge_old_snapshots` into APScheduler.

    Runs every hour. Idempotent: replaces an existing job with the same id.
    """
    from apscheduler.triggers.interval import IntervalTrigger
    scheduler.add_job(
        purge_old_snapshots,
        IntervalTrigger(hours=1),
        id="snapshot-retention-sweep",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
