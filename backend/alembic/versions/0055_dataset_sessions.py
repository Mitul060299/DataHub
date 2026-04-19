"""Add dataset_sessions table for server-side live workspace state.

Stores the live preview / chat-session bindings that previously only existed
in browser localStorage so refresh / multi-tab / multi-device all show the
same in-progress workspace.

Revision ID: 0055
Revises: 0054
Create Date: 2026-04-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "dataset_sessions" in set(inspector.get_table_names()):
        return
    op.create_table(
        "dataset_sessions",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("dataset_id", sa.String(), nullable=False),
        sa.Column("chat_session_id", sa.String(), nullable=True),
        sa.Column("live_table_name", sa.String(), nullable=True),
        sa.Column("live_row_count", sa.BigInteger(), nullable=True),
        sa.Column("live_step_label", sa.Text(), nullable=True),
        sa.Column("live_rows_changed", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_dataset_sessions_user_id", "dataset_sessions", ["user_id"]
    )
    op.create_index(
        "ix_dataset_sessions_dataset_id", "dataset_sessions", ["dataset_id"]
    )
    op.create_index(
        "ux_dataset_sessions_user_dataset",
        "dataset_sessions",
        ["user_id", "dataset_id"],
        unique=True,
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "dataset_sessions" not in set(inspector.get_table_names()):
        return
    existing = {ix["name"] for ix in inspector.get_indexes("dataset_sessions")}
    for name in (
        "ux_dataset_sessions_user_dataset",
        "ix_dataset_sessions_dataset_id",
        "ix_dataset_sessions_user_id",
    ):
        if name in existing:
            op.drop_index(name, table_name="dataset_sessions")
    op.drop_table("dataset_sessions")
