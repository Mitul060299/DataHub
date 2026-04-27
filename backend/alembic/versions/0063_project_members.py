"""Add project_members table for project-level collaboration.

Replaces workspace_members as the source of truth for who can collaborate on
a project. Workspace tables are dropped in alembic 0066 once data is migrated
in 0064 and resources are re-scoped in 0065.

Revision ID: 0063_project_members
Revises: 0062_billing_intl_and_idempotency
Create Date: 2026-04-27
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


revision = "0063_project_members"
down_revision = "0062_billing_intl_and_idempotency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    # Guard against re-runs against an already-migrated DB. In offline (--sql)
    # mode the bind is a MockConnection that doesn't support inspect(); just
    # skip the guard there since DDL is emitted unconditionally.
    try:
        inspector = sa_inspect(conn)
        if inspector.has_table("project_members"):
            return
    except Exception:
        pass

    op.create_table(
        "project_members",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="editor"),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("invite_token", sa.String(), unique=True, nullable=True),
        sa.Column("invited_by", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index("idx_pm_project_id", "project_members", ["project_id"])
    op.create_index("idx_pm_user_id", "project_members", ["user_id"])
    op.create_index(
        "idx_pm_invite_token", "project_members", ["invite_token"], unique=True
    )
    op.create_index(
        "idx_pm_project_email",
        "project_members",
        ["project_id", "email"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("idx_pm_project_email", table_name="project_members")
    op.drop_index("idx_pm_invite_token", table_name="project_members")
    op.drop_index("idx_pm_user_id", table_name="project_members")
    op.drop_index("idx_pm_project_id", table_name="project_members")
    op.drop_table("project_members")
