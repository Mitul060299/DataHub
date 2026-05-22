"""0082_ensure_forked_step_col

Revision ID: 0082_ensure_forked_step_col
Revises: 0081_add_forked_from_step_id
Create Date: 2026-05-22

Production safety-net migration.

Both 0080 and 0081 were stamped as applied without their DDL executing
because the entrypoint's stamp-to-HEAD logic fired when an older build of
0080 (which had a DO-block FK constraint) failed with "already exists".
The stamp marked ALL pending revisions — including 0081 — as done before
they ran.

This migration is genuinely NEW to production (alembic_version is at 0081
but neither 0080 nor 0081 DDL ran), so it will actually execute.

All statements are fully idempotent — safe to run on a DB where 0081 did
apply cleanly.
"""
from __future__ import annotations

from alembic import op

revision = "0082_ensure_forked_step_col"
down_revision = "0081_add_forked_from_step_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure the table exists.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS cross_pipeline_inputs (
            id                  TEXT PRIMARY KEY,
            consumer_dataset_id TEXT NOT NULL REFERENCES dataset_meta(id) ON DELETE CASCADE,
            source_step_id      TEXT NOT NULL REFERENCES pipeline_steps(id) ON DELETE CASCADE,
            source_dataset_id   TEXT NOT NULL,
            alias               TEXT NOT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (consumer_dataset_id, alias)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cross_pipeline_consumer "
        "ON cross_pipeline_inputs (consumer_dataset_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cross_pipeline_source_step "
        "ON cross_pipeline_inputs (source_step_id)"
    )
    # Ensure the column exists.
    op.execute(
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS forked_from_step_id TEXT"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE dataset_meta DROP COLUMN IF EXISTS forked_from_step_id")
    op.execute("DROP TABLE IF EXISTS cross_pipeline_inputs")
