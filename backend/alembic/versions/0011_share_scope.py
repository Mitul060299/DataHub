"""share scope

Revision ID: 0011_share_scope
Revises: 0010_share_expiry
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0011_share_scope"
down_revision = "0010_share_expiry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dashboards", sa.Column("share_scope", sa.String(), nullable=True))
    op.add_column("workspaces", sa.Column("share_scope", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("workspaces", "share_scope")
    op.drop_column("dashboards", "share_scope")
