"""0069_usage_logs

Revision ID: 0069_usage_logs
Revises: 0068_add_organizations
Create Date: 2026-05-05

Creates the usage_logs table for per-call AI token tracking.
Idempotent: uses CREATE TABLE IF NOT EXISTS.
"""
from __future__ import annotations

from alembic import op

revision = "0069_usage_logs"
down_revision = "0068_add_organizations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS usage_logs (
            id              BIGSERIAL PRIMARY KEY,
            user_id         TEXT        NOT NULL,
            session_id      TEXT        NOT NULL DEFAULT '',
            timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
            model_used      TEXT        NOT NULL DEFAULT '',
            query_type      TEXT        NOT NULL DEFAULT 'unknown',
            input_tokens    INTEGER     NOT NULL DEFAULT 0,
            output_tokens   INTEGER     NOT NULL DEFAULT 0,
            cost_score      INTEGER     NOT NULL DEFAULT 0,
            dataset_rows    BIGINT      NOT NULL DEFAULT 0
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_logs_user_ts "
        "ON usage_logs (user_id, timestamp)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_logs_session "
        "ON usage_logs (session_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS usage_logs")
