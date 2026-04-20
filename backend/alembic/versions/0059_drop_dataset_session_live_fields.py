"""Drop the live_* state columns from dataset_sessions.

Background
----------
``dataset_sessions`` was originally introduced (alembic 0055) to hold the
chat-session binding AND the "live preview" pointer for an in-progress
pipeline:

* ``live_table_name``  – name of the DuckDB session table for the leaf
* ``live_row_count``   – row count of that table
* ``live_step_label``  – display label
* ``live_rows_changed``- delta vs the previous step

In practice this turned out to be the source of every "ghost artifact"
bug we shipped: the row would point at a DuckDB table that no longer
existed (server restart, TTL eviction, instance suspension) and the UI
would render a clickable artifact that 500'd on every interaction.

We now derive the live preview entirely from the latest ``pipeline_steps``
row (``output_table`` + ``snapshot_path``) on the frontend.  Storing the
same information server-side just creates two sources of truth that
inevitably drift apart.

This migration drops all four columns.  ``chat_session_id`` is kept --
it is the durable binding the agent uses to find prior steps for a
dataset.

Revision ID: 0059
Revises: 0058
Create Date: 2026-04-20
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect as sa_inspect


revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None


_DROP_COLS = (
    "live_table_name",
    "live_row_count",
    "live_step_label",
    "live_rows_changed",
)


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "dataset_sessions" not in set(inspector.get_table_names()):
        return
    cols = {c["name"] for c in inspector.get_columns("dataset_sessions")}
    for col in _DROP_COLS:
        if col in cols:
            # Use raw SQL with IF EXISTS to survive concurrent re-runs.
            op.execute(f"ALTER TABLE dataset_sessions DROP COLUMN IF EXISTS {col}")


def downgrade() -> None:
    # Best-effort restore.  Data is unrecoverable -- the columns will come
    # back NULL.
    op.execute("ALTER TABLE dataset_sessions ADD COLUMN IF NOT EXISTS live_table_name TEXT")
    op.execute("ALTER TABLE dataset_sessions ADD COLUMN IF NOT EXISTS live_row_count BIGINT")
    op.execute("ALTER TABLE dataset_sessions ADD COLUMN IF NOT EXISTS live_step_label TEXT")
    op.execute("ALTER TABLE dataset_sessions ADD COLUMN IF NOT EXISTS live_rows_changed BIGINT")
