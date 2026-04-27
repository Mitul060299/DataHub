"""Migrate workspace_members rows onto project_members (faithful, idempotent).

For every active or pending row in ``workspace_members``:
  * Find every project in that workspace.
  * For each (project, member) pair where the member is *not* the project
    owner, insert one ``project_members`` row preserving ``user_id``, ``email``,
    ``status``, ``invite_token``, ``invited_by``, ``created_at`` and
    ``accepted_at``. The ``admin`` role is downgraded to ``editor`` because the
    project owner already has implicit admin power.

Idempotent: re-runs are no-ops thanks to the unique ``(project_id, email)``
constraint introduced in 0063 (uses ON CONFLICT DO NOTHING).

Revision ID: 0064_migrate_workspace_to_project_members
Revises: 0063_project_members
Create Date: 2026-04-27
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect as sa_inspect


revision = "0064_migrate_workspace_to_project_members"
down_revision = "0063_project_members"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Offline (--sql) mode uses a MockConnection that doesn't support
    # inspect(); emit the migration SQL unconditionally in that case.
    try:
        inspector = sa_inspect(bind)
        table_names = set(inspector.get_table_names())
        # Skip migration entirely if either side is missing — preserves greenfield
        # installs that never had workspace_members.
        if "workspace_members" not in table_names or "project_members" not in table_names:
            return
        if "projects" not in table_names:
            return
    except Exception:
        pass

    op.execute(
        """
        INSERT INTO project_members (
            id, project_id, user_id, email, role, status,
            invite_token, invited_by, created_at, accepted_at
        )
        SELECT
            md5(random()::text || clock_timestamp()::text)::text AS id,
            p.id AS project_id,
            wm.user_id,
            wm.email,
            CASE WHEN wm.role = 'admin' THEN 'editor' ELSE wm.role END AS role,
            wm.status,
            wm.invite_token,
            wm.invited_by,
            COALESCE(wm.created_at, now()) AS created_at,
            wm.accepted_at
        FROM workspace_members wm
        JOIN projects p
          ON p.workspace_id = wm.workspace_id
        WHERE wm.status IN ('active', 'pending')
          AND (wm.user_id IS NULL OR wm.user_id <> p.user_id)
          AND LOWER(wm.email) <> COALESCE(
            (SELECT LOWER(u.email) FROM users u WHERE u.id = p.user_id),
            ''
          )
        ON CONFLICT (project_id, email) DO NOTHING
        """
    )


def downgrade() -> None:
    # Best-effort downgrade: clear project_members rows that originated from
    # workspace migration. We can't perfectly distinguish them after the fact,
    # so we wipe pending+active rows whose invite_token also exists in
    # workspace_members.
    bind = op.get_bind()
    try:
        inspector = sa_inspect(bind)
        table_names = set(inspector.get_table_names())
        if "workspace_members" not in table_names or "project_members" not in table_names:
            return
    except Exception:
        pass
    op.execute(
        """
        DELETE FROM project_members pm
        WHERE pm.invite_token IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.invite_token = pm.invite_token
          )
        """
    )
