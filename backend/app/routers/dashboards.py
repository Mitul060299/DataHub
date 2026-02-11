from fastapi import APIRouter, Header, Depends, HTTPException, Request
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
import uuid
from pydantic import BaseModel
from ..models import Dashboard, DashboardWidget
from ..security import get_current_role, require_role
from ..db import get_db
from ..models_db import Dashboard as DashboardDB
from ..config import settings
from ..services.rate_limit import FixedWindowRateLimiter
from ..services.share_tokens import sign_token, verify_token
from ..services.audit import audit_store
from ..models import AuditEntry

router = APIRouter(prefix="/dashboards", tags=["dashboards"])
_shared_limiter = FixedWindowRateLimiter(settings.shared_rate_limit_per_minute)


class DashboardUpdate(BaseModel):
    name: str | None = None
    widgets: list[DashboardWidget] | None = None

@router.post("/", response_model=Dashboard)
def create_dashboard(
    name: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Dashboard:
    role = get_current_role(authorization)
    require_role("editor", role)
    dashboard_id = str(uuid.uuid4())
    db_dashboard = DashboardDB(id=dashboard_id, name=name, widgets=[], is_shared=False, share_token=None, share_expires_at=None)
    db.add(db_dashboard)
    db.commit()
    return Dashboard(dashboard_id=dashboard_id, name=name, widgets=[], is_shared=False, share_token=None, share_expires_at=None)


@router.get("/", response_model=list[Dashboard])
def list_dashboards(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[Dashboard]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    dashboards = db.query(DashboardDB).all()
    return [
        Dashboard(
            dashboard_id=d.id,
            name=d.name,
            widgets=d.widgets or [],
            is_shared=bool(d.is_shared),
            share_token=d.share_token,
            share_expires_at=str(d.share_expires_at) if d.share_expires_at else None,
            share_scope=d.share_scope,
        )
        for d in dashboards
    ]


@router.get("/{dashboard_id}", response_model=Dashboard)
def get_dashboard(
    dashboard_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Dashboard:
    role = get_current_role(authorization)
    require_role("viewer", role)
    dashboard = db.query(DashboardDB).filter(DashboardDB.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return Dashboard(
        dashboard_id=dashboard.id,
        name=dashboard.name,
        widgets=dashboard.widgets or [],
        is_shared=bool(dashboard.is_shared),
        share_token=dashboard.share_token,
        share_expires_at=str(dashboard.share_expires_at) if dashboard.share_expires_at else None,
        share_scope=dashboard.share_scope,
    )


@router.put("/{dashboard_id}", response_model=Dashboard)
def update_dashboard(
    dashboard_id: str,
    payload: DashboardUpdate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Dashboard:
    role = get_current_role(authorization)
    require_role("editor", role)
    dashboard = db.query(DashboardDB).filter(DashboardDB.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="Dashboard name cannot be empty")
        dashboard.name = payload.name
    if payload.widgets is not None:
        dashboard.widgets = [widget.model_dump() for widget in payload.widgets]
    db.commit()
    audit_store.add(
        AuditEntry(
            action="update.dashboard",
            actor=authorization or "unknown",
            target=dashboard_id,
            metadata={},
        )
    )
    return Dashboard(
        dashboard_id=dashboard.id,
        name=dashboard.name,
        widgets=dashboard.widgets or [],
        is_shared=bool(dashboard.is_shared),
        share_token=dashboard.share_token,
        share_expires_at=str(dashboard.share_expires_at) if dashboard.share_expires_at else None,
        share_scope=dashboard.share_scope,
    )


@router.delete("/{dashboard_id}")
def delete_dashboard(
    dashboard_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    dashboard = db.query(DashboardDB).filter(DashboardDB.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    db.delete(dashboard)
    db.commit()
    audit_store.add(
        AuditEntry(
            action="delete.dashboard",
            actor=authorization or "unknown",
            target=dashboard_id,
            metadata={},
        )
    )
    return {"status": "deleted", "dashboard_id": dashboard_id}


@router.post("/{dashboard_id}/share")
def share_dashboard(
    dashboard_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    expires_in_hours: int | None = None,
    scope: str | None = None,
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    dashboard = db.query(DashboardDB).filter(DashboardDB.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    if not dashboard.share_token:
        dashboard.share_token = str(uuid.uuid4())
    if scope and settings.share_scope_allowlist and scope not in settings.share_scope_allowlist:
        raise HTTPException(status_code=400, detail="Invalid share scope")
    if scope and settings.share_scope_policy.get(scope):
        require_role(settings.share_scope_policy[scope], role)
    dashboard.is_shared = True
    dashboard.share_scope = scope
    if expires_in_hours:
        dashboard.share_expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)
    else:
        dashboard.share_expires_at = None
    db.commit()
    audit_store.add(
        AuditEntry(
            action="share.dashboard",
            actor=authorization or "unknown",
            target=dashboard_id,
            metadata={"expires_in_hours": expires_in_hours},
        )
    )
    signature = sign_token(dashboard.share_token)
    share_url = ""
    if settings.public_base_url:
        base = f"{settings.public_base_url.rstrip('/')}/shared/{dashboard.share_token}"
        if signature:
            share_url = f"{base}?sig={signature}"
        else:
            share_url = base
    return {
        "share_token": dashboard.share_token,
        "share_url": share_url,
        "share_expires_at": str(dashboard.share_expires_at) if dashboard.share_expires_at else None,
        "signature": signature,
        "share_scope": dashboard.share_scope,
    }


@router.post("/{dashboard_id}/unshare")
def unshare_dashboard(
    dashboard_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    dashboard = db.query(DashboardDB).filter(DashboardDB.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    dashboard.is_shared = False
    dashboard.share_expires_at = None
    dashboard.share_scope = None
    db.commit()
    audit_store.add(
        AuditEntry(
            action="unshare.dashboard",
            actor=authorization or "unknown",
            target=dashboard_id,
            metadata={},
        )
    )
    return {"status": "unshared", "dashboard_id": dashboard_id}


@router.post("/unshare-all")
def unshare_all_dashboards(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    rows = db.query(DashboardDB).filter(DashboardDB.is_shared.is_(True)).all()
    for row in rows:
        row.is_shared = False
        row.share_expires_at = None
        row.share_scope = None
    db.commit()
    audit_store.add(
        AuditEntry(
            action="unshare.dashboard.all",
            actor=authorization or "unknown",
            target="dashboards",
            metadata={"count": len(rows)},
        )
    )
    return {"status": "unshared", "count": len(rows)}


@router.post("/purge-expired")
def purge_expired_dashboards(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    now = datetime.now(timezone.utc)
    rows = (
        db.query(DashboardDB)
        .filter(DashboardDB.is_shared.is_(True))
        .filter(DashboardDB.share_expires_at.isnot(None))
        .filter(DashboardDB.share_expires_at < now)
        .all()
    )
    for row in rows:
        row.is_shared = False
        row.share_expires_at = None
        row.share_scope = None
    db.commit()
    audit_store.add(
        AuditEntry(
            action="purge.dashboard.expired",
            actor=authorization or "unknown",
            target="dashboards",
            metadata={"count": len(rows)},
        )
    )
    return {"status": "purged", "count": len(rows)}


@router.get("/shared/{share_token}", response_model=Dashboard)
def get_shared_dashboard(
    share_token: str,
    request: Request,
    sig: str | None = None,
    scope: str | None = None,
    db: Session = Depends(get_db),
) -> Dashboard:
    client_ip = request.client.host if request.client else "unknown"
    if not _shared_limiter.allow(f"dash:{share_token}:{client_ip}"):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    if not verify_token(share_token, sig):
        raise HTTPException(status_code=403, detail="Invalid share signature")
    dashboard = db.query(DashboardDB).filter(DashboardDB.share_token == share_token).first()
    if not dashboard or not dashboard.is_shared:
        raise HTTPException(status_code=404, detail="Shared dashboard not found")
    if dashboard.share_expires_at and dashboard.share_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Shared link expired")
    if dashboard.share_scope and dashboard.share_scope != scope:
        raise HTTPException(status_code=403, detail="Invalid share scope")
    audit_store.add(
        AuditEntry(
            action="view.shared.dashboard",
            actor=request.client.host if request.client else "unknown",
            target=dashboard.id,
            metadata={"share_token": share_token},
        )
    )
    return Dashboard(
        dashboard_id=dashboard.id,
        name=dashboard.name,
        widgets=dashboard.widgets or [],
        is_shared=True,
        share_token=dashboard.share_token,
        share_expires_at=str(dashboard.share_expires_at) if dashboard.share_expires_at else None,
        share_scope=dashboard.share_scope,
    )
