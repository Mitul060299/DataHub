"""Add project_id column to dataset_meta so datasets are project-scoped.

Before this change, datasets were only scoped to ``(user_id, workspace_id)``
and the frontend's ``?project_id=...`` filter was silently ignored by
``GET /datasets``. That meant every project inside a workspace showed the
*same* list of datasets and deleting + recreating a project (even with a
different name) appeared to "resurrect" the old uploads because they were
never actually associated with the project in the first place.

This migration adds a nullable ``project_id`` column + index. ``NULL`` means
"workspace-level / not scoped to any project" so legacy rows stay visible
in an "All datasets" view. New uploads set ``project_id`` from the
``X-Project-Id`` header (or the form field) sent by the frontend.

Revision ID: 0057
Revises: 0056
Create Date: 2026-04-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "dataset_meta" not in set(inspector.get_table_names()):
        return
    cols = {c["name"] for c in inspector.get_columns("dataset_meta")}
    if "project_id" not in cols:
        op.add_column(
            "dataset_meta",
            sa.Column("project_id", sa.String(), nullable=True),
        )
    existing_indexes = {ix["name"] for ix in inspector.get_indexes("dataset_meta")}
    if "ix_dataset_meta_project_id" not in existing_indexes:
        op.create_index(
            "ix_dataset_meta_project_id", "dataset_meta", ["project_id"]
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "dataset_meta" not in set(inspector.get_table_names()):
        return
    existing_indexes = {ix["name"] for ix in inspector.get_indexes("dataset_meta")}
    if "ix_dataset_meta_project_id" in existing_indexes:
        op.drop_index("ix_dataset_meta_project_id", table_name="dataset_meta")
    cols = {c["name"] for c in inspector.get_columns("dataset_meta")}
    if "project_id" in cols:
        op.drop_column("dataset_meta", "project_id")
