"""workspace sharing

Revision ID: 0009_workspace_sharing
Revises: 0008_dashboard_sharing
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_workspace_sharing"
down_revision = "0008_dashboard_sharing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("is_shared", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("workspaces", sa.Column("share_token", sa.String(), nullable=True))
    op.create_index("ix_workspaces_share_token", "workspaces", ["share_token"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_workspaces_share_token", table_name="workspaces")
    op.drop_column("workspaces", "share_token")
    op.drop_column("workspaces", "is_shared")
