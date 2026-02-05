"""dataset chunks

Revision ID: 0003_dataset_chunks
Revises: 0002_audit_logs
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_dataset_chunks"
down_revision = "0002_audit_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_chunks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("dataset_id", sa.String(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("rows", postgresql.JSONB(), nullable=False),
    )
    op.create_index("ix_dataset_chunks_dataset_id", "dataset_chunks", ["dataset_id"])


def downgrade() -> None:
    op.drop_index("ix_dataset_chunks_dataset_id", table_name="dataset_chunks")
    op.drop_table("dataset_chunks")
