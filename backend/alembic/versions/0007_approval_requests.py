"""approval requests

Revision ID: 0007_approval_requests
Revises: 0006_dataset_lineage
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_approval_requests"
down_revision = "0006_dataset_lineage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "approval_requests",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("requester", sa.String(), nullable=False),
        sa.Column("resource_type", sa.String(), nullable=False),
        sa.Column("resource_id", sa.String(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_approval_requests_resource", "approval_requests", ["resource_type", "resource_id"])


def downgrade() -> None:
    op.drop_index("ix_approval_requests_resource", table_name="approval_requests")
    op.drop_table("approval_requests")
