"""Safely add pipeline_steps_json column to dataset_meta using ADD COLUMN IF NOT EXISTS.

This migration is a recovery migration for 0049 which may have been skipped
if the entrypoint's alembic stamp-head recovery path stamped the DB to 0049
without actually running the upgrade body.

Revision ID: 0050
Revises: 0049
Create Date: 2026-04-15
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use raw SQL ADD COLUMN IF NOT EXISTS — idempotent at DB level,
    # works even if 0049 already added the column or if it was skipped.
    op.execute(
        sa.text(
            "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS pipeline_steps_json TEXT"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "ALTER TABLE dataset_meta DROP COLUMN IF EXISTS pipeline_steps_json"
        )
    )
