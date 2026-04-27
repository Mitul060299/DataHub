"""project_members.py — Per-project collaboration management.

Endpoints
---------
POST   /projects/{project_id}/members            invite a user by email
GET    /projects/{project_id}/members            list active + pending members
PUT    /projects/{project_id}/members/{id}       update member role
DELETE /projects/{project_id}/members/{id}       remove member
GET    /projects/{project_id}/member-usage       project-scoped usage summary
GET    /invites/projects/{token}/accept          accept a project invite token

The project owner is implicit via ``projects.user_id`` and is *not* stored in
``project_members``. Only the owner may invite, change roles, or remove
members; any member may remove themselves.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..dependencies import CurrentUser, get_current_user
from ..models import (
    ProjectMemberInvite,
    ProjectMemberOut,
    ProjectMemberUpdate,
)
from ..models_db import ProjectDB, ProjectMemberDB
from ..services.email_service import send_project_invite
from ..services import usage_service
from ..services.plan_guard import (
    enforce_collaborative_project_limit,
    enforce_member_seat_limit,
    enforce_project_member_limit,
    resolve_project_plan,
    resolve_user_plan_by_id,
)


router = APIRouter(tags=["project-members"])
project_invite_router = APIRouter(tags=["project-invites"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _member_out(m: ProjectMemberDB) -> ProjectMemberOut:
    return ProjectMemberOut(
        id=m.id,
        project_id=m.project_id,
        user_id=m.user_id,
        email=m.email,
        role=m.role,
        status=m.status,
        invited_by=m.invited_by,
        created_at=_fmt(m.created_at) or "",
        accepted_at=_fmt(m.accepted_at),
    )


def _get_project_or_404(project_id: str, db: Session) -> ProjectDB:
    proj = db.query(ProjectDB).filter(ProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj


def _require_project_owner(project: ProjectDB, user_id: str) -> None:
    if project.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the project owner can perform this action.",
        )


def _require_project_access(project: ProjectDB, user_id: str, db: Session) -> None:
    if project.user_id == user_id:
        return
    member = (
        db.query(ProjectMemberDB)
        .filter(
            ProjectMemberDB.project_id == project.id,
            ProjectMemberDB.user_id == user_id,
            ProjectMemberDB.status == "active",
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this project.")


def _build_invite_url(token: str) -> str:
    base = settings.public_base_url.rstrip("/") if settings.public_base_url else "https://datahub.org.in"
    return f"{base}/invite/{token}"


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "/projects/{project_id}/members",
    response_model=ProjectMemberOut,
    status_code=201,
)
def invite_project_member(
    project_id: str,
    payload: ProjectMemberInvite,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectMemberOut:
    """Invite a user to a project by email. Owner-only.

    Plan gates (in order):
    1. ``enforce_project_member_limit`` — per-project member cap.
    2. ``enforce_collaborative_project_limit`` — only when going 0→1 member.
    3. ``enforce_member_seat_limit`` — total purchased seats across the owner.
    """
    proj = _get_project_or_404(project_id, db)
    _require_project_owner(proj, current_user.id)

    billing_user_id, billing_plan = resolve_project_plan(project_id, current_user.id, db)

    # Per-project cap
    enforce_project_member_limit(project_id, billing_plan, db)

    # Collaborative-project cap (only when adding the FIRST member to this project)
    existing_member_count = (
        db.query(ProjectMemberDB)
        .filter(
            ProjectMemberDB.project_id == project_id,
            ProjectMemberDB.status.in_(["active", "pending"]),
        )
        .count()
    )
    if existing_member_count == 0:
        enforce_collaborative_project_limit(billing_user_id, billing_plan, db)

    # Cross-account seat cap
    enforce_member_seat_limit(billing_user_id, billing_plan, db)

    email = payload.email.strip().lower()

    existing = (
        db.query(ProjectMemberDB)
        .filter(
            ProjectMemberDB.project_id == project_id,
            ProjectMemberDB.email == email,
        )
        .first()
    )
    if existing:
        if existing.status == "active":
            raise HTTPException(
                status_code=409,
                detail="This user is already a member of this project.",
            )
        # Re-invite: refresh token and role
        existing.invite_token = str(uuid.uuid4())
        existing.role = payload.role
        db.commit()
        db.refresh(existing)
        send_project_invite(
            to=email,
            inviter_name=current_user.email,
            project_name=proj.name,
            accept_url=_build_invite_url(existing.invite_token),  # type: ignore[arg-type]
        )
        return _member_out(existing)

    member = ProjectMemberDB(
        id=str(uuid.uuid4()),
        project_id=project_id,
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

    send_project_invite(
        to=email,
        inviter_name=current_user.email,
        project_name=proj.name,
        accept_url=_build_invite_url(member.invite_token),  # type: ignore[arg-type]
    )
    return _member_out(member)


@router.get(
    "/projects/{project_id}/members",
    response_model=list[ProjectMemberOut],
)
def list_project_members(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ProjectMemberOut]:
    proj = _get_project_or_404(project_id, db)
    _require_project_access(proj, current_user.id, db)
    members = (
        db.query(ProjectMemberDB)
        .filter(ProjectMemberDB.project_id == project_id)
        .order_by(ProjectMemberDB.created_at)
        .all()
    )
    return [_member_out(m) for m in members]


@router.put(
    "/projects/{project_id}/members/{member_id}",
    response_model=ProjectMemberOut,
)
def update_project_member_role(
    project_id: str,
    member_id: str,
    payload: ProjectMemberUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectMemberOut:
    proj = _get_project_or_404(project_id, db)
    _require_project_owner(proj, current_user.id)
    member = (
        db.query(ProjectMemberDB)
        .filter(
            ProjectMemberDB.id == member_id,
            ProjectMemberDB.project_id == project_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.role = payload.role
    db.commit()
    db.refresh(member)
    return _member_out(member)


@router.delete(
    "/projects/{project_id}/members/{member_id}",
    status_code=204,
    response_model=None,
)
def remove_project_member(
    project_id: str,
    member_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    proj = _get_project_or_404(project_id, db)
    member = (
        db.query(ProjectMemberDB)
        .filter(
            ProjectMemberDB.id == member_id,
            ProjectMemberDB.project_id == project_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    is_owner = proj.user_id == current_user.id
    is_self = member.user_id == current_user.id
    if not (is_owner or is_self):
        raise HTTPException(
            status_code=403,
            detail="Only the project owner can remove other members.",
        )

    db.delete(member)
    db.commit()


@router.get("/projects/{project_id}/member-usage")
def project_member_usage(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Return owner's monthly usage for this project, with member count.

    First-cut implementation: returns owner totals + member count. Per-member
    breakdown is a follow-up.
    """
    proj = _get_project_or_404(project_id, db)
    _require_project_access(proj, current_user.id, db)
    owner_id = proj.user_id
    owner_plan = resolve_user_plan_by_id(owner_id, db)
    owner_usage = usage_service.get_usage(owner_id, db)

    member_count = (
        db.query(ProjectMemberDB)
        .filter(
            ProjectMemberDB.project_id == project_id,
            ProjectMemberDB.status.in_(["active", "pending"]),
        )
        .count()
    )

    return {
        "project_id": project_id,
        "owner_id": owner_id,
        "plan": owner_plan,
        "member_count": member_count + 1,  # +1 for owner
        "owner_usage": owner_usage,
    }


# ── Invite accept (standalone router, no /projects prefix) ────────────────────


@project_invite_router.get("/invites/projects/{token}/accept")
def accept_project_invite(
    token: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Accept a project invite. The user must be logged in."""
    member = (
        db.query(ProjectMemberDB)
        .filter(ProjectMemberDB.invite_token == token)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Invite not found or already used.")

    base = settings.public_base_url.rstrip("/") if settings.public_base_url else ""

    if member.status == "active":
        return RedirectResponse(url=f"{base}/projects/{member.project_id}")

    if current_user.email.lower() != member.email.lower():
        raise HTTPException(
            status_code=403,
            detail=f"This invite was sent to {member.email}. Please log in with that account.",
        )

    member.user_id = current_user.id
    member.status = "active"
    member.invite_token = None
    member.accepted_at = datetime.now(timezone.utc)
    db.commit()

    return RedirectResponse(url=f"{base}/projects/{member.project_id}?joined=1")
