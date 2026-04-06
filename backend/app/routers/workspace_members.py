"""workspace_members.py — Team membership management for workspaces.

Endpoints
---------
POST   /workspaces/{workspace_id}/members          invite a user by email
GET    /workspaces/{workspace_id}/members          list active + pending members
PUT    /workspaces/{workspace_id}/members/{id}     update member role
DELETE /workspaces/{workspace_id}/members/{id}     remove member
GET    /invites/{token}/accept                     accept an invite token
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import CurrentUser, get_current_user
from ..models import WorkspaceMemberInvite, WorkspaceMemberOut, WorkspaceMemberUpdate
from ..models_db import WorkspaceMemberDB, Workspace
from ..config import settings
from ..config.plan_limits import get_limits
from ..services.email_service import send_email

router = APIRouter(tags=["workspace-members"])
invite_router = APIRouter(tags=["workspace-invites"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _member_out(m: WorkspaceMemberDB) -> WorkspaceMemberOut:
    return WorkspaceMemberOut(
        id=m.id,
        workspace_id=m.workspace_id,
        user_id=m.user_id,
        email=m.email,
        role=m.role,
        status=m.status,
        invited_by=m.invited_by,
        created_at=_fmt(m.created_at) or "",
        accepted_at=_fmt(m.accepted_at),
    )


def _get_workspace_or_404(workspace_id: str, db: Session) -> Workspace:
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


def _require_workspace_admin(workspace_id: str, user_id: str, db: Session) -> None:
    """Raise 403 unless user is an active admin member of the workspace."""
    member = (
        db.query(WorkspaceMemberDB)
        .filter(
            WorkspaceMemberDB.workspace_id == workspace_id,
            WorkspaceMemberDB.user_id == user_id,
            WorkspaceMemberDB.status == "active",
        )
        .first()
    )
    if not member or member.role != "admin":
        raise HTTPException(status_code=403, detail="Only workspace admins can perform this action.")


def _require_workspace_member(workspace_id: str, user_id: str, db: Session) -> None:
    """Raise 403 unless user is an active member of the workspace."""
    member = (
        db.query(WorkspaceMemberDB)
        .filter(
            WorkspaceMemberDB.workspace_id == workspace_id,
            WorkspaceMemberDB.user_id == user_id,
            WorkspaceMemberDB.status == "active",
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this workspace.")


def _send_invite_email(to_email: str, inviter_name: str, workspace_name: str, token: str) -> None:
    base = settings.public_base_url.rstrip("/") if settings.public_base_url else "https://datahub.org.in"
    invite_url = f"{base}/invite/{token}"
    html = f"""<!DOCTYPE html>
<html>
<body style="background:#0a0a0c;color:#e8e8f0;font-family:Inter,sans-serif;padding:32px;">
  <div style="max-width:520px;margin:0 auto;">
    <h2 style="color:#5B6AF0;margin-bottom:8px;">DataHub</h2>
    <h3 style="margin-bottom:16px;">You've been invited to join <strong>{workspace_name}</strong></h3>
    <p style="color:#a0a0a8;margin-bottom:24px;">
      <strong>{inviter_name}</strong> has invited you to collaborate on the
      <strong>{workspace_name}</strong> workspace in DataHub.
    </p>
    <a href="{invite_url}"
       style="display:inline-block;background:#5B6AF0;color:#fff;text-decoration:none;
              padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
      Accept Invitation
    </a>
    <p style="color:#55555f;font-size:12px;margin-top:24px;">
      Or copy this link: {invite_url}
    </p>
    <p style="color:#55555f;font-size:12px;">
      This invite expires when revoked by the workspace admin.
    </p>
  </div>
