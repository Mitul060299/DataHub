"""0081_add_forked_from_step_id

Revision ID: 0081_add_forked_from_step_id
Revises: 0080_cross_pipeline_inputs
Create Date: 2026-05-22

Ensures dataset_meta.forked_from_step_id column exists.

0080_cross_pipeline_inputs included this DDL but may have been stamped
as applied by the entrypoint's duplicate-detection logic before the column
was actually created. This migration adds it idempotently with no FK
constraint to avoid any reference issues.
"""
from __future__ import annotations

from alembic import op

revision = "0081_add_forked_from_step_id"
down_revision = "0080_cross_pipeline_inputs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'dataset_meta'
                  AND column_name = 'forked_from_step_id'
            ) THEN
                ALTER TABLE dataset_meta ADD COLUMN forked_from_step_id TEXT;
            END IF;
        END;
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'dataset_meta'
                  AND column_name = 'forked_from_step_id'
            ) THEN
                ALTER TABLE dataset_meta DROP COLUMN forked_from_step_id;
            END IF;
        END;
        $$;
        """
    )
