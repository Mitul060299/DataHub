"""add feedback table

Revision ID: 0024_feedback_table
Revises: 0023_dashboards_v2
Create Date: 2026-03-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision = "0024_feedback_table"
down_revision = "0023_dashboards_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "feedback" not in inspector.get_table_names():
        op.create_table(
            "feedback",
            sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("email", sa.Text(), nullable=False),
            sa.Column("subject", sa.Text(), nullable=True),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "feedback" in inspector.get_table_names():
        op.drop_table("feedback")
