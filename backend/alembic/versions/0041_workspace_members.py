"""Add workspace_members table and owner_id to workspaces.

Revision ID: 0041
Revises: 0040
Create Date: 2026-04-05
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0041"
down_revision = "0040_connector_credentials"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add owner_id to workspaces (nullable for backwards compat)
    op.add_column(
        "workspaces",
        sa.Column("owner_id", sa.String(), nullable=True),
    )

    # Create workspace_members table
    op.create_table(
        "workspace_members",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="viewer"),
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

    op.create_index("idx_wm_workspace_id", "workspace_members", ["workspace_id"])
    op.create_index("idx_wm_user_id", "workspace_members", ["user_id"])
    op.create_index(
        "idx_wm_invite_token", "workspace_members", ["invite_token"], unique=True
    )
    op.create_index(
        "idx_wm_workspace_email",
        "workspace_members",
        ["workspace_id", "email"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("idx_wm_workspace_email", table_name="workspace_members")
    op.drop_index("idx_wm_invite_token", table_name="workspace_members")
    op.drop_index("idx_wm_user_id", table_name="workspace_members")
    op.drop_index("idx_wm_workspace_id", table_name="workspace_members")
    op.drop_table("workspace_members")
    op.drop_column("workspaces", "owner_id")
