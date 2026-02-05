"""dashboard sharing

Revision ID: 0008_dashboard_sharing
Revises: 0007_approval_requests
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_dashboard_sharing"
down_revision = "0007_approval_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dashboards", sa.Column("is_shared", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("dashboards", sa.Column("share_token", sa.String(), nullable=True))
    op.create_index("ix_dashboards_share_token", "dashboards", ["share_token"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_dashboards_share_token", table_name="dashboards")
    op.drop_column("dashboards", "share_token")
    op.drop_column("dashboards", "is_shared")
