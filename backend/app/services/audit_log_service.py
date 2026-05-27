"""audit_log service — write and read structured audit events.

Design notes
------------
* ``log_event()`` is the only write path.  It is intentionally non-blocking:
  audit log failures are swallowed so they never break the primary request.
* Reads are paged with cursor-based pagination (``before_id``).
* The ``audit_logs`` table uses the AuditLogDB model (models_db.py).
  Column mapping:
    action   → event_type  (e.g. "ai_command_run")
    actor    → user_id     (who triggered the event)
    target   → description (human-readable target resource)
    metadata_→ event_data  (event-specific JSON payload)
    project_id → project_id (FK → projects, nullable)
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models_db import AuditLogDB

logger = logging.getLogger(__name__)

# Recognised event types (open list — new callers can add their own)
EVENT_AI_COMMAND = "ai_command_run"
EVENT_PIPELINE_RUN = "pipeline_run"
EVENT_DATASET_UPLOAD = "dataset_upload"
EVENT_COLLABORATOR_INVITED = "collaborator_invited"
EVENT_COLLABORATOR_REMOVED = "collaborator_removed"
EVENT_USER_LOGIN = "user_login"
EVENT_PLAN_CHANGED = "plan_changed"
EVENT_SCHEDULED_JOB = "scheduled_job_triggered"


def log_event(
    db: Session,
    *,
    user_id: str,
    event_type: str,
    target: str,
    project_id: str | None = None,
    event_data: dict[str, Any] | None = None,
) -> None:
    """Write an audit event, swallowing all errors so callers are not disrupted."""
    try:
        entry = AuditLogDB(
            id=str(uuid.uuid4()),
            action=event_type,
            actor=user_id,
            target=target,
            project_id=project_id,
            metadata_=event_data or {},
        )
        db.add(entry)
        db.flush()
    except Exception:
        logger.warning("audit_log: failed to write event %s for user %s", event_type, user_id, exc_info=True)
        db.rollback()


def list_events(
    db: Session,
    *,
    user_id: str,
    project_id: str | None = None,
    event_type: str | None = None,
    limit: int = 50,
    before_id: str | None = None,
) -> list[dict[str, Any]]:
    """Return up to ``limit`` audit events for ``user_id``, newest first."""
    query = db.query(AuditLogDB).filter(AuditLogDB.actor == user_id)
    if project_id:
        query = query.filter(AuditLogDB.project_id == project_id)
    if event_type:
        query = query.filter(AuditLogDB.action == event_type)
    if before_id:
        # cursor: fetch rows older than the row with id=before_id
        anchor = db.query(AuditLogDB.created_at).filter(AuditLogDB.id == before_id).scalar()
        if anchor:
            query = query.filter(AuditLogDB.created_at < anchor)
    query = query.order_by(AuditLogDB.created_at.desc()).limit(min(limit, 200))
    rows = query.all()
    return [
        {
            "id": r.id,
            "event_type": r.action,
            "user_id": r.actor,
            "target": r.target,
            "project_id": r.project_id,
            "event_data": r.metadata_,
            "created_at": r.created_at.isoformat() if isinstance(r.created_at, datetime) else r.created_at,
        }
        for r in rows
    ]
