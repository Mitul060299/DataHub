"""Add snapshot_path column to pipeline_steps for replay-from-Parquet.

Each successful pipeline step now writes its output VIEW out to a Parquet
file in object storage immediately after execution. The S3-style storage
key is recorded here so that ``_replay_session_views`` can re-create the
view via ``CREATE VIEW x AS SELECT * FROM read_parquet('<path>')`` instead
of re-executing the original SQL.

Why this matters
----------------
Re-executing SQL on session restore is fragile:
* Non-deterministic SQL (``RANDOM()``, ``NOW()``, unseeded ``SAMPLE``)
  produces different rows each replay — the artifact the user sees after
  refresh no longer matches what they saw before.
* Long chains on big files take 30+s to replay, often exceeding Render's
  free-tier 512 MB OOM-kill threshold.
* Source schema drift (re-uploaded CSV with renamed columns) explodes
  every step that referenced the renamed column.

Snapshots make replay deterministic and O(1) per step.

Revision ID: 0058
Revises: 0057
Create Date: 2026-04-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "pipeline_steps" not in set(inspector.get_table_names()):
        return
    cols = {c["name"] for c in inspector.get_columns("pipeline_steps")}
    if "snapshot_path" not in cols:
        op.add_column(
            "pipeline_steps",
            sa.Column("snapshot_path", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "pipeline_steps" not in set(inspector.get_table_names()):
        return
    cols = {c["name"] for c in inspector.get_columns("pipeline_steps")}
    if "snapshot_path" in cols:
        op.drop_column("pipeline_steps", "snapshot_path")