</body>
</html>"""
    send_email(
        to=to_email,
        subject=f"You've been invited to {workspace_name} on DataHub",
        html=html,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/{workspace_id}/members", response_model=WorkspaceMemberOut, status_code=201)
def invite_member(
    workspace_id: str,
    payload: WorkspaceMemberInvite,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceMemberOut:
    """Invite a user to a workspace by email. Requires Team plan or higher."""
    # Plan check
    limits = get_limits(current_user.plan)
    max_members = limits["max_team_members"]
    if max_members == 1:
        raise HTTPException(
            status_code=403,
            detail="Team collaboration requires the Team plan or higher.",
        )

    ws = _get_workspace_or_404(workspace_id, db)
    _require_workspace_admin(workspace_id, current_user.id, db)

    # Member cap check
    active_count = (
        db.query(WorkspaceMemberDB)
        .filter(
            WorkspaceMemberDB.workspace_id == workspace_id,
            WorkspaceMemberDB.status == "active",
        )
        .count()
    )
    if max_members != -1 and active_count >= max_members:
        raise HTTPException(
            status_code=403,
            detail=f"Your plan allows a maximum of {max_members} members.",
        )

    email = payload.email.strip().lower()

    # Duplicate check
    existing = (
        db.query(WorkspaceMemberDB)
        .filter(
            WorkspaceMemberDB.workspace_id == workspace_id,
            WorkspaceMemberDB.email == email,
        )
        .first()
    )
    if existing:
        if existing.status == "active":
            raise HTTPException(status_code=409, detail="This user is already a member of this workspace.")
        # Re-invite: refresh token
        existing.invite_token = str(uuid.uuid4())
        existing.role = payload.role
        db.commit()
        db.refresh(existing)
        _send_invite_email(email, current_user.email, ws.name, existing.invite_token)  # type: ignore[arg-type]
        return _member_out(existing)

    member = WorkspaceMemberDB(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        user_id=None,
        email=email,
        role=payload.role,
        status="pending",
        invite_token=str(uuid.uuid4()),
        invited_by=current_user.id,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    _send_invite_email(email, current_user.email, ws.name, member.invite_token)  # type: ignore[arg-type]
    return _member_out(member)


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberOut])
def list_members(
    workspace_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WorkspaceMemberOut]:
    """List active and pending members of a workspace."""
    _get_workspace_or_404(workspace_id, db)
    _require_workspace_member(workspace_id, current_user.id, db)
    members = (
        db.query(WorkspaceMemberDB)
        .filter(WorkspaceMemberDB.workspace_id == workspace_id)
        .order_by(WorkspaceMemberDB.created_at)
        .all()
    )
    return [_member_out(m) for m in members]


@router.put("/{workspace_id}/members/{member_id}", response_model=WorkspaceMemberOut)
def update_member_role(
    workspace_id: str,
    member_id: str,
    payload: WorkspaceMemberUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceMemberOut:
    """Update a member's role. Requires admin privileges."""
    _get_workspace_or_404(workspace_id, db)
    _require_workspace_admin(workspace_id, current_user.id, db)
    member = (
        db.query(WorkspaceMemberDB)
        .filter(WorkspaceMemberDB.id == member_id, WorkspaceMemberDB.workspace_id == workspace_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    # Prevent demoting the last admin
    if member.role == "admin" and payload.role != "admin":
        admin_count = (
            db.query(WorkspaceMemberDB)
            .filter(
                WorkspaceMemberDB.workspace_id == workspace_id,
                WorkspaceMemberDB.role == "admin",
                WorkspaceMemberDB.status == "active",
            )
            .count()
        )
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the only admin of a workspace.")
    member.role = payload.role
    db.commit()
    db.refresh(member)
    return _member_out(member)


@router.delete("/{workspace_id}/members/{member_id}", status_code=204, response_model=None)
def remove_member(
    workspace_id: str,
    member_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Remove a member or revoke a pending invite. Admins can remove anyone; members can remove themselves."""
    _get_workspace_or_404(workspace_id, db)
    member = (
        db.query(WorkspaceMemberDB)
        .filter(WorkspaceMemberDB.id == member_id, WorkspaceMemberDB.workspace_id == workspace_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Allow self-removal OR admin removal
    caller_is_admin = (
        db.query(WorkspaceMemberDB)
        .filter(
            WorkspaceMemberDB.workspace_id == workspace_id,
            WorkspaceMemberDB.user_id == current_user.id,
            WorkspaceMemberDB.status == "active",
            WorkspaceMemberDB.role == "admin",
        )
        .first()
    )
    if member.user_id != current_user.id and not caller_is_admin:
        raise HTTPException(status_code=403, detail="Only workspace admins can remove other members.")

    # Prevent removing the last active admin
    if member.role == "admin" and member.status == "active":
        admin_count = (
            db.query(WorkspaceMemberDB)
            .filter(
                WorkspaceMemberDB.workspace_id == workspace_id,
                WorkspaceMemberDB.role == "admin",
                WorkspaceMemberDB.status == "active",
            )
            .count()
        )
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the only admin of a workspace.")

    db.delete(member)
    db.commit()


# ── Invite accept (standalone router, no /workspaces prefix) ──────────────────

@invite_router.get("/invites/{token}/accept")
def accept_invite(
    token: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Accept a workspace invite. The user must be logged in."""
    member = (
        db.query(WorkspaceMemberDB)
        .filter(WorkspaceMemberDB.invite_token == token)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Invite not found or already used.")
    if member.status == "active":
        # Already accepted — just redirect home
        base = settings.public_base_url.rstrip("/") if settings.public_base_url else ""
        return RedirectResponse(url=f"{base}/home")

    # Verify the logged-in user's email matches the invite
    if current_user.email.lower() != member.email.lower():
        raise HTTPException(
            status_code=403,
            detail=f"This invite was sent to {member.email}. Please log in with that account.",
        )

    member.user_id = current_user.id
    member.status = "active"
    member.invite_token = None  # consume the token
    member.accepted_at = datetime.now(timezone.utc)
    db.commit()

    base = settings.public_base_url.rstrip("/") if settings.public_base_url else ""
    return RedirectResponse(url=f"{base}/home?joined=1")
