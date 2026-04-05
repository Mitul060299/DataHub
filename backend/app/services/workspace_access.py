"""workspace_access.py — Helpers for workspace-scoped resource visibility.

Usage
-----
    from .workspace_access import get_visible_user_ids

    visible = get_visible_user_ids(db, requesting_user_id, workspace_id)
    projects = db.query(ProjectDB).filter(ProjectDB.user_id.in_(visible)).all()

If the requesting user is an active member of the workspace, all active
members' user_ids are returned so their resources are visible.

If the user is not in the workspace_members table (solo user / pre-membership
tenant), only their own user_id is returned — full backwards compatibility.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models_db import WorkspaceMemberDB


def get_visible_user_ids(db: Session, requesting_user_id: str, workspace_id: str) -> list[str]:
    """Return the set of user_ids whose resources are visible to the requester.

    Returns only [requesting_user_id] when:
    - workspace_id is blank / 'default' (legacy single-user mode)
    - the user is not an active member of the workspace
    """
    if not workspace_id or workspace_id == "default":
        return [requesting_user_id]

    # Is the requester an active member?
    is_member = (
        db.query(WorkspaceMemberDB)
        .filter(
            WorkspaceMemberDB.workspace_id == workspace_id,
            WorkspaceMemberDB.user_id == requesting_user_id,
            WorkspaceMemberDB.status == "active",
        )
        .first()
    )
    if not is_member:
        return [requesting_user_id]

    # Gather all active members' user_ids
    rows = (
        db.query(WorkspaceMemberDB.user_id)
        .filter(
            WorkspaceMemberDB.workspace_id == workspace_id,
            WorkspaceMemberDB.status == "active",
            WorkspaceMemberDB.user_id.isnot(None),
        )
        .all()
    )
    ids = [r[0] for r in rows if r[0]]
    # Always include the requester in case DB is inconsistent
    if requesting_user_id not in ids:
        ids.append(requesting_user_id)
    return ids
