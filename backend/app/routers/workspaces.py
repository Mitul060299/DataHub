from fastapi import APIRouter, Depends, HTTPException, Header, Request
from datetime import datetime, timedelta, timezone
from sqlalchemy import text as _sql_text
from sqlalchemy.orm import Session
import uuid
from ..db import get_db
from ..models import WorkspaceCreate, WorkspaceOut
from ..models_db import Workspace, WorkspaceMemberDB
from ..security import get_current_role, get_current_subject, require_role
from ..config import settings
from ..services.rate_limit import FixedWindowRateLimiter
from ..services.share_tokens import sign_token, verify_token
from ..services.audit import audit_store
from ..models import AuditEntry
from ..services.plan_guard import resolve_user_plan, enforce_workspace_limit, enforce_min_plan, resolve_user_plan_by_id, enforce_collab_workspace_limit
from ..dependencies import CurrentUser, get_current_user

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
_shared_limiter = FixedWindowRateLimiter(settings.shared_rate_limit_per_minute)


@router.post("/", response_model=WorkspaceOut)
def create_workspace(
    payload: WorkspaceCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> WorkspaceOut:
    role = get_current_role(authorization)
    require_role("viewer", role)
    owner_id = get_current_subject(authorization)  # email / user identifier
    user_plan = resolve_user_plan(db, authorization)

    workspace_type = payload.workspace_type
    if workspace_type == "collab":
        # Advisory lock: serialise collab-workspace creation per owner to prevent
        # concurrent requests both passing the count check (TOCTOU race).
        db.execute(_sql_text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"ws_collab_{owner_id}"})
        existing_collab_count = (
            db.query(Workspace)
            .filter(Workspace.owner_id == owner_id, Workspace.workspace_type == "collab")
            .count()
        )
        enforce_collab_workspace_limit(user_plan, existing_collab_count)

    workspace = Workspace(
        id=str(uuid.uuid4()),
        name=payload.name,
        workspace_type=workspace_type,
        is_shared=False,
        share_token=None,
        share_expires_at=None,
        owner_id=owner_id,
    )
    db.add(workspace)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Workspace already exists")
    db.refresh(workspace)

    # Seed creator as active admin member so the members list is consistent
    if owner_id:
        member = WorkspaceMemberDB(
            id=str(uuid.uuid4()),
            workspace_id=workspace.id,
            user_id=owner_id,
            email=owner_id,
            role="admin",
            status="active",
            invite_token=None,
            invited_by=owner_id,
            accepted_at=datetime.now(timezone.utc),
        )
        db.add(member)
        try:
            db.commit()
        except Exception:
            db.rollback()  # non-fatal — workspace was created successfully

    return WorkspaceOut(
        id=workspace.id,
        name=workspace.name,
        workspace_type=getattr(workspace, "workspace_type", "personal"),
        owner_id=workspace.owner_id,
        is_shared=bool(workspace.is_shared),
        share_token=workspace.share_token,
        share_expires_at=str(workspace.share_expires_at) if workspace.share_expires_at else None,
        share_scope=workspace.share_scope,
    )


