"""0032_ensure_user_onboarding_cols

Uses native PostgreSQL ADD COLUMN IF NOT EXISTS to guarantee the two
onboarding columns exist on the users table.  This bypasses any Alembic
inspector caching / stamp issues that caused 0028 and 0031 to be skipped.

Revision ID: 0032_ensure_user_onboarding_cols
Revises: 0031_fix_user_onboarding_cols
Create Date: 2026-03-21
"""
from __future__ import annotations

from alembic import op

revision = "0032_ensure_user_onboarding_cols"
down_revision = "0031_fix_user_onboarding_cols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL natively supports ADD COLUMN IF NOT EXISTS — no Python
    # inspector involved, so this cannot be skipped due to caching.
    op.execute(
        "ALTER TABLE users "
        "ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        "ALTER TABLE users "
        "ADD COLUMN IF NOT EXISTS has_uploaded_first_file BOOLEAN NOT NULL DEFAULT false"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS has_uploaded_first_file")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS has_completed_onboarding")
