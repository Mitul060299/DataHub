"""dataset lineage

Revision ID: 0006_dataset_lineage
Revises: 0005_agent_feedback
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_dataset_lineage"
down_revision = "0005_agent_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dataset_meta", sa.Column("parent_id", sa.String(), nullable=True))
    op.create_index("ix_dataset_meta_parent_id", "dataset_meta", ["parent_id"])


def downgrade() -> None:
    op.drop_index("ix_dataset_meta_parent_id", table_name="dataset_meta")
    op.drop_column("dataset_meta", "parent_id")
