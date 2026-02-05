"""share expiry

Revision ID: 0010_share_expiry
Revises: 0009_workspace_sharing
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_share_expiry"
down_revision = "0009_workspace_sharing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dashboards", sa.Column("share_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("workspaces", sa.Column("share_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("workspaces", "share_expires_at")
    op.drop_column("dashboards", "share_expires_at")
