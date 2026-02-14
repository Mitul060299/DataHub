"""user plan

Revision ID: 0014_user_plan
Revises: 0013_pipelines
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa

revision = "0014_user_plan"
down_revision = "0013_pipelines"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("plan", sa.String(), nullable=False, server_default="Free"),
    )
    op.alter_column("users", "plan", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "plan")
