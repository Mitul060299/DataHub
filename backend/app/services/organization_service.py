"""organization_service.py — Helpers for the org-account model.

An "organization" is the billing entity. One paying user (the owner) can
invite N other users by email; once accepted, those users become equal
project-layer members. Quota & subscription always resolve to the org owner.

Personal orgs are created lazily — the first time a user calls a function
in this module that needs an org, one is created on demand. No backfill
migration is required.
"""
from __future__ import annotations

import uuid
from sqlalchemy.orm import Session

from ..models_db import OrganizationDB, OrganizationMemberDB, User


def get_or_create_personal_org(user_id: str, db: Session) -> OrganizationDB:
    """Return the org owned by ``user_id``, creating one on first call.

    Each user owns exactly one personal org. Use this for resolving the
    billing entity for a user who hasn't been invited to anyone else's org.
    """
    org = (
        db.query(OrganizationDB)
        .filter(OrganizationDB.owner_user_id == user_id)
        .first()
    )
    if org:
        return org

    user = None
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except Exception:
        # User table may not exist (tests using bare SQLite). Fall back to default.
        db.rollback()
    name = (user.username if user and user.username else "My Organization")
    org = OrganizationDB(
        id=str(uuid.uuid4()),
        owner_user_id=user_id,
        name=name,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def get_org_for_user(user_id: str, db: Session) -> OrganizationDB | None:
    """Return the org this user belongs to (owner OR active member), or None.

    Lookup order:
    1. Org where ``user_id`` is the owner.
    2. Org where ``user_id`` is an active member.
    Does NOT create a personal org — use ``get_or_create_personal_org`` for that.
    """
    if not user_id:
        return None
    own = (
        db.query(OrganizationDB)
        .filter(OrganizationDB.owner_user_id == user_id)
        .first()
    )
    if own:
        return own
    member = (
        db.query(OrganizationMemberDB)
        .filter(
            OrganizationMemberDB.user_id == user_id,
            OrganizationMemberDB.status == "active",
        )
        .first()
    )
    if member is None:
        return None
    return (
        db.query(OrganizationDB)
        .filter(OrganizationDB.id == member.org_id)
        .first()
    )


def resolve_org_owner_user_id(user_id: str, db: Session) -> str:
    """Return the user_id whose plan/quota/subscription should be used for ``user_id``.

    - If user is in someone else's org as an active member → return that org's owner.
    - Otherwise → return user_id itself (they're their own billing entity).

    Lazy and side-effect-free: does NOT create a personal org row.
    """
    if not user_id:
        return user_id
    member = (
        db.query(OrganizationMemberDB.org_id)
        .filter(
            OrganizationMemberDB.user_id == user_id,
            OrganizationMemberDB.status == "active",
        )
        .first()
    )
    if member is None:
        return user_id
    org = (
        db.query(OrganizationDB.owner_user_id)
        .filter(OrganizationDB.id == member[0])
        .first()
    )
    if org is None or not org[0]:
        return user_id
    return org[0]


def list_org_sibling_user_ids(user_id: str, db: Session) -> list[str]:
    """Return user_ids of every active member (incl. owner) in the same org.

    If ``user_id`` isn't part of any org yet, returns ``[user_id]`` so callers
    can use this uniformly for visibility queries.
    """
    if not user_id:
        return []
    org = get_org_for_user(user_id, db)
    if org is None:
        return [user_id]
    siblings: set[str] = {org.owner_user_id}
    rows = (
        db.query(OrganizationMemberDB.user_id)
        .filter(
            OrganizationMemberDB.org_id == org.id,
            OrganizationMemberDB.status == "active",
            OrganizationMemberDB.user_id.isnot(None),
        )
        .all()
    )
    for (uid,) in rows:
        if uid:
            siblings.add(uid)
    return list(siblings)


def count_org_seats(org_id: str, db: Session) -> int:
    """Count seats consumed by an org: owner + every active OR pending invite."""
    invites = (
        db.query(OrganizationMemberDB.id)
        .filter(
            OrganizationMemberDB.org_id == org_id,
            OrganizationMemberDB.status.in_(["active", "pending"]),
        )
        .count()
    )
    return invites + 1  # +1 for the owner
