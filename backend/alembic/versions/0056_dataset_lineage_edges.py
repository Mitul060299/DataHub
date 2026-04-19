"""Add dataset_lineage_edges table to replace the parent_id chain.

Until now, dataset lineage was encoded as a single ``parent_id`` column on
``dataset_meta``. That worked for a strict chain (each child had at most one
parent) but had three problems:

1. **No room for richer lineage.** Joins, unions, and multi-input pipelines
   produce N parents per child. ``parent_id`` could only ever record one.
2. **Mixed concerns.** A dataset row carried both its own state *and* its
   relationship to a sibling row, making cascade-delete and lineage queries
   harder to reason about.
3. **No link to the transform that produced the edge.** Lineage lived as
   bare pointers with no record of which step caused them.

This migration introduces ``dataset_lineage_edges(child_id, parent_id,
transform_id, created_at)`` and backfills it from existing
``dataset_meta.parent_id`` values. The ``parent_id`` column is **kept** as a
deprecated mirror for one release so any reader I missed continues to
function. New writes go through ``persistence_policy.materialize_dataset``,
which records the edge in the same transaction.

Revision ID: 0056
Revises: 0055
Create Date: 2026-04-21
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if "dataset_lineage_edges" not in existing_tables:
        op.create_table(
            "dataset_lineage_edges",
            sa.Column("id", sa.String(), primary_key=True, nullable=False),
            sa.Column("child_id", sa.String(), nullable=False),
            sa.Column("parent_id", sa.String(), nullable=False),
            sa.Column("transform_id", sa.String(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.create_index(
            "ix_dataset_lineage_edges_child_id",
            "dataset_lineage_edges",
            ["child_id"],
        )
        op.create_index(
            "ix_dataset_lineage_edges_parent_id",
            "dataset_lineage_edges",
            ["parent_id"],
        )
        op.create_index(
            "ux_dataset_lineage_edges_child_parent",
            "dataset_lineage_edges",
            ["child_id", "parent_id"],
            unique=True,
        )

    # ── Backfill from existing dataset_meta.parent_id ────────────────────
    # Only run if dataset_meta exists and has a parent_id column.
    if "dataset_meta" not in existing_tables:
        return
    cols = {c["name"] for c in inspector.get_columns("dataset_meta")}
    if "parent_id" not in cols:
        return

    # Use a portable INSERT...SELECT that skips already-present edges.
    # Generate id with a stable concat so re-runs are idempotent without
    # depending on a server-side UUID function (Postgres would have gen_random_uuid,
    # SQLite does not).
    dialect = conn.dialect.name
    if dialect == "postgresql":
        op.execute(
            """
            INSERT INTO dataset_lineage_edges (id, child_id, parent_id, transform_id, created_at)
            SELECT
                'edge:' || dm.id || ':' || dm.parent_id AS id,
                dm.id AS child_id,
                dm.parent_id AS parent_id,
                NULL AS transform_id,
                COALESCE(dm.created_at, now()) AS created_at
            FROM dataset_meta dm
            WHERE dm.parent_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM dataset_lineage_edges e
                  WHERE e.child_id = dm.id AND e.parent_id = dm.parent_id
              )
            """
        )
    else:
        # SQLite + others: same shape, just no qualified now() / concat differences.
        op.execute(
            """
            INSERT INTO dataset_lineage_edges (id, child_id, parent_id, transform_id, created_at)
            SELECT
                'edge:' || dm.id || ':' || dm.parent_id,
                dm.id,
                dm.parent_id,
                NULL,
                COALESCE(dm.created_at, CURRENT_TIMESTAMP)
            FROM dataset_meta dm
            WHERE dm.parent_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM dataset_lineage_edges e
                  WHERE e.child_id = dm.id AND e.parent_id = dm.parent_id
              )
            """
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if "dataset_lineage_edges" not in set(inspector.get_table_names()):
        return
    for ix in (
        "ux_dataset_lineage_edges_child_parent",
        "ix_dataset_lineage_edges_parent_id",
        "ix_dataset_lineage_edges_child_id",
    ):
        try:
            op.drop_index(ix, table_name="dataset_lineage_edges")
        except Exception:
            pass
    op.drop_table("dataset_lineage_edges")
