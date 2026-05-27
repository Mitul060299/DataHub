"""Audit Log router — Expert-plan-only endpoint.

GET /audit-log
  Returns the calling user's audit events, newest first.
  Paginated via ``limit`` and ``before_id`` (cursor pagination).
  Requires Expert plan; returns 403 for Starter / Professional.

Query params:
  limit      int   (default 50, max 200)
  before_id  str   cursor — returns events older than this event ID
  project_id str   filter to a specific project
  event_type str   filter to a specific event type
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Query, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..security import get_current_user_id, require_role, get_current_role
from ..services.plan_guard import resolve_user_plan, enforce_min_plan
from ..services import audit_log_service

router = APIRouter(prefix="/audit-log", tags=["audit-log"])


@router.get("")
def get_audit_log(
    limit: int = Query(default=50, ge=1, le=200),
    before_id: str | None = Query(default=None),
    project_id: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return the calling user's audit events (Expert plan required)."""
    role = get_current_role(authorization)
    require_role("viewer", role)

    user_id = get_current_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")

    plan = resolve_user_plan(db, authorization)
    enforce_min_plan(plan, "Expert", "Audit log")

    events = audit_log_service.list_events(
        db,
        user_id=user_id,
        project_id=project_id,
        event_type=event_type,
        limit=limit,
        before_id=before_id,
    )
    return events
