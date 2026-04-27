
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..models import DashboardTileCreate, DashboardTileOut, DashboardTileUpdate, DashboardV2Create, DashboardV2Out, DashboardV2Update
from ..config import settings
from ..security import get_current_role, get_current_subject, require_role
from ..services.dashboards_v2_service import DashboardsV2Service
from ..services.rate_limit import FixedWindowRateLimiter
from ..db import get_db
from ..models_db import DashboardViewDB, DashboardCommentDB
from ..services.plan_guard import resolve_user_plan, enforce_dashboard_sharing
from ..services.workspace_access import get_visible_user_ids
from ..services.project_access import list_visible_owner_user_ids

router = APIRouter(prefix="/api/dashboards", tags=["dashboards-v2"])
public_router = APIRouter(prefix="/api/public/dashboards", tags=["dashboards-public"])
_public_limiter = FixedWindowRateLimiter(settings.shared_rate_limit_per_minute)


@router.get("", response_model=list[DashboardV2Out])
def list_dashboards(
    workspace_id: str | None = Query(default=None),
    project_id: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[DashboardV2Out]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_subject(authorization)
    visible = set(get_visible_user_ids(db, user_id, workspace_id or "default"))
    visible.update(list_visible_owner_user_ids(user_id, db))
    return DashboardsV2Service.list_dashboards(
        user_id=user_id, workspace_id=workspace_id, visible_user_ids=list(visible), project_id=project_id
    )


@router.post("", response_model=DashboardV2Out)
def create_dashboard(
    payload: DashboardV2Create,
    authorization: str | None = Header(default=None),
) -> DashboardV2Out:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_subject(authorization)
    return DashboardsV2Service.create_dashboard(
        user_id=user_id,
        workspace_id=payload.workspace_id,
        dataset_id=payload.dataset_id,
        name=payload.name,
        description=payload.description,
        layout=payload.layout,
        theme=payload.theme,
    )


@router.get("/{dashboard_id}", response_model=DashboardV2Out)
def get_dashboard(
    dashboard_id: str,
    authorization: str | None = Header(default=None),
) -> DashboardV2Out:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_subject(authorization)
    dashboard = DashboardsV2Service.get_dashboard(user_id=user_id, dashboard_id=dashboard_id)
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@router.post("/{dashboard_id}/tiles", response_model=DashboardTileOut)
def add_tile(
    dashboard_id: str,
    payload: DashboardTileCreate,
    authorization: str | None = Header(default=None),
) -> DashboardTileOut:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_subject(authorization)
    try:
        return DashboardsV2Service.add_tile(
            user_id=user_id,
            dashboard_id=dashboard_id,
            dataset_id=payload.dataset_id,
            title=payload.title,
            chart_type=payload.chart_type,
            query_spec=payload.query_spec,
            layout=payload.layout,
            tile_type=payload.tile_type,
            echarts_config=payload.echarts_config,
            table_data=payload.table_data,
            metric_value=payload.metric_value,
            metric_label=payload.metric_label,
            metric_trend=payload.metric_trend,
            metric_threshold=payload.metric_threshold,
            source_table=payload.source_table,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/{dashboard_id}", response_model=DashboardV2Out)
def update_dashboard(
    dashboard_id: str,
    payload: DashboardV2Update,
    authorization: str | None = Header(default=None),
) -> DashboardV2Out:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_subject(authorization)
    updated = DashboardsV2Service.update_dashboard(
        user_id=user_id,
        dashboard_id=dashboard_id,
        updates=payload.model_dump(exclude_none=True),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return updated


@router.delete("/{dashboard_id}/tiles/{tile_id}")
def delete_tile(
    dashboard_id: str,
    tile_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, bool | str]:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_subject(authorization)
    success = DashboardsV2Service.delete_tile(
        user_id=user_id,
        dashboard_id=dashboard_id,
        tile_id=tile_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Tile not found")
    return {"success": True, "tile_id": tile_id}


@router.patch("/{dashboard_id}/tiles/{tile_id}", response_model=DashboardTileOut)
def update_tile(
    dashboard_id: str,
    tile_id: str,
    payload: DashboardTileUpdate,
    authorization: str | None = Header(default=None),
) -> DashboardTileOut:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_subject(authorization)
    updated = DashboardsV2Service.update_tile(
        user_id=user_id,
        dashboard_id=dashboard_id,
        tile_id=tile_id,
        updates=payload.model_dump(exclude_none=True),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Tile not found")
    return updated


@router.post("/{dashboard_id}/views", status_code=201)
def log_view(
    dashboard_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    import secrets as _secrets
    user_id: str | None = None
    try:
        user_id = get_current_subject(authorization) if authorization else None
    except Exception:
        pass
    client_ip = request.client.host if request.client else None
    view = DashboardViewDB(
        id=_secrets.token_hex(16),
        dashboard_id=dashboard_id,
        viewed_by_user_id=user_id,
        ip_address=client_ip,
    )
    db.add(view)
    db.commit()
    return {"success": True}


@router.post("/{dashboard_id}/publish")
def publish_dashboard(
    dashboard_id: str,
    expires_in_hours: int | None = None,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, str | None]:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_plan = resolve_user_plan(db, authorization)
    enforce_dashboard_sharing(user_plan)
    user_id = get_current_subject(authorization)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)
        if expires_in_hours and expires_in_hours > 0
        else None
    )
    try:
        publish = DashboardsV2Service.publish_dashboard(user_id=user_id, dashboard_id=dashboard_id, expires_at=expires_at)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    share_url = ""
    if settings.public_base_url:
        share_url = f"{settings.public_base_url.rstrip('/')}/public-dashboard/{publish.publish_token}"

    return {
        "dashboard_id": dashboard_id,
        "publish_token": publish.publish_token,
        "public_url": share_url,
        "expires_at": publish.expires_at.isoformat() if publish.expires_at else None,
    }


@router.delete("/{dashboard_id}/publish")
def unpublish_dashboard(
    dashboard_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, bool | str]:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_subject(authorization)
    success = DashboardsV2Service.unpublish_dashboard(user_id=user_id, dashboard_id=dashboard_id)
    if not success:
        raise HTTPException(status_code=404, detail="Published dashboard not found")
    return {"success": True, "dashboard_id": dashboard_id}


@public_router.get("/{publish_token}", response_model=DashboardV2Out)
def get_public_dashboard(
    publish_token: str,
    request: Request,
) -> DashboardV2Out:
    client_ip = request.client.host if request.client else "unknown"
    if not _public_limiter.allow(f"dash:{publish_token}:{client_ip}"):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    dashboard = DashboardsV2Service.get_public_dashboard(publish_token=publish_token)
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Published dashboard not found")
    return dashboard


@public_router.get("/{publish_token}/tiles", response_model=list[DashboardTileOut])
def get_public_dashboard_tiles(
    publish_token: str,
    request: Request,
) -> list[DashboardTileOut]:
    client_ip = request.client.host if request.client else "unknown"
    if not _public_limiter.allow(f"dash-tiles:{publish_token}:{client_ip}"):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    dashboard = DashboardsV2Service.get_public_dashboard(publish_token=publish_token)
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Published dashboard not found")
    return dashboard.tiles


# ── share_token routes (direct share_token field on dashboards_v2) ─────────────

@public_router.get("/share/{share_token}", response_model=DashboardV2Out)
def get_shared_dashboard(
    share_token: str,
    request: Request,
) -> DashboardV2Out:
    client_ip = request.client.host if request.client else "unknown"
    if not _public_limiter.allow(f"share:{share_token}:{client_ip}"):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    dashboard = DashboardsV2Service.get_dashboard_by_share_token(share_token=share_token)
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Shared dashboard not found")
    return dashboard


@public_router.get("/share/{share_token}/tiles", response_model=list[DashboardTileOut])
def get_shared_dashboard_tiles(
    share_token: str,
    request: Request,
) -> list[DashboardTileOut]:
    client_ip = request.client.host if request.client else "unknown"
    if not _public_limiter.allow(f"share-tiles:{share_token}:{client_ip}"):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    dashboard = DashboardsV2Service.get_dashboard_by_share_token(share_token=share_token)
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Shared dashboard not found")
    return dashboard.tiles


# ── Dashboard Comments ─────────────────────────────────────────────────────────

class DashboardCommentIn(BaseModel):
    body: str
    author_name: Optional[str] = None


class DashboardCommentOut(BaseModel):
    id: str
    dashboard_id: str
    user_id: str
    author_name: str
    body: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


@router.get("/{dashboard_id}/comments", response_model=List[DashboardCommentOut])
def list_comments(
    dashboard_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> List[DashboardCommentOut]:
    """Return all comments for a dashboard, oldest first."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    rows = (
        db.query(DashboardCommentDB)
        .filter(DashboardCommentDB.dashboard_id == dashboard_id)
        .order_by(DashboardCommentDB.created_at.asc())
        .all()
    )
    return [
        DashboardCommentOut(
            id=r.id,
            dashboard_id=r.dashboard_id,
            user_id=r.user_id,
            author_name=r.author_name,
            body=r.body,
            created_at=r.created_at.isoformat() if r.created_at else "",
            updated_at=r.updated_at.isoformat() if r.updated_at else "",
        )
        for r in rows
    ]


@router.post("/{dashboard_id}/comments", response_model=DashboardCommentOut, status_code=201)
def create_comment(
    dashboard_id: str,
    payload: DashboardCommentIn,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DashboardCommentOut:
    """Post a new comment on a dashboard."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_subject(authorization)

    if not payload.body.strip():
        raise HTTPException(status_code=422, detail="Comment body cannot be empty")

    author = (payload.author_name or "").strip() or user_id or "User"
    comment = DashboardCommentDB(
        id=str(uuid.uuid4()),
        dashboard_id=dashboard_id,
        user_id=user_id or "anonymous",
        author_name=author,
        body=payload.body.strip(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return DashboardCommentOut(
        id=comment.id,
        dashboard_id=comment.dashboard_id,
        user_id=comment.user_id,
        author_name=comment.author_name,
        body=comment.body,
        created_at=comment.created_at.isoformat() if comment.created_at else "",
        updated_at=comment.updated_at.isoformat() if comment.updated_at else "",
    )


@router.delete("/{dashboard_id}/comments/{comment_id}")
def delete_comment(
    dashboard_id: str,
    comment_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a comment. Only the comment author can delete their own comment."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_subject(authorization)

    comment = (
        db.query(DashboardCommentDB)
        .filter(
            DashboardCommentDB.id == comment_id,
            DashboardCommentDB.dashboard_id == dashboard_id,
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own comments")
    db.delete(comment)
    db.commit()
    return Response(status_code=204)