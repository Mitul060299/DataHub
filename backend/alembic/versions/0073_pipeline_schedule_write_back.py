"""0073_pipeline_schedule_write_back

Revision ID: 0073_pipeline_schedule_write_back
Revises: 0072_pipeline_step_parent
Create Date: 2026-05-16

Adds:
  - pipeline_schedules.write_back_config JSONB nullable
    Stores connector write-back destination config for scheduled pipeline runs.
    null = no write-back (existing behaviour).
    Structure: {
      "connector_type": "postgresql",
      "credential_id": "<uuid or null>",
      "connector_config": {...},   # inline creds when credential_id is null
      "table_name": "output_table",
      "mode": "append" | "replace"
    }

All DDL is idempotent (ADD COLUMN IF NOT EXISTS).
"""
from __future__ import annotations

from alembic import op

revision = "0073_pipeline_schedule_write_back"
down_revision = "0072_pipeline_step_parent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'pipeline_schedules'
                  AND column_name = 'write_back_config'
            ) THEN
                ALTER TABLE pipeline_schedules ADD COLUMN write_back_config JSONB;
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
                WHERE table_name = 'pipeline_schedules'
                  AND column_name = 'write_back_config'
            ) THEN
                ALTER TABLE pipeline_schedules DROP COLUMN write_back_config;
            END IF;
        END;
        $$;
        """
    )
