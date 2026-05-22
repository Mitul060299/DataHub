"""0080_cross_pipeline_inputs

Revision ID: 0080_cross_pipeline_inputs
Revises: 0076_quickstart_project
Create Date: 2026-05-22

Adds:
  - cross_pipeline_inputs table  — tracks which step snapshots a pipeline
    imports as named alias tables so the AI agent can JOIN/reconcile across
    datasets without the user manually wiring anything.
  - dataset_meta.forked_from_step_id TEXT nullable  — lineage pointer set
    when a dataset is created by branching off a pipeline step.

All DDL is idempotent.
"""
from __future__ import annotations

from alembic import op

revision = "0080_cross_pipeline_inputs"
down_revision = "0076_quickstart_project"
branch_labels = None
depends_on = None


def upgrade() -> None:
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
        );

        CREATE INDEX IF NOT EXISTS idx_cross_pipeline_consumer
            ON cross_pipeline_inputs (consumer_dataset_id);

        CREATE INDEX IF NOT EXISTS idx_cross_pipeline_source_step
            ON cross_pipeline_inputs (source_step_id);
        """
    )

    op.execute(
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS forked_from_step_id TEXT"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE dataset_meta DROP COLUMN IF EXISTS forked_from_step_id")
    op.execute("DROP TABLE IF EXISTS cross_pipeline_inputs")
