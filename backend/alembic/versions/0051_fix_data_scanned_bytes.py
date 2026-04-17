"""Add data_scanned_bytes to user_usage if missing (idempotent safety-net)

Revision ID: 0051
Revises: 0050
Create Date: 2025-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "ALTER TABLE user_usage "
            "ADD COLUMN IF NOT EXISTS data_scanned_bytes BIGINT NOT NULL DEFAULT 0"
        )
    )


def downgrade() -> None:
    pass
