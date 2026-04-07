"""Add uploaded_by column to dataset_meta table.

Revision ID: 0042
Revises: 0041
Create Date: 2026-04-07
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_cols = {c["name"] for c in inspector.get_columns("dataset_meta")}
    if "uploaded_by" not in existing_cols:
        op.add_column(
            "dataset_meta",
            sa.Column("uploaded_by", sa.String(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("dataset_meta", "uploaded_by")
