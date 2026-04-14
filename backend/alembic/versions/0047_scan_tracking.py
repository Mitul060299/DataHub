"""Add data_scanned_bytes to user_usage table.

Revision ID: 0047
Revises: 0046
Create Date: 2026-04-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)

    existing_cols = {c["name"] for c in inspector.get_columns("user_usage")}
    if "data_scanned_bytes" not in existing_cols:
        op.add_column(
            "user_usage",
            sa.Column("data_scanned_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_cols = {c["name"] for c in inspector.get_columns("user_usage")}
    if "data_scanned_bytes" in existing_cols:
        op.drop_column("user_usage", "data_scanned_bytes")
