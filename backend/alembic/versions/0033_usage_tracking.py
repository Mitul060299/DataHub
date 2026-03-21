"""0033_usage_tracking

Revision ID: 0033_usage_tracking
Revises: 0032_ensure_user_onboarding_cols
Create Date: 2025-01-01

Creates the user_usage table that tracks monthly per-user counters.
Idempotent: uses CREATE TABLE IF NOT EXISTS.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0033_usage_tracking"
down_revision = "0032_ensure_user_onboarding_cols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_usage (
            id          SERIAL PRIMARY KEY,
            user_id     TEXT        NOT NULL,
            period      TEXT        NOT NULL,  -- YYYY-MM
            api_calls           INTEGER NOT NULL DEFAULT 0,
            pipeline_runs       INTEGER NOT NULL DEFAULT 0,
            datasets_uploaded   INTEGER NOT NULL DEFAULT 0,
            storage_bytes_used  BIGINT  NOT NULL DEFAULT 0,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (user_id, period)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_usage_user_period "
        "ON user_usage (user_id, period)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_usage")
