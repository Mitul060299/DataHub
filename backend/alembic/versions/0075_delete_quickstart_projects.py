"""delete auto-provisioned Quickstart/Starter projects

Revision ID: 0075_delete_quickstart_projects
Revises: 0074_starter_project
Create Date: 2026-05-20

Removes any project rows whose name is exactly "Quickstart" or "Starter"
that were auto-created by the old provisioning code (now removed).
Only deletes projects that have no datasets attached, so user-created
projects with those names are preserved.
"""
from __future__ import annotations

from alembic import op

revision = "0075_delete_quickstart_projects"
down_revision = "0074_starter_project"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM projects
        WHERE lower(name) IN ('quickstart', 'starter')
          AND id NOT IN (
              SELECT DISTINCT project_id
              FROM dataset_meta
              WHERE project_id IS NOT NULL
          )
        """
    )


def downgrade() -> None:
    # Data deletion is not reversible
    pass
