"""Router for dashboard access control, sharing, and audit views."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import DashboardAccessCreate, DashboardAccessOut
from ..models_db import DashboardAccessDB, DashboardV2DB, DashboardViewDB
from ..security import get_current_role, get_current_subject, require_role
from ..config import settings

router = APIRouter(
    prefix="/api/dashboards/{dashboard_id}/access",
    tags=["dashboard-access"],
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _require_owner(user_id: str, dashboard_id: str, db: Session) -> DashboardV2DB:
    dash = db.query(DashboardV2DB).filter_by(id=dashboard_id).first()
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    if dash.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not the dashboard owner")
    return dash


def _grant_out(g: DashboardAccessDB) -> DashboardAccessOut:
    return DashboardAccessOut(
        id=g.id,
        dashboard_id=g.dashboard_id,
        granted_to_user_id=g.granted_to_user_id,
        granted_to_email=g.granted_to_email,
        access_level=g.access_level,
        granted_by=g.granted_by,
        expires_at=g.expires_at.isoformat() if g.expires_at else None,
        token=g.token,
        created_at=g.created_at.isoformat(),
    )


# ── GET /access — list grants ─────────────────────────────────────────────────

@router.get("", response_model=list[DashboardAccessOut])
def list_access(
    dashboard_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[DashboardAccessOut]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_subject(authorization)
    _require_owner(user_id, dashboard_id, db)
    grants = db.query(DashboardAccessDB).filter_by(dashboard_id=dashboard_id).all()
    return [_grant_out(g) for g in grants]


# ── POST /access/invite — internal user grant ─────────────────────────────────

@router.post("/invite", response_model=DashboardAccessOut, status_code=201)
def invite_user(
    dashboard_id: str,
    payload: DashboardAccessCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DashboardAccessOut:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_subject(authorization)
    _require_owner(user_id, dashboard_id, db)

    if not payload.granted_to_user_id and not payload.granted_to_email:
        raise HTTPException(status_code=422, detail="Either granted_to_user_id or granted_to_email is required")

    expires_at: datetime | None = None
    if payload.expires_at:
        try:
            expires_at = datetime.fromisoformat(payload.expires_at)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Invalid expires_at format: {payload.expires_at}") from exc

    grant = DashboardAccessDB(
        id=secrets.token_hex(16),
        dashboard_id=dashboard_id,
        granted_to_user_id=payload.granted_to_user_id,
        granted_to_email=payload.granted_to_email,
        access_level=payload.access_level,
        granted_by=user_id,
        expires_at=expires_at,
    )
    db.add(grant)
    db.commit()
    db.refresh(grant)
    return _grant_out(grant)


# ── POST /access/external — external email grant with per-grant token ─────────

@router.post("/external", response_model=DashboardAccessOut, status_code=201)
def invite_external(
    dashboard_id: str,
    payload: DashboardAccessCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DashboardAccessOut:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_subject(authorization)
    _require_owner(user_id, dashboard_id, db)

    if not payload.granted_to_email:
        raise HTTPException(status_code=422, detail="granted_to_email is required for external grant")

    grant = DashboardAccessDB(
        id=secrets.token_hex(16),
        dashboard_id=dashboard_id,
        granted_to_email=payload.granted_to_email,
        access_level=payload.access_level or "view",
        granted_by=user_id,
        token=secrets.token_hex(16),   # per-grant link token
    )
    db.add(grant)
    db.commit()
    db.refresh(grant)
    return _grant_out(grant)


# ── DELETE /access/{grant_id} — revoke ───────────────────────────────────────

@router.delete("/{grant_id}", status_code=200)
def revoke_access(
    dashboard_id: str,
    grant_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, bool | str]:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_subject(authorization)
    _require_owner(user_id, dashboard_id, db)

    grant = db.query(DashboardAccessDB).filter_by(id=grant_id, dashboard_id=dashboard_id).first()
    if not grant:
        raise HTTPException(status_code=404, detail="Grant not found")
    db.delete(grant)
    db.commit()
    return {"success": True, "grant_id": grant_id}


# ── GET /access/views — audit log ────────────────────────────────────────────

@router.get("/views")
def get_views(
    dashboard_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[dict]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_subject(authorization)
    _require_owner(user_id, dashboard_id, db)

    views = db.query(DashboardViewDB).filter_by(dashboard_id=dashboard_id).order_by(DashboardViewDB.viewed_at.desc()).limit(500).all()
    return [
        {
            "id": v.id,
            "dashboard_id": v.dashboard_id,
            "viewed_by_user_id": v.viewed_by_user_id,
            "viewed_by_email": v.viewed_by_email,
            "viewed_at": v.viewed_at.isoformat(),
            "ip_address": v.ip_address,
        }
        for v in views
    ]


# ── POST /access/share-token — generate public share_token ───────────────────

@router.post("/share-token")
def generate_share_token(
    dashboard_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_subject(authorization)
    dash = _require_owner(user_id, dashboard_id, db)

    token = secrets.token_hex(32)
    dash.share_token = token  # type: ignore[assignment]
    db.commit()

    share_url = ""
    if settings.public_base_url:
        share_url = f"{settings.public_base_url.rstrip('/')}/dashboard/share/{token}"

    return {"share_token": token, "share_url": share_url}


# ── DELETE /access/share-token — remove share link ───────────────────────────

@router.delete("/share-token")
def delete_share_token(
    dashboard_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_subject(authorization)
    dash = _require_owner(user_id, dashboard_id, db)

    dash.share_token = None  # type: ignore[assignment]
    db.commit()
    return {"success": True}
