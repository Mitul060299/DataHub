"""0028_user_onboarding

Add has_completed_onboarding and has_uploaded_first_file columns to users table.

Revision ID: 0028_user_onboarding
Revises: 0027_viz_dashboard_v2_extend
Create Date: 2026-03-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "0028_user_onboarding"
down_revision = "0027_viz_dashboard_v2_extend"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    return column in [c["name"] for c in sa_inspect(bind).get_columns(table)]


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "users", "has_completed_onboarding"):
        op.add_column(
            "users",
            sa.Column("has_completed_onboarding", sa.Boolean(), nullable=False, server_default="false"),
        )
    if not _has_column(bind, "users", "has_uploaded_first_file"):
        op.add_column(
            "users",
            sa.Column("has_uploaded_first_file", sa.Boolean(), nullable=False, server_default="false"),
        )


def downgrade() -> None:
    op.drop_column("users", "has_uploaded_first_file")
    op.drop_column("users", "has_completed_onboarding")
