"""0081_add_forked_from_step_id

Revision ID: 0081_add_forked_from_step_id
Revises: 0080_cross_pipeline_inputs
Create Date: 2026-05-22

Catch-all migration that guarantees both the cross_pipeline_inputs table
and dataset_meta.forked_from_step_id column exist, regardless of whether
0080 was stamped by the entrypoint's duplicate-detection logic before its
DDL actually executed.

All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so this is
fully idempotent — safe to run on a DB where 0080 applied cleanly.
"""
from __future__ import annotations

from alembic import op

revision = "0081_add_forked_from_step_id"
down_revision = "0080_cross_pipeline_inputs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure the table exists (idempotent — covers the case where 0080 was
    # stamped before its CREATE TABLE ran).
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
    # Ensure the column exists (idempotent — ADD COLUMN IF NOT EXISTS is
    # supported on PostgreSQL 9.6+ and avoids needing a DO block).
    op.execute(
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS forked_from_step_id TEXT"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE dataset_meta DROP COLUMN IF EXISTS forked_from_step_id")
    op.execute("DROP TABLE IF EXISTS cross_pipeline_inputs")
