"""Add pipeline_steps_json column to dataset_meta for per-dataset step persistence.

Revision ID: 0049
Revises: 0048
Create Date: 2026-04-15
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect as sa_inspect
import sqlalchemy as sa

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_cols = {c["name"] for c in inspector.get_columns("dataset_meta")}
    if "pipeline_steps_json" not in existing_cols:
        op.add_column(
            "dataset_meta",
            sa.Column("pipeline_steps_json", sa.Text(), nullable=True, server_default=None),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_cols = {c["name"] for c in inspector.get_columns("dataset_meta")}
    if "pipeline_steps_json" in existing_cols:
        op.drop_column("dataset_meta", "pipeline_steps_json")
