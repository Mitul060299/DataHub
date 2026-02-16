from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from ..db import get_db
from ..security import get_current_user
from ..models_db import DashboardDB, DashboardWidgetDB, DashboardThemeDB, DashboardFilterDB
from ..services.visualization import VisualizationService
from ..services.duckdb_service import DuckDBService

router = APIRouter(prefix="/visualizations", tags=["visualizations"])


# Pydantic models
class ChartConfig(BaseModel):
    chart_type: str
    x_axis: Optional[str] = None
    y_axis: Optional[str] = None
    label: Optional[str] = None
    value: Optional[str] = None
    aggregation: Optional[str] = "sum"
    limit: Optional[int] = 100


class WidgetCreate(BaseModel):
    dashboard_id: int
    widget_type: str
    title: str
    dataset_id: Optional[int] = None
    config: dict
    position: dict
    filters: Optional[dict] = None


class WidgetUpdate(BaseModel):
    title: Optional[str] = None
    config: Optional[dict] = None
    position: Optional[dict] = None
    filters: Optional[dict] = None


class DashboardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    workspace_id: int
    dataset_id: Optional[int] = None
    theme_id: Optional[int] = None
    refresh_interval: Optional[int] = None


class DashboardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    layout: Optional[dict] = None
    theme_id: Optional[int] = None
    refresh_interval: Optional[int] = None
    is_public: Optional[bool] = None


class ThemeCreate(BaseModel):
    name: str
    workspace_id: Optional[int] = None
    is_global: bool = False
    colors: dict
    fonts: Optional[dict] = None
    logo_url: Optional[str] = None


class KPIConfig(BaseModel):
    column: Optional[str] = None
    aggregation: str = "count"
    filters: Optional[List[dict]] = []
    format: str = "number"
    trend_period: Optional[str] = None


# Dependencies
def get_visualization_service(db: Session = Depends(get_db)):
    duckdb_service = DuckDBService()
    return VisualizationService(duckdb_service)


