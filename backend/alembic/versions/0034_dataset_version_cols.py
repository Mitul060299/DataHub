"""0034_dataset_version_cols

Revision ID: 0034_dataset_version_cols
Revises: 0033_usage_tracking
Create Date: 2025-01-01

Adds version_number and version_note columns to dataset_meta.
Idempotent via IF NOT EXISTS.
"""
from alembic import op
from sqlalchemy import text

revision = "0034_dataset_version_cols"
down_revision = "0033_usage_tracking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Query which columns already exist so we can skip ALTER TABLE entirely when
    # the work is already done.  ALTER TABLE always acquires ACCESS EXCLUSIVE even
    # with IF NOT EXISTS, so skipping it at the Python level avoids lock contention
    # on re-deploys where the columns were added by a previous (possibly failed)
    # deploy attempt.
    existing = {
        row[0]
        for row in conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'dataset_meta' "
                "AND column_name IN ('version_number', 'version_note')"
            )
        )
    }

    need_alter = {"version_number", "version_note"} - existing
    if need_alter:
        # Short lock_timeout so the statement fails fast and the entrypoint can
        # retry rather than queuing for the full deployment timeout.
        op.execute("SET lock_timeout = '30s'")
        if "version_number" in need_alter:
            op.execute(
                "ALTER TABLE dataset_meta ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1"
            )
        if "version_note" in need_alter:
            op.execute("ALTER TABLE dataset_meta ADD COLUMN version_note TEXT")
        op.execute("SET lock_timeout = '0'")

    # Index creation is safe with IF NOT EXISTS regardless of lock state
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_datasets_parent_id ON dataset_meta (parent_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_datasets_parent_id")
    op.execute("ALTER TABLE dataset_meta DROP COLUMN IF EXISTS version_note")
    op.execute("ALTER TABLE dataset_meta DROP COLUMN IF EXISTS version_number")
