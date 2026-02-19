"""add dataset_meta user_id

Revision ID: 0021_dataset_meta_user_id
Revises: 0020_chat_pipelines
Create Date: 2026-02-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "0021_dataset_meta_user_id"
down_revision = "0020_chat_pipelines"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    existing_columns = {col["name"] for col in inspector.get_columns("dataset_meta")}
    if "user_id" not in existing_columns:
        op.add_column("dataset_meta", sa.Column("user_id", sa.String(), nullable=True))

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("dataset_meta")}
    if "idx_datasets_user_workspace" not in existing_indexes:
        op.create_index(
            "idx_datasets_user_workspace",
            "dataset_meta",
            ["user_id", "workspace_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("dataset_meta")}
    if "idx_datasets_user_workspace" in existing_indexes:
        op.drop_index("idx_datasets_user_workspace", table_name="dataset_meta")

    existing_columns = {col["name"] for col in inspector.get_columns("dataset_meta")}
    if "user_id" in existing_columns:
        op.drop_column("dataset_meta", "user_id")
