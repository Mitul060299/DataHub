"""jobs and webhooks

Revision ID: 0012_jobs_webhooks
Revises: 0011_share_scope
Create Date: 2026-02-11
"""

from alembic import op
import sqlalchemy as sa

revision = "0012_jobs_webhooks"
down_revision = "0011_share_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "webhooks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("target_url", sa.Text(), nullable=False),
        sa.Column("event", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "scheduled_jobs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("cron", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="scheduled"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("scheduled_jobs")
    op.drop_table("webhooks")
