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
    """Return True if ``user_id`` owns the project or is an active member."""
    if not project_id or not user_id:
        return False

    proj = (
        db.query(ProjectDB.user_id)
        .filter(ProjectDB.id == project_id)
        .first()
    )
    if proj is None:
        return False
    if proj[0] == user_id:
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
    """Return the set of project_ids visible to ``user_id`` — owned ∪ member-of."""
    if not user_id:
        return set()

    owned = {
        pid for (pid,) in
        db.query(ProjectDB.id).filter(ProjectDB.user_id == user_id).all()
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
