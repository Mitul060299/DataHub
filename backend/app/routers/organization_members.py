"""organization_members.py — Org-account (Team-tier) member management.

Endpoints
---------
GET    /organization                          current user's org info + plan + seats
GET    /organization/members                  list active + pending org members
POST   /organization/invite                   invite a user to join the org by email
DELETE /organization/members/{member_id}      remove an invited or active member
GET    /invites/organizations/{token}/accept  accept an org invite token

Design
------
- The org owner is implicit via ``organizations.owner_user_id`` and is *not*
  stored in ``organization_members``.
- Personal orgs are created lazily on the first GET ``/organization`` call.
- Only the owner can invite or remove members; any active member may remove
  themselves (leave the org).
- Plan-gating: only Team / Business / Enterprise can have >0 invited members.
  Seat cap = subscription quantity (defaults to plan's included_seats).
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
from ..models import OrgMemberInvite, OrgMemberOut, OrgOut
from ..models_db import OrganizationDB, OrganizationMemberDB
from ..services import billing_repository
from ..services.email_service import send_org_invite
from ..services.organization_service import (
    count_org_seats,
    get_or_create_personal_org,
    get_org_for_user,
)
from ..services.plan_guard import (
    format_upgrade_message,
    normalize_plan,
    resolve_user_plan_by_id,
)
from ..services.plan_limits import get_limits


router = APIRouter(tags=["organization"])
org_invite_router = APIRouter(tags=["organization-invites"])


# ── Helpers ───────────────────────────────────────────────────────────────────

_PLANS_ALLOWING_INVITES: frozenset[str] = frozenset({"Team", "Business", "Enterprise"})


def _fmt(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _member_out(m: OrganizationMemberDB, *, is_owner: bool = False) -> OrgMemberOut:
    return OrgMemberOut(
        id=m.id,
        org_id=m.org_id,
        user_id=m.user_id,
        email=m.email,
        status=m.status,
        invited_by=m.invited_by,
        is_owner=is_owner,
        created_at=_fmt(m.created_at) or "",
        accepted_at=_fmt(m.accepted_at),
    )


def _build_invite_url(token: str) -> str:
    base = settings.public_base_url.rstrip("/") if settings.public_base_url else "https://datahub.org.in"
    return f"{base}/invite/{token}"


def _purchased_seats(billing_user_id: str, plan: str) -> int:
    limits = get_limits(plan)
    included = int(limits.get("included_seats", 1) or 1)
    if not billing_user_id:
        return included
    sub = billing_repository.get_active_subscription(billing_user_id)
    if not sub:
        return included
    qty = int(sub.get("quantity") or included)
    return max(qty, included)


def _resolve_org_or_403(current_user: CurrentUser, db: Session) -> OrganizationDB:
    """Return the org current_user belongs to (creating their personal one if needed)."""
    org = get_org_for_user(current_user.id, db)
    if org is None:
        org = get_or_create_personal_org(current_user.id, db)
    return org


def _require_org_owner(org: OrganizationDB, user_id: str) -> None:
    if org.owner_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the organization owner can manage team members.",
        )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/organization", response_model=OrgOut)
def get_my_organization(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrgOut:
    """Return the current user's org (creating their personal one on first call)."""
    org = _resolve_org_or_403(current_user, db)
    plan = resolve_user_plan_by_id(org.owner_user_id, db)
    return OrgOut(
        id=org.id,
        name=org.name,
        owner_user_id=org.owner_user_id,
        plan=plan,
        seats_purchased=_purchased_seats(org.owner_user_id, plan),
        seats_used=count_org_seats(org.id, db),
        is_owner=(org.owner_user_id == current_user.id),
    )


@router.get("/organization/members", response_model=list[OrgMemberOut])
def list_organization_members(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OrgMemberOut]:
    """List every member of the current user's org. Owner row is synthesised."""
    org = _resolve_org_or_403(current_user, db)

    members = (
        db.query(OrganizationMemberDB)
        .filter(OrganizationMemberDB.org_id == org.id)
        .order_by(OrganizationMemberDB.created_at)
        .all()
    )

    # Synthesise an owner row so the UI can render a complete list. We fetch
    # the owner's email lazily from the users table.
    from ..models_db import User as UserDB
    owner_row = db.query(UserDB).filter(UserDB.id == org.owner_user_id).first()
    owner_email = owner_row.username if owner_row else org.owner_user_id

    owner_synth = OrgMemberOut(
        id=f"owner:{org.owner_user_id}",
        org_id=org.id,
        user_id=org.owner_user_id,
        email=owner_email,
        status="active",
        invited_by=org.owner_user_id,
        is_owner=True,
        created_at=_fmt(org.created_at) or "",
        accepted_at=_fmt(org.created_at),
    )

    return [owner_synth] + [_member_out(m) for m in members]


