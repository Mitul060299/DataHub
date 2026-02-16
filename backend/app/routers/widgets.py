"""
DEPRECATED: Old simplified widget router
Use /visualizations router instead for the new BI dashboard widgets.
This file is kept for backwards compatibility only.
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
import uuid
from ..models import DashboardWidget
from ..db import get_db
from ..models_db import Dashboard as DashboardDB, DatasetMetaDB
from ..security import get_current_role, require_role

router = APIRouter(prefix="/widgets", tags=["widgets"])


@router.post("/", response_model=DashboardWidget)
def add_widget(
    dashboard_id: str,
    title: str,
    chart_type: str,
    dataset_id: str,
    column: str | None = None,
    bins: int | None = None,
    top_n: int | None = None,
    theme_color: str | None = None,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DashboardWidget:
    role = get_current_role(authorization)
    require_role("editor", role)

    if not title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if chart_type not in {"summary", "table", "correlation"}:
        raise HTTPException(status_code=400, detail="Unsupported chart type")

    dashboard = db.query(DashboardDB).filter(DashboardDB.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    dataset_meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not dataset_meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if chart_type == "summary":
        if not column:
            raise HTTPException(status_code=400, detail="Column is required for summary widgets")
        if column not in (dataset_meta.columns or []):
            raise HTTPException(status_code=400, detail="Column not found in dataset")

    widget_id = str(uuid.uuid4())
    config = {"dataset_id": dataset_id}
    if column:
        config["column"] = column
    if bins is not None:
        config["bins"] = max(3, min(50, int(bins)))
    if top_n is not None:
        config["top_n"] = max(3, min(50, int(top_n)))
    if theme_color:
        config["theme_color"] = theme_color

    widget = DashboardWidget(
        widget_id=widget_id,
        title=title,
        chart_type=chart_type,
        config=config,
    )
    widgets = dashboard.widgets or []
    widgets.append(widget.model_dump())
    dashboard.widgets = widgets
    db.commit()

    return widget


@router.get("/{dashboard_id}")
def list_widgets(dashboard_id: str, db: Session = Depends(get_db)) -> list[DashboardWidget]:
    dashboard = db.query(DashboardDB).filter(DashboardDB.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    widgets = dashboard.widgets or []
    return [DashboardWidget(**w) for w in widgets]


@router.delete("/{dashboard_id}/{widget_id}")
def delete_widget(
    dashboard_id: str,
    widget_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)

    dashboard = db.query(DashboardDB).filter(DashboardDB.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    widgets = dashboard.widgets or []
    widgets = [w for w in widgets if w.get("widget_id") != widget_id]
    dashboard.widgets = widgets
    db.commit()
    return {"status": "deleted", "widget_id": widget_id}


@router.put("/{dashboard_id}/{widget_id}", response_model=DashboardWidget)
def update_widget(
    dashboard_id: str,
    widget_id: str,
    title: str | None = None,
    column: str | None = None,
    chart_type: str | None = None,
    dataset_id: str | None = None,
    bins: int | None = None,
    top_n: int | None = None,
    theme_color: str | None = None,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DashboardWidget:
    role = get_current_role(authorization)
    require_role("editor", role)

    if title is not None and not title.strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    if chart_type is not None and chart_type not in {"summary", "table", "correlation"}:
        raise HTTPException(status_code=400, detail="Unsupported chart type")

    dashboard = db.query(DashboardDB).filter(DashboardDB.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    widgets = dashboard.widgets or []
    for w in widgets:
        if w.get("widget_id") == widget_id:
            effective_dataset_id = dataset_id or w.get("config", {}).get("dataset_id")
            effective_column = column or w.get("config", {}).get("column")
            if effective_dataset_id:
                dataset_meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == effective_dataset_id).first()
                if not dataset_meta:
                    raise HTTPException(status_code=404, detail="Dataset not found")
                if (chart_type or w.get("chart_type")) == "summary":
                    if not effective_column:
                        raise HTTPException(status_code=400, detail="Column is required for summary widgets")
                    if effective_column not in (dataset_meta.columns or []):
                        raise HTTPException(status_code=400, detail="Column not found in dataset")
            if title:
                w["title"] = title
            if column:
                w.setdefault("config", {})["column"] = column
            if dataset_id:
                w.setdefault("config", {})["dataset_id"] = dataset_id
            if chart_type:
                w["chart_type"] = chart_type
            if bins is not None:
                w.setdefault("config", {})["bins"] = max(3, min(50, int(bins)))
            if top_n is not None:
                w.setdefault("config", {})["top_n"] = max(3, min(50, int(top_n)))
            if theme_color:
                w.setdefault("config", {})["theme_color"] = theme_color
            dashboard.widgets = widgets
            db.commit()
            return DashboardWidget(**w)

    raise HTTPException(status_code=404, detail="Widget not found")


@router.post("/{dashboard_id}/reorder")
def reorder_widgets(
    dashboard_id: str,
    widget_ids: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)

    dashboard = db.query(DashboardDB).filter(DashboardDB.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    ids = [item.strip() for item in widget_ids.split(",") if item.strip()]
    widgets = dashboard.widgets or []
    by_id = {w.get("widget_id"): w for w in widgets}
    ordered = [by_id[w_id] for w_id in ids if w_id in by_id]
    if len(ordered) != len(ids):
        raise HTTPException(status_code=400, detail="One or more widget IDs were not found")
    remaining = [w for w in widgets if w.get("widget_id") not in ids]
    dashboard.widgets = ordered + remaining
    db.commit()
    return {"status": "reordered", "widgets": dashboard.widgets}
