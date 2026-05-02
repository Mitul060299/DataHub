"""project_access.py — Helpers for project-scoped resource visibility.

Replaces ``workspace_access.py``. Collaboration is now project-level:
- A user can access a project if they own it OR are an active member of it.
- For artifact queries, the project owner's ``user_id`` is the canonical
  scope; member-originated artifacts are stored under the owner's user_id
  via the project-billing rule (see ``usage_service.resolve_billing_user_for_project``).

Usage
-----
    from .project_access import user_can_access_project, list_visible_project_ids

    if not user_can_access_project(project_id, current_user_id, db):
        raise HTTPException(403, "Not a member of this project")

    visible_projects = list_visible_project_ids(current_user_id, db)
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models_db import ProjectDB, ProjectMemberDB


def user_can_access_project(project_id: str, user_id: str, db: Session) -> bool:
    """Return True if ``user_id`` owns the project, is an org sibling of the
    owner, or is an active project-member."""
    if not project_id or not user_id:
        return False

    proj = (
        db.query(ProjectDB.user_id)
        .filter(ProjectDB.id == project_id)
        .first()
    )
    if proj is None:
        return False
    owner_id = proj[0]
    if owner_id == user_id:
        return True

    # Same-org siblings have implicit access to each other's projects.
    from .organization_service import list_org_sibling_user_ids
    if owner_id in list_org_sibling_user_ids(user_id, db):
        return True

    is_member = (
        db.query(ProjectMemberDB.id)
        .filter(
            ProjectMemberDB.project_id == project_id,
            ProjectMemberDB.user_id == user_id,
            ProjectMemberDB.status == "active",
        )
        .first()
    )
    return is_member is not None


def list_visible_project_ids(user_id: str, db: Session) -> set[str]:
    """Return the set of project_ids visible to ``user_id``.

    Visibility = owned ∪ project-member-of ∪ owned-by-org-sibling.
    The org-sibling rule lets every member of a Team/Business org see every
    project created by anyone in the org without per-project invites.
    """
    if not user_id:
        return set()

    from .organization_service import list_org_sibling_user_ids

    sibling_ids = list_org_sibling_user_ids(user_id, db)
    owned = {
        pid for (pid,) in
        db.query(ProjectDB.id).filter(ProjectDB.user_id.in_(sibling_ids)).all()
    }
    member_of = {
        pid for (pid,) in
        db.query(ProjectMemberDB.project_id)
        .filter(
            ProjectMemberDB.user_id == user_id,
            ProjectMemberDB.status == "active",
        )
        .all()
    }
    return owned | member_of


def get_project_owner(project_id: str, db: Session) -> str | None:
    """Return the user_id of the project owner, or None if project not found."""
    if not project_id:
        return None
    row = (
        db.query(ProjectDB.user_id)
        .filter(ProjectDB.id == project_id)
        .first()
    )
    return row[0] if row else None


def list_visible_owner_user_ids(user_id: str, db: Session) -> list[str]:
    """Return the set of project-owner user_ids whose artifacts are visible to ``user_id``.

    Includes:
    - ``user_id`` itself
    - every active org sibling (so all team-members see each other's data)
    - the owner of every project where ``user_id`` is an active project-member

    Use this for artifact list endpoints (dashboards, pipelines, canvas, datasets)
    that key off ``<artifact>.user_id``. The project-billing rule guarantees
    artifacts inside a shared project are always stored under the owner's user_id.
    """
    if not user_id:
        return []
    from .organization_service import list_org_sibling_user_ids
    owners: set[str] = set(list_org_sibling_user_ids(user_id, db))
    owners.add(user_id)
    rows = (
        db.query(ProjectDB.user_id)
        .join(ProjectMemberDB, ProjectMemberDB.project_id == ProjectDB.id)
        .filter(
            ProjectMemberDB.user_id == user_id,
            ProjectMemberDB.status == "active",
        )
        .all()
    )
    for (owner_id,) in rows:
        if owner_id:
            owners.add(owner_id)
    return list(owners)
