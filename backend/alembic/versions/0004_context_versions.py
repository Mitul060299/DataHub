"""context versions

Revision ID: 0004_context_versions
Revises: 0003_dataset_chunks
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_context_versions"
down_revision = "0003_dataset_chunks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "context_versions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("glossary", postgresql.JSONB(), nullable=False),
        sa.Column("rules", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_context_versions_workspace_id", "context_versions", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("ix_context_versions_workspace_id", table_name="context_versions")
    op.drop_table("context_versions")
