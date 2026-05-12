"""0070_activation_milestones

Revision ID: 0070_activation_milestones
Revises: 0069_usage_logs
Create Date: 2026-05-12

Adds:
  - Activation milestone timestamp columns to the users table
    (first_dataset_at, first_ai_answer_at, first_pipeline_step_at, first_export_at)
  - email_log table  — idempotency + Resend open/click tracking
  - email_preferences table — per-user opt-out + unsubscribe token

All DDL is idempotent (uses IF NOT EXISTS / DO $$ … $$).
"""
from __future__ import annotations

from alembic import op

revision = "0070_activation_milestones"
down_revision = "0069_usage_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Milestone timestamps on users ─────────────────────────────────────
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='first_dataset_at'
            ) THEN
                ALTER TABLE users ADD COLUMN first_dataset_at TIMESTAMPTZ;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='first_ai_answer_at'
            ) THEN
                ALTER TABLE users ADD COLUMN first_ai_answer_at TIMESTAMPTZ;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='first_pipeline_step_at'
            ) THEN
                ALTER TABLE users ADD COLUMN first_pipeline_step_at TIMESTAMPTZ;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='first_export_at'
            ) THEN
                ALTER TABLE users ADD COLUMN first_export_at TIMESTAMPTZ;
            END IF;
        END
        $$;
        """
    )

    # ── 2. email_log ──────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_log (
            id          BIGSERIAL    PRIMARY KEY,
            user_id     TEXT         NOT NULL,
            email       TEXT         NOT NULL,
            template    TEXT         NOT NULL,
            sent_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
            opened_at   TIMESTAMPTZ,
            clicked_at  TIMESTAMPTZ
        );
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_email_log_user_template
            ON email_log (user_id, template);
        """
    )

    # ── 3. email_preferences ─────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_preferences (
            user_id             TEXT        PRIMARY KEY,
            email               TEXT        NOT NULL,
            lifecycle_emails    BOOLEAN     NOT NULL DEFAULT TRUE,
            weekly_digest       BOOLEAN     NOT NULL DEFAULT TRUE,
            unsubscribe_token   TEXT        NOT NULL DEFAULT '',
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS email_preferences;")
    op.execute("DROP TABLE IF EXISTS email_log;")
    op.execute(
        """
        ALTER TABLE users
            DROP COLUMN IF EXISTS first_export_at,
            DROP COLUMN IF EXISTS first_pipeline_step_at,
            DROP COLUMN IF EXISTS first_ai_answer_at,
            DROP COLUMN IF EXISTS first_dataset_at;
        """
    )
