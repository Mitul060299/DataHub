"""agent feedback

Revision ID: 0005_agent_feedback
Revises: 0004_context_versions
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_agent_feedback"
down_revision = "0004_context_versions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_feedback",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("dataset_id", sa.String(), nullable=False),
        sa.Column("rating", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_agent_feedback_dataset_id", "agent_feedback", ["dataset_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_feedback_dataset_id", table_name="agent_feedback")
    op.drop_table("agent_feedback")
