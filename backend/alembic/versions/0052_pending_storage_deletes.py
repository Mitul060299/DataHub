"""Add pending_storage_deletes queue table for orphan-file cleanup.

Revision ID: 0052
Revises: 0051
Create Date: 2026-04-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_tables = set(inspector.get_table_names())
    if "pending_storage_deletes" in existing_tables:
        return
    op.create_table(
        "pending_storage_deletes",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False, server_default="dataset"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_pending_storage_deletes_next_attempt",
        "pending_storage_deletes",
        ["next_attempt_at"],
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "pending_storage_deletes" not in set(inspector.get_table_names()):
        return
    try:
        op.drop_index(
            "idx_pending_storage_deletes_next_attempt",
            table_name="pending_storage_deletes",
        )
    except Exception:
        pass
    op.drop_table("pending_storage_deletes")
