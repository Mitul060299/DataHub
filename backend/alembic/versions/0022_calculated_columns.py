"""add calculated columns table

Revision ID: 0022_calculated_columns
Revises: 0021_dataset_meta_user_id
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0022_calculated_columns"
down_revision = "0021_dataset_meta_user_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "calculated_columns" not in inspector.get_table_names():
        op.create_table(
            "calculated_columns",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("dataset_id", sa.String(), sa.ForeignKey("dataset_meta.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("formula", sa.Text(), nullable=False),
            sa.Column("column_type", sa.Text(), nullable=False, server_default="dynamic"),
            sa.Column("cached_value", sa.Text(), nullable=True),
            sa.Column("display_name", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.UniqueConstraint("dataset_id", "name", name="uq_calculated_columns_dataset_name"),
        )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("calculated_columns")}
    if "idx_calculated_columns_dataset" not in existing_indexes:
        op.create_index("idx_calculated_columns_dataset", "calculated_columns", ["dataset_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "calculated_columns" in inspector.get_table_names():
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("calculated_columns")}
        if "idx_calculated_columns_dataset" in existing_indexes:
            op.drop_index("idx_calculated_columns_dataset", table_name="calculated_columns")
        op.drop_table("calculated_columns")
