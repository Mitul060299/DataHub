"""Add pipeline_events append-only event log.

Revision ID: 0053
Revises: 0052
Create Date: 2026-04-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.dialects.postgresql import JSONB

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "pipeline_events" in set(inspector.get_table_names()):
        return
    op.create_table(
        "pipeline_events",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("workspace_id", sa.String(), nullable=True),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("run_id", sa.String(), nullable=True),
        sa.Column("step_id", sa.String(), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "idx_pipeline_events_user_id",
        "pipeline_events",
        ["user_id"],
    )
    op.create_index(
        "idx_pipeline_events_session_id",
        "pipeline_events",
        ["session_id"],
    )
    op.create_index(
        "idx_pipeline_events_event_type",
        "pipeline_events",
        ["event_type"],
    )
    op.create_index(
        "idx_pipeline_events_created_at",
        "pipeline_events",
        ["created_at"],
    )
    op.create_index(
        "idx_pipeline_events_user_created",
        "pipeline_events",
        ["user_id", "created_at"],
    )
    op.create_index(
        "idx_pipeline_events_session_created",
        "pipeline_events",
        ["session_id", "created_at"],
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "pipeline_events" not in set(inspector.get_table_names()):
        return
    for idx in (
        "idx_pipeline_events_user_id",
        "idx_pipeline_events_session_id",
        "idx_pipeline_events_event_type",
        "idx_pipeline_events_created_at",
        "idx_pipeline_events_user_created",
        "idx_pipeline_events_session_created",
    ):
        try:
            op.drop_index(idx, table_name="pipeline_events")
        except Exception:
            pass
    op.drop_table("pipeline_events")
