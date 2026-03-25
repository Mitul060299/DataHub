"""saved_visualizations.py — CRUD for user-saved chart configurations.

Charts are only persisted when the user explicitly clicks "Save to Visualizations"
in the AI Agent panel. Ephemeral charts (not saved) are never written here.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import get_current_user
from ..models_db import User, VisualizationDB

router = APIRouter(prefix="/api/visualizations/saved", tags=["saved-visualizations"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SaveVizRequest(BaseModel):
    name: str
    chart_type: str = "bar"
    echarts_config: dict[str, Any]
    project_id: str | None = None
    workspace_id: str | None = None


class RenameVizRequest(BaseModel):
    name: str


class VizOut(BaseModel):
    id: str
    name: str
    chart_type: str
    echarts_config: dict[str, Any]
    project_id: str | None
    workspace_id: str
    created_at: str

    class Config:
        from_attributes = True


def _viz_out(v: VisualizationDB) -> dict:
    return {
        "id": v.id,
        "name": v.name,
        "chart_type": v.chart_type,
        "echarts_config": v.echarts_config or {},
        "project_id": v.project_id,
        "workspace_id": v.workspace_id,
        "created_at": v.created_at.isoformat() if v.created_at else "",
        "updated_at": v.updated_at.isoformat() if v.updated_at else "",
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_visualizations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(VisualizationDB)
        .filter(VisualizationDB.user_id == current_user.id)
        .order_by(VisualizationDB.created_at.desc())
        .all()
    )
    return [_viz_out(v) for v in rows]


@router.post("", status_code=201)
def save_visualization(
    body: SaveVizRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    viz = VisualizationDB(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        workspace_id=body.workspace_id or "default",
        project_id=body.project_id or None,
        name=body.name.strip() or "Untitled Chart",
        chart_type=body.chart_type,
        echarts_config=body.echarts_config,
    )
    db.add(viz)
    db.commit()
    db.refresh(viz)
    return _viz_out(viz)


@router.get("/{viz_id}")
def get_visualization(
    viz_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    viz = db.query(VisualizationDB).filter(
        VisualizationDB.id == viz_id,
        VisualizationDB.user_id == current_user.id,
    ).first()
    if not viz:
        raise HTTPException(status_code=404, detail="Visualization not found")
    return _viz_out(viz)


@router.patch("/{viz_id}")
def rename_visualization(
    viz_id: str,
    body: RenameVizRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    viz = db.query(VisualizationDB).filter(
        VisualizationDB.id == viz_id,
        VisualizationDB.user_id == current_user.id,
    ).first()
    if not viz:
        raise HTTPException(status_code=404, detail="Visualization not found")
    viz.name = body.name.strip() or viz.name
    db.commit()
    db.refresh(viz)
    return _viz_out(viz)


@router.delete("/{viz_id}", status_code=204)
def delete_visualization(
    viz_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    viz = db.query(VisualizationDB).filter(
        VisualizationDB.id == viz_id,
        VisualizationDB.user_id == current_user.id,
    ).first()
    if not viz:
        raise HTTPException(status_code=404, detail="Visualization not found")
    db.delete(viz)
    db.commit()