@router.post("/organization/invite", response_model=OrgMemberOut, status_code=201)
def invite_organization_member(
    payload: OrgMemberInvite,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrgMemberOut:
    """Invite a user to join the current user's org. Owner-only.

    Plan gates:
    1. Owner's plan must be Team / Business / Enterprise.
    2. seats_used + 1 must not exceed seats_purchased.
    """
    org = _resolve_org_or_403(current_user, db)
    _require_org_owner(org, current_user.id)

    plan = resolve_user_plan_by_id(org.owner_user_id, db)
    if plan not in _PLANS_ALLOWING_INVITES:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "team_plan_required",
                "code": "team_plan_required",
                "plan": plan,
                "message": format_upgrade_message("Team members", plan, "Team"),
            },
        )

    purchased = _purchased_seats(org.owner_user_id, plan)
    used = count_org_seats(org.id, db)
    if used >= purchased:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "seat_limit_reached",
                "code": "seat_limit_reached",
                "plan": plan,
                "current_seats": used,
                "max_seats": purchased,
                "upgrade_url": "/settings/billing#add-seats",
                "message": (
                    f"You've used all {purchased} seats included in your "
                    f"{normalize_plan(plan)} plan. Add more seats from Billing "
                    f"settings to invite this member."
                ),
            },
        )

    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")

    # Reject inviting the owner's own email
    from ..models_db import User as UserDB
    owner_row = db.query(UserDB).filter(UserDB.id == org.owner_user_id).first()
    if owner_row and (owner_row.username or "").lower() == email:
        raise HTTPException(status_code=400, detail="You cannot invite yourself.")

    existing = (
        db.query(OrganizationMemberDB)
        .filter(
            OrganizationMemberDB.org_id == org.id,
            OrganizationMemberDB.email == email,
        )
        .first()
    )
    if existing:
        if existing.status == "active":
            raise HTTPException(
                status_code=409,
                detail="This person is already a member of your team.",
            )
        # Re-invite: refresh token
        existing.invite_token = str(uuid.uuid4())
        db.commit()
        db.refresh(existing)
        send_org_invite(
            to=email,
            inviter_name=owner_row.username if owner_row else current_user.email,
            org_name=org.name,
            accept_url=_build_invite_url(existing.invite_token),  # type: ignore[arg-type]
        )
        return _member_out(existing)

    member = OrganizationMemberDB(
        id=str(uuid.uuid4()),
        org_id=org.id,
        user_id=None,
        email=email,
        status="pending",
        invite_token=str(uuid.uuid4()),
        invited_by=current_user.id,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    send_org_invite(
        to=email,
        inviter_name=owner_row.username if owner_row else current_user.email,
        org_name=org.name,
        accept_url=_build_invite_url(member.invite_token),  # type: ignore[arg-type]
    )
    return _member_out(member)


@router.delete(
    "/organization/members/{member_id}",
    status_code=204,
    response_model=None,
)
def remove_organization_member(
    member_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    org = _resolve_org_or_403(current_user, db)

    member = (
        db.query(OrganizationMemberDB)
        .filter(
            OrganizationMemberDB.id == member_id,
            OrganizationMemberDB.org_id == org.id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    is_owner = org.owner_user_id == current_user.id
    is_self = member.user_id == current_user.id
    if not (is_owner or is_self):
        raise HTTPException(
            status_code=403,
            detail="Only the team owner can remove other members.",
        )

    db.delete(member)
    db.commit()


# ── Invite accept ────────────────────────────────────────────────────────────


@org_invite_router.get("/invites/organizations/{token}/accept")
def accept_organization_invite(
    token: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Accept an org invite. The user must be logged in with the invited email."""
    member = (
        db.query(OrganizationMemberDB)
        .filter(OrganizationMemberDB.invite_token == token)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Invite not found or already used.")

    base = settings.public_base_url.rstrip("/") if settings.public_base_url else ""

    if member.status == "active":
        return RedirectResponse(url=f"{base}/settings/team?joined=1")

    if (current_user.email or "").lower() != member.email.lower():
        raise HTTPException(
            status_code=403,
            detail=f"This invite was sent to {member.email}. Please log in with that account.",
        )

    # Refuse if user is already in another org (own or invited).
    existing = get_org_for_user(current_user.id, db)
    if existing is not None and existing.id != member.org_id:
        # If they own a personal org but have no other members, transparently
        # delete it so they can join the new team.
        owner_of_existing = existing.owner_user_id == current_user.id
        any_members = (
            db.query(OrganizationMemberDB.id)
            .filter(OrganizationMemberDB.org_id == existing.id)
            .first()
        )
        if owner_of_existing and any_members is None:
            db.delete(existing)
            db.commit()
        else:
            raise HTTPException(
                status_code=409,
                detail="You're already part of another organization. Leave it before joining a new one.",
            )

    member.user_id = current_user.id
    member.status = "active"
    member.invite_token = None
    member.accepted_at = datetime.now(timezone.utc)
    db.commit()

    return RedirectResponse(url=f"{base}/settings/team?joined=1")
