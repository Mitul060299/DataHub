"""Repair: add uploaded_by to dataset_meta if skipped by bad stamp.

Migration 0042 was stamped-over by the entrypoint's DuplicateColumn recovery
logic, so the column may never have been added. This migration is safe to run
on any DB state.

Revision ID: 0043
Revises: 0042
Create Date: 2026-04-07
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


revision = "0043"
down_revision = "0042"
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
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_cols = {c["name"] for c in inspector.get_columns("dataset_meta")}
    if "uploaded_by" in existing_cols:
        op.drop_column("dataset_meta", "uploaded_by")