@router.get("/", response_model=list[WorkspaceOut])
def list_workspaces(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> list[WorkspaceOut]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    caller = get_current_subject(authorization)
    # Workspaces where user is the owner OR an active member
    owned = db.query(Workspace).filter(Workspace.owner_id == caller).all()
    member_ws_ids = [
        m.workspace_id
        for m in db.query(WorkspaceMemberDB)
        .filter(WorkspaceMemberDB.user_id == caller, WorkspaceMemberDB.status == "active")
        .all()
    ]
    member_ws = db.query(Workspace).filter(Workspace.id.in_(member_ws_ids)).all() if member_ws_ids else []
    seen: set[str] = set()
    workspaces: list[Workspace] = []
    for w in owned + member_ws:
        if w.id not in seen:
            seen.add(w.id)
            workspaces.append(w)
    return [
        WorkspaceOut(
            id=w.id,
            name=w.name,
            workspace_type=getattr(w, "workspace_type", "personal"),
            owner_id=w.owner_id,
            is_shared=bool(w.is_shared),
            share_token=w.share_token,
            share_expires_at=str(w.share_expires_at) if w.share_expires_at else None,
            share_scope=w.share_scope,
        )
        for w in workspaces
    ]


@router.post("/{workspace_id}/share")
def share_workspace(
    workspace_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    expires_in_hours: int | None = None,
    scope: str | None = None,
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_plan = resolve_user_plan(db, authorization)
    enforce_min_plan(user_plan, "Team", "Workspace sharing")
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if not workspace.share_token:
        workspace.share_token = str(uuid.uuid4())
    if scope and settings.share_scope_allowlist and scope not in settings.share_scope_allowlist:
        raise HTTPException(status_code=400, detail="Invalid share scope")
    if scope and settings.share_scope_policy.get(scope):
        require_role(settings.share_scope_policy[scope], role)
    workspace.is_shared = True
    workspace.share_scope = scope
    if expires_in_hours:
        workspace.share_expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)
    else:
        workspace.share_expires_at = None
    db.commit()
    audit_store.add(
        AuditEntry(
            action="share.workspace",
            actor=authorization or "unknown",
            target=workspace_id,
            metadata={"expires_in_hours": expires_in_hours},
        )
    )
    signature = sign_token(workspace.share_token)
    share_url = ""
    if settings.public_base_url:
        base = f"{settings.public_base_url.rstrip('/')}/shared-workspace/{workspace.share_token}"
        if signature:
            share_url = f"{base}?sig={signature}"
        else:
            share_url = base
    return {
        "share_token": workspace.share_token,
        "share_url": share_url,
        "share_expires_at": str(workspace.share_expires_at) if workspace.share_expires_at else None,
        "signature": signature,
        "share_scope": workspace.share_scope,
    }


@router.post("/{workspace_id}/unshare")
def unshare_workspace(
    workspace_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    workspace.is_shared = False
    workspace.share_expires_at = None
    workspace.share_scope = None
    db.commit()
    audit_store.add(
        AuditEntry(
            action="unshare.workspace",
            actor=authorization or "unknown",
            target=workspace_id,
            metadata={},
        )
    )
    return {"status": "unshared", "workspace_id": workspace_id}


@router.post("/unshare-all")
def unshare_all_workspaces(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    rows = db.query(Workspace).filter(Workspace.is_shared.is_(True)).all()
    for row in rows:
        row.is_shared = False
        row.share_expires_at = None
        row.share_scope = None
    db.commit()
    audit_store.add(
        AuditEntry(
            action="unshare.workspace.all",
            actor=authorization or "unknown",
            target="workspaces",
            metadata={"count": len(rows)},
        )
    )
    return {"status": "unshared", "count": len(rows)}


@router.post("/purge-expired")
def purge_expired_workspaces(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    now = datetime.now(timezone.utc)
    rows = (
        db.query(Workspace)
        .filter(Workspace.is_shared.is_(True))
        .filter(Workspace.share_expires_at.isnot(None))
        .filter(Workspace.share_expires_at < now)
        .all()
    )
    for row in rows:
        row.is_shared = False
        row.share_expires_at = None
        row.share_scope = None
    db.commit()
    audit_store.add(
        AuditEntry(
            action="purge.workspace.expired",
            actor=authorization or "unknown",
            target="workspaces",
            metadata={"count": len(rows)},
        )
    )
    return {"status": "purged", "count": len(rows)}


@router.get("/shared/{share_token}", response_model=WorkspaceOut)
def get_shared_workspace(
    share_token: str,
    request: Request,
    sig: str | None = None,
    scope: str | None = None,
    db: Session = Depends(get_db),
) -> WorkspaceOut:
    client_ip = request.client.host if request.client else "unknown"
    if not _shared_limiter.allow(f"ws:{share_token}:{client_ip}"):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    if not verify_token(share_token, sig):
        raise HTTPException(status_code=403, detail="Invalid share signature")
    workspace = db.query(Workspace).filter(Workspace.share_token == share_token).first()
    if not workspace or not workspace.is_shared:
        raise HTTPException(status_code=404, detail="Shared workspace not found")
    if workspace.share_expires_at and workspace.share_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Shared link expired")
    if workspace.share_scope and workspace.share_scope != scope:
        raise HTTPException(status_code=403, detail="Invalid share scope")
    audit_store.add(
        AuditEntry(
            action="view.shared.workspace",
            actor=request.client.host if request.client else "unknown",
            target=workspace.id,
            metadata={"share_token": share_token},
        )
    )
    return WorkspaceOut(
        id=workspace.id,
        name=workspace.name,
        is_shared=True,
        share_token=workspace.share_token,
        share_expires_at=str(workspace.share_expires_at) if workspace.share_expires_at else None,
        share_scope=workspace.share_scope,
    )
