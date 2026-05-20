"""add is_quickstart column to projects

Revision ID: 0076_quickstart_project
Revises: 0075_delete_quickstart_projects
Create Date: 2026-05-20

Adds `is_quickstart` boolean to the projects table.  Projects flagged
is_quickstart=True are the auto-provisioned onboarding project.
Datasets inside them do not count against the user's quota limits.
All DDL is idempotent (checks column existence before adding).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "0076_quickstart_project"
down_revision = "0075_delete_quickstart_projects"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    cols = [c["name"] for c in sa_inspect(bind).get_columns(table)]
    return column in cols


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "projects", "is_quickstart"):
        op.add_column(
            "projects",
            sa.Column(
                "is_quickstart",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )


def downgrade() -> None:
    op.drop_column("projects", "is_quickstart")
