"""Add deleted_at column to dataset_meta for soft-delete (Trash + retention).

Revision ID: 0054
Revises: 0053
Create Date: 2026-04-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "dataset_meta" not in set(inspector.get_table_names()):
        return
    cols = {c["name"] for c in inspector.get_columns("dataset_meta")}
    if "deleted_at" not in cols:
        op.add_column(
            "dataset_meta",
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        )
    existing_indexes = {ix["name"] for ix in inspector.get_indexes("dataset_meta")}
    if "idx_datasets_deleted_at" not in existing_indexes:
        op.create_index(
            "idx_datasets_deleted_at",
            "dataset_meta",
            ["deleted_at"],
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "dataset_meta" not in set(inspector.get_table_names()):
        return
    existing_indexes = {ix["name"] for ix in inspector.get_indexes("dataset_meta")}
    if "idx_datasets_deleted_at" in existing_indexes:
        op.drop_index("idx_datasets_deleted_at", table_name="dataset_meta")
    cols = {c["name"] for c in inspector.get_columns("dataset_meta")}
    if "deleted_at" in cols:
        op.drop_column("dataset_meta", "deleted_at")
