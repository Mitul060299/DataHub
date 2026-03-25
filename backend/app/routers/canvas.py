"""canvas.py — CRUD for Canvas layouts (drag-drop dashboard arrangements).

Canvas layouts belong to a project and are counted against the per-plan limit.
Visualizations (saved charts) are unlimited; only layouts are gated.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import get_current_user
from ..models_db import CanvasLayoutDB, User
from ..services.plan_guard import normalize_plan

router = APIRouter(prefix="/api/canvas", tags=["canvas"])

# ── Plan limits for canvas layouts ───────────────────────────────────────────

_CANVAS_LIMITS: dict[str, int | None] = {
    "free": 2,
    "professional": 20,
    "team": None,        # unlimited
    "business": None,    # unlimited
    "enterprise": None,  # unlimited
}


def _canvas_limit_for_plan(plan: str) -> int | None:
    return _CANVAS_LIMITS.get(normalize_plan(plan).lower())


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class CreateCanvasRequest(BaseModel):
    name: str = "Untitled Dashboard"
    project_id: str | None = None
    workspace_id: str | None = None


class SaveCanvasRequest(BaseModel):
    name: str | None = None
    layout: list[dict[str, Any]] | None = None
    is_public: bool | None = None


def _canvas_out(c: CanvasLayoutDB) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "project_id": c.project_id,
        "workspace_id": c.workspace_id,
        "layout": c.layout or [],
        "is_public": c.is_public,
        "public_token": c.public_token,
        "created_at": c.created_at.isoformat() if c.created_at else "",
        "updated_at": c.updated_at.isoformat() if c.updated_at else "",
    }


# ── Limit status endpoint ─────────────────────────────────────────────────────

@router.get("/limit-status")
def canvas_limit_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = normalize_plan(getattr(current_user, "plan", None))
    limit = _canvas_limit_for_plan(plan)
    count = (
        db.query(CanvasLayoutDB)
        .filter(CanvasLayoutDB.user_id == current_user.id)
        .count()
    )
    return {
        "count": count,
        "limit": limit,
        "can_create": (limit is None) or (count < limit),
        "plan": plan,
    }


# ── CRUD endpoints ────────────────────────────────────────────────────────────

@router.get("")
def list_canvas_layouts(
    project_id: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(CanvasLayoutDB).filter(CanvasLayoutDB.user_id == current_user.id)
    if project_id:
        q = q.filter(CanvasLayoutDB.project_id == project_id)
    rows = q.order_by(CanvasLayoutDB.updated_at.desc()).all()
    return [_canvas_out(c) for c in rows]


@router.post("", status_code=201)
def create_canvas_layout(
    body: CreateCanvasRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Enforce per-plan limit
    plan = normalize_plan(getattr(current_user, "plan", None))
    limit = _canvas_limit_for_plan(plan)
    if limit is not None:
        count = (
            db.query(CanvasLayoutDB)
            .filter(CanvasLayoutDB.user_id == current_user.id)
            .count()
        )
        if count >= limit:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "canvas_limit_reached",
                    "message": "You have reached the dashboard limit for your plan.",
                    "current_plan": plan,
                    "limit": limit,
                    "upgrade_required": True,
                },
            )

    canvas = CanvasLayoutDB(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        workspace_id=body.workspace_id or "default",
        project_id=body.project_id or None,
        name=body.name.strip() or "Untitled Dashboard",
        layout=[],
    )
    db.add(canvas)
    db.commit()
    db.refresh(canvas)
    return _canvas_out(canvas)


@router.get("/{canvas_id}")
def get_canvas_layout(
    canvas_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    canvas = db.query(CanvasLayoutDB).filter(
        CanvasLayoutDB.id == canvas_id,
        CanvasLayoutDB.user_id == current_user.id,
    ).first()
    if not canvas:
        raise HTTPException(status_code=404, detail="Canvas not found")
    return _canvas_out(canvas)


@router.patch("/{canvas_id}")
def save_canvas_layout(
    canvas_id: str,
    body: SaveCanvasRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    canvas = db.query(CanvasLayoutDB).filter(
        CanvasLayoutDB.id == canvas_id,
        CanvasLayoutDB.user_id == current_user.id,
    ).first()
    if not canvas:
        raise HTTPException(status_code=404, detail="Canvas not found")
    if body.name is not None:
        canvas.name = body.name.strip() or canvas.name
    if body.layout is not None:
        canvas.layout = body.layout
    if body.is_public is not None:
        canvas.is_public = body.is_public
        if body.is_public and not canvas.public_token:
            canvas.public_token = str(uuid.uuid4())
    db.commit()
    db.refresh(canvas)
    return _canvas_out(canvas)


@router.delete("/{canvas_id}", status_code=204)
def delete_canvas_layout(
    canvas_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    canvas = db.query(CanvasLayoutDB).filter(
        CanvasLayoutDB.id == canvas_id,
        CanvasLayoutDB.user_id == current_user.id,
    ).first()
    if not canvas:
        raise HTTPException(status_code=404, detail="Canvas not found")
    db.delete(canvas)
    db.commit()
