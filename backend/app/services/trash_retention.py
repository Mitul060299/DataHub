"""Soft-delete retention sweep.

Datasets soft-deleted via ``DELETE /datasets/{id}`` (without ``?hard=true``)
have their ``deleted_at`` column set instead of being destroyed. They live in
the user-visible **Trash** (``GET /datasets/trash``) and can be recovered with
``POST /datasets/{id}/restore``.

This module purges items whose ``deleted_at`` is older than the configured
retention window (default: 30 days). A purged dataset is hard-deleted via the
same code path used by ``DELETE /datasets/{id}?hard=true`` -- meta row, data
chunks, linked artifacts, and storage objects all go.

The sweep is scheduled by APScheduler (see ``schedule_trash_retention_job``)
and is idempotent / safe to invoke from tests directly.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models_db import (
    ArtifactDB,
    DatasetChunkDB,
    DatasetDataDB,
    DatasetMetaDB,
)
from .event_log import emit_event
from .storage_cleanup import safe_storage_delete

logger = logging.getLogger(__name__)


def _retention_days() -> int:
    """Days to keep a soft-deleted dataset before permanent purge.

    Configurable via ``TRASH_RETENTION_DAYS``. Defaults to 30 days.
    """
    raw = os.getenv("TRASH_RETENTION_DAYS", "30")
    try:
        days = int(raw)
    except (TypeError, ValueError):
        return 30
    return max(1, days)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def purge_expired_trash(
    *,
    db: Optional[Session] = None,
    retention_days: Optional[int] = None,
    now: Optional[datetime] = None,
    limit: int = 100,
) -> dict:
    """Hard-delete datasets whose ``deleted_at`` is older than retention.

    Returns ``{"scanned": int, "purged": int, "errors": int}``.
    """
    own_session = db is None
    session = db or SessionLocal()
    days = retention_days if retention_days is not None else _retention_days()
    cutoff = (now or _now()) - timedelta(days=days)
    stats = {"scanned": 0, "purged": 0, "errors": 0}
    try:
        expired = (
            session.query(DatasetMetaDB)
            .filter(DatasetMetaDB.deleted_at.isnot(None))
            .filter(DatasetMetaDB.deleted_at <= cutoff)
            .order_by(DatasetMetaDB.deleted_at.asc())
            .limit(limit)
            .all()
        )
        stats["scanned"] = len(expired)
        for meta in expired:
            try:
                _purge_one(session, meta, retention_days=days)
                stats["purged"] += 1
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "purge_expired_trash: failed to purge %s: %s", meta.id, exc
                )
                stats["errors"] += 1
                # Roll back this single failure but keep going on the rest.
                try:
                    session.rollback()
                except Exception:
                    pass
        if own_session:
            session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.exception("purge_expired_trash crashed: %s", exc)
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


def _purge_one(session: Session, meta: DatasetMetaDB, *, retention_days: int) -> None:
    """Hard-delete a single trashed dataset (mirrors ``?hard=true`` flow)."""
    dataset_id = meta.id
    user_id = getattr(meta, "user_id", None)
    workspace_id = getattr(meta, "workspace_id", None)
    name = getattr(meta, "name", None)

    storage_paths: list[tuple[str, str]] = []
    if meta.storage_path:
        storage_paths.append((meta.storage_path, "dataset"))
        session.query(ArtifactDB).filter(
            ArtifactDB.s3_key == meta.storage_path
        ).delete(synchronize_session=False)

    # Children (one level) — purge any that are also trashed.
    from .persistence_policy import lineage_children
    child_ids_from_edges = lineage_children(session, dataset_id)
    child_metas = (
        session.query(DatasetMetaDB)
        .filter(DatasetMetaDB.id.in_(child_ids_from_edges))
        .all()
        if child_ids_from_edges
        else []
    )
    purged_child_ids: list[str] = []
    for child in child_metas:
        if child.deleted_at is None:
            # Active child — leave it alone (parent_id will dangle, but
            # downstream code already tolerates orphan children).
            continue
        if child.storage_path:
            storage_paths.append((child.storage_path, "child"))
            session.query(ArtifactDB).filter(
                ArtifactDB.s3_key == child.storage_path
            ).delete(synchronize_session=False)
        purged_child_ids.append(child.id)

    if purged_child_ids:
        session.query(DatasetDataDB).filter(
            DatasetDataDB.id.in_(purged_child_ids)
        ).delete(synchronize_session=False)
        session.query(DatasetChunkDB).filter(
            DatasetChunkDB.dataset_id.in_(purged_child_ids)
        ).delete(synchronize_session=False)
        session.query(DatasetMetaDB).filter(
            DatasetMetaDB.id.in_(purged_child_ids)
        ).delete(synchronize_session=False)

    session.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).delete()
    session.query(DatasetDataDB).filter(DatasetDataDB.id == dataset_id).delete()
    session.query(DatasetChunkDB).filter(
        DatasetChunkDB.dataset_id == dataset_id
    ).delete()

    # Clean up lineage edges for everything we purged so they don't dangle.
    from ..models_db import DatasetLineageEdgeDB
    purged_ids = [dataset_id] + list(purged_child_ids)
    session.query(DatasetLineageEdgeDB).filter(
        (DatasetLineageEdgeDB.child_id.in_(purged_ids))
        | (DatasetLineageEdgeDB.parent_id.in_(purged_ids))
    ).delete(synchronize_session=False)

    for path, source in storage_paths:
        safe_storage_delete(path, source=source, db=session)

    try:
        emit_event(
            session,
            event_type="dataset_purged",
            user_id=user_id,
            workspace_id=workspace_id,
            payload={
                "dataset_id": dataset_id,
                "name": name,
                "purged_child_count": len(purged_child_ids),
                "retention_days": retention_days,
                "reason": "trash_retention_expired",
            },
        )
    except Exception:
        pass


def schedule_trash_retention_job(scheduler) -> None:
    """Wire :func:`purge_expired_trash` into APScheduler.

    Runs every 6 hours. Idempotent: replaces an existing job with the same id.
    """
    from apscheduler.triggers.interval import IntervalTrigger
    scheduler.add_job(
        purge_expired_trash,
        IntervalTrigger(hours=6),
        id="trash-retention-sweep",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
