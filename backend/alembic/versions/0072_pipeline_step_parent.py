"""0072_pipeline_step_parent

Revision ID: 0072_pipeline_step_parent
Revises: 0070_activation_milestones
Create Date: 2026-05-12

Adds:
  - pipeline_steps.parent_step_id TEXT nullable
    Stores the ID of the step this step branched off for Phase 2 fork support.
    null = linear trunk step.

All DDL is idempotent (ADD COLUMN IF NOT EXISTS).
"""
from __future__ import annotations

from alembic import op

revision = "0072_pipeline_step_parent"
down_revision = "0070_activation_milestones"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'pipeline_steps'
                  AND column_name = 'parent_step_id'
            ) THEN
                ALTER TABLE pipeline_steps ADD COLUMN parent_step_id TEXT;
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
                WHERE table_name = 'pipeline_steps'
                  AND column_name = 'parent_step_id'
            ) THEN
                ALTER TABLE pipeline_steps DROP COLUMN parent_step_id;
            END IF;
        END;
        $$;
        """
    )
