"""0031_fix_user_onboarding_cols

Idempotent fallback: ensure has_completed_onboarding and has_uploaded_first_file
exist on the users table.

Migration 0028 may have been stamped as applied without the DDL executing
(e.g. if the column-add was already attempted and errored, or if the DB was
stamped directly).  This migration re-adds the columns safely using inspector
checks so the app can start on any environment regardless of 0028's state.

Revision ID: 0031_fix_user_onboarding_cols
Revises: 0030_pipeline_steps_artifacts
Create Date: 2026-03-21
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "0031_fix_user_onboarding_cols"
down_revision = "0030_pipeline_steps_artifacts"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    return column in [c["name"] for c in sa_inspect(bind).get_columns(table)]


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_column(bind, "users", "has_completed_onboarding"):
        op.add_column(
            "users",
            sa.Column(
                "has_completed_onboarding",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )

    if not _has_column(bind, "users", "has_uploaded_first_file"):
        op.add_column(
            "users",
            sa.Column(
                "has_uploaded_first_file",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "users", "has_uploaded_first_file"):
        op.drop_column("users", "has_uploaded_first_file")
    if _has_column(bind, "users", "has_completed_onboarding"):
        op.drop_column("users", "has_completed_onboarding")
