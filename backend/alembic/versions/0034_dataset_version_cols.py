"""0034_dataset_version_cols

Revision ID: 0034_dataset_version_cols
Revises: 0033_usage_tracking
Create Date: 2025-01-01

Adds version_number and version_note columns to dataset_meta.
Idempotent via IF NOT EXISTS.
"""
from alembic import op

revision = "0034_dataset_version_cols"
down_revision = "0033_usage_tracking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1"
    )
    op.execute(
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS version_note TEXT"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_datasets_parent_id ON dataset_meta (parent_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_datasets_parent_id")
    op.execute("ALTER TABLE dataset_meta DROP COLUMN IF EXISTS version_note")
    op.execute("ALTER TABLE dataset_meta DROP COLUMN IF EXISTS version_number")
