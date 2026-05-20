"""add is_sample column to projects

Revision ID: 0074_starter_project
Revises: 0073_pipeline_schedule_write_back
Create Date: 2026-05-20

Adds `is_sample` boolean to the projects table.  Projects flagged
is_sample=True are quota-exempt — their datasets do not count against
the user's max_datasets or max_storage_bytes limits.  Used for the
auto-provisioned "Starter" project that every new user receives.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "0074_starter_project"
down_revision = "0073_pipeline_schedule_write_back"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    cols = [c["name"] for c in sa_inspect(bind).get_columns(table)]
    return column in cols


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "projects", "is_sample"):
        op.add_column(
            "projects",
            sa.Column(
                "is_sample",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )


def downgrade() -> None:
    op.drop_column("projects", "is_sample")