# Dashboard endpoints
@router.post("/dashboards")
async def create_dashboard(
    dashboard: DashboardCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Create a new dashboard"""
    db_dashboard = DashboardDB(
        name=dashboard.name,
        description=dashboard.description,
        user_id=current_user["id"],
        workspace_id=dashboard.workspace_id,
        dataset_id=dashboard.dataset_id,
        theme_id=dashboard.theme_id,
        refresh_interval=dashboard.refresh_interval,
        layout={}
    )
    db.add(db_dashboard)
    db.commit()
    db.refresh(db_dashboard)
    
    return {
        "id": db_dashboard.id,
        "name": db_dashboard.name,
        "description": db_dashboard.description,
        "workspace_id": db_dashboard.workspace_id,
        "dataset_id": db_dashboard.dataset_id,
        "theme_id": db_dashboard.theme_id,
        "refresh_interval": db_dashboard.refresh_interval,
        "created_at": db_dashboard.created_at
    }


@router.get("/dashboards")
async def list_dashboards(
    workspace_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """List all dashboards for the user"""
    query = db.query(DashboardDB).filter(DashboardDB.user_id == current_user["id"])
    
    if workspace_id:
        query = query.filter(DashboardDB.workspace_id == workspace_id)
    
    dashboards = query.all()
    
    return [
        {
            "id": d.id,
            "name": d.name,
            "description": d.description,
            "workspace_id": d.workspace_id,
            "dataset_id": d.dataset_id,
            "theme_id": d.theme_id,
            "refresh_interval": d.refresh_interval,
            "is_public": d.is_public,
            "created_at": d.created_at,
            "updated_at": d.updated_at
        }
        for d in dashboards
    ]


@router.get("/dashboards/{dashboard_id}")
async def get_dashboard(
    dashboard_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get a specific dashboard with its widgets"""
    dashboard = db.query(DashboardDB).filter(
        DashboardDB.id == dashboard_id,
        DashboardDB.user_id == current_user["id"]
    ).first()
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    
    # Get widgets
    widgets = db.query(DashboardWidgetDB).filter(
        DashboardWidgetDB.dashboard_id == dashboard_id
    ).all()
    
    return {
        "id": dashboard.id,
        "name": dashboard.name,
        "description": dashboard.description,
        "workspace_id": dashboard.workspace_id,
        "dataset_id": dashboard.dataset_id,
        "theme_id": dashboard.theme_id,
        "layout": dashboard.layout,
        "refresh_interval": dashboard.refresh_interval,
        "is_public": dashboard.is_public,
        "widgets": [
            {
                "id": w.id,
                "widget_type": w.widget_type,
                "title": w.title,
                "dataset_id": w.dataset_id,
                "config": w.config,
                "position": w.position,
                "filters": w.filters
            }
            for w in widgets
        ],
        "created_at": dashboard.created_at,
        "updated_at": dashboard.updated_at
    }


@router.put("/dashboards/{dashboard_id}")
async def update_dashboard(
    dashboard_id: int,
    update: DashboardUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update a dashboard"""
    dashboard = db.query(DashboardDB).filter(
        DashboardDB.id == dashboard_id,
        DashboardDB.user_id == current_user["id"]
    ).first()
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    
    if update.name is not None:
        dashboard.name = update.name
    if update.description is not None:
        dashboard.description = update.description
    if update.layout is not None:
        dashboard.layout = update.layout
    if update.theme_id is not None:
        dashboard.theme_id = update.theme_id
    if update.refresh_interval is not None:
        dashboard.refresh_interval = update.refresh_interval
    if update.is_public is not None:
        dashboard.is_public = update.is_public
    
    db.commit()
    db.refresh(dashboard)
    
    return {"message": "Dashboard updated successfully"}


@router.delete("/dashboards/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete a dashboard"""
    dashboard = db.query(DashboardDB).filter(
        DashboardDB.id == dashboard_id,
        DashboardDB.user_id == current_user["id"]
    ).first()
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    
    db.delete(dashboard)
    db.commit()
    
    return {"message": "Dashboard deleted successfully"}


# Widget endpoints
@router.post("/widgets")
async def create_widget(
    widget: WidgetCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Create a new widget"""
    # Verify dashboard ownership
    dashboard = db.query(DashboardDB).filter(
        DashboardDB.id == widget.dashboard_id,
        DashboardDB.user_id == current_user["id"]
    ).first()
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    
    db_widget = DashboardWidgetDB(
        dashboard_id=widget.dashboard_id,
        widget_type=widget.widget_type,
        title=widget.title,
        dataset_id=widget.dataset_id,
        config=widget.config,
        position=widget.position,
        filters=widget.filters
    )
    db.add(db_widget)
    db.commit()
    db.refresh(db_widget)
    
    return {
        "id": db_widget.id,
        "dashboard_id": db_widget.dashboard_id,
        "widget_type": db_widget.widget_type,
        "title": db_widget.title,
        "dataset_id": db_widget.dataset_id,
        "config": db_widget.config,
        "position": db_widget.position,
        "filters": db_widget.filters
    }


@router.put("/widgets/{widget_id}")
async def update_widget(
    widget_id: int,
    update: WidgetUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update a widget"""
    widget = db.query(DashboardWidgetDB).join(DashboardDB).filter(
        DashboardWidgetDB.id == widget_id,
        DashboardDB.user_id == current_user["id"]
    ).first()
    
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    
    if update.title is not None:
        widget.title = update.title
    if update.config is not None:
        widget.config = update.config
    if update.position is not None:
        widget.position = update.position
    if update.filters is not None:
        widget.filters = update.filters
    
    db.commit()
    
    return {"message": "Widget updated successfully"}


@router.delete("/widgets/{widget_id}")
async def delete_widget(
    widget_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete a widget"""
    widget = db.query(DashboardWidgetDB).join(DashboardDB).filter(
        DashboardWidgetDB.id == widget_id,
        DashboardDB.user_id == current_user["id"]
    ).first()
    
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    
    db.delete(widget)
    db.commit()
    
    return {"message": "Widget deleted successfully"}


# Chart data endpoints
@router.post("/chart-data/{dataset_id}")
async def get_chart_data(
    dataset_id: str,
    config: ChartConfig,
    viz_service: VisualizationService = Depends(get_visualization_service),
    current_user: dict = Depends(get_current_user)
):
    """Get chart data for a specific dataset and configuration"""
    try:
        data = viz_service.get_chart_data(dataset_id, config.dict())
        return {"data": data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/suggest-columns/{dataset_id}")
async def suggest_columns(
    dataset_id: str,
    chart_type: str,
    viz_service: VisualizationService = Depends(get_visualization_service),
    current_user: dict = Depends(get_current_user)
):
    """Suggest appropriate columns for a chart type"""
    try:
        suggestions = viz_service.suggest_chart_columns(dataset_id, chart_type)
        return suggestions
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/kpi/{dataset_id}")
async def calculate_kpi(
    dataset_id: str,
    config: KPIConfig,
    viz_service: VisualizationService = Depends(get_visualization_service),
    current_user: dict = Depends(get_current_user)
):
    """Calculate KPI value"""
    try:
        kpi_data = viz_service.calculate_kpi(dataset_id, config.dict())
        return kpi_data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# Theme endpoints
@router.post("/themes")
async def create_theme(
    theme: ThemeCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Create a new theme"""
    db_theme = DashboardThemeDB(
        name=theme.name,
        user_id=current_user["id"],
        workspace_id=theme.workspace_id,
        is_global=theme.is_global,
        colors=theme.colors,
        fonts=theme.fonts,
        logo_url=theme.logo_url
    )
    db.add(db_theme)
    db.commit()
    db.refresh(db_theme)
    
    return {
        "id": db_theme.id,
        "name": db_theme.name,
        "colors": db_theme.colors,
        "fonts": db_theme.fonts,
        "logo_url": db_theme.logo_url
    }


@router.get("/themes")
async def list_themes(
    workspace_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """List available themes"""
    query = db.query(DashboardThemeDB).filter(
        (DashboardThemeDB.user_id == current_user["id"]) | (DashboardThemeDB.is_global == True)
    )
    
    if workspace_id:
        query = query.filter(
            (DashboardThemeDB.workspace_id == workspace_id) | (DashboardThemeDB.is_global == True)
        )
    
    themes = query.all()
    
    return [
        {
            "id": t.id,
            "name": t.name,
            "colors": t.colors,
            "fonts": t.fonts,
            "logo_url": t.logo_url,
            "is_global": t.is_global
        }
        for t in themes
    ]


@router.post("/dashboards/{dashboard_id}/share")
async def share_dashboard(
    dashboard_id: int,
    db: Session = Depends(get_db),
    viz_service: VisualizationService = Depends(get_visualization_service),
    current_user: dict = Depends(get_current_user)
):
    """Generate a share link for a dashboard"""
    dashboard = db.query(DashboardDB).filter(
        DashboardDB.id == dashboard_id,
        DashboardDB.user_id == current_user["id"]
    ).first()
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    
    # Generate share token if not exists
    if not dashboard.share_token:
        dashboard.share_token = viz_service.generate_share_token()
        dashboard.is_public = True
        db.commit()
    
    return {
        "share_url": f"/shared/dashboard/{dashboard.share_token}",
        "share_token": dashboard.share_token
    }


@router.delete("/dashboards/{dashboard_id}/share")
async def revoke_share(
    dashboard_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Revoke share access for a dashboard"""
    dashboard = db.query(DashboardDB).filter(
        DashboardDB.id == dashboard_id,
        DashboardDB.user_id == current_user["id"]
    ).first()
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    
    dashboard.share_token = None
    dashboard.is_public = False
    db.commit()
    
    return {"message": "Share access revoked"}
