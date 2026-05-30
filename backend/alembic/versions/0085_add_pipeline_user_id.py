"""0085_add_pipeline_user_id

Revision ID: 0085_add_pipeline_user_id
Revises: 0084_tile_sparkline_delta
Create Date: 2026-05-30

Add user_id (TEXT, nullable) to the pipelines table for ownership enforcement.
DDL is idempotent — safe to re-run on a DB that already has the column.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0085_add_pipeline_user_id"
down_revision = "0084_tile_sparkline_delta"
branch_labels = None
depends_on = None


def _col_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": column}).fetchone()
    return row is not None


def upgrade() -> None:
    conn = op.get_bind()

    if not _col_exists(conn, "pipelines", "user_id"):
        op.add_column(
            "pipelines",
            sa.Column("user_id", sa.String(), nullable=True),
        )
        op.create_index(
            "idx_pipelines_user_id",
            "pipelines",
            ["user_id"],
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _col_exists(conn, "pipelines", "user_id"):
        op.drop_index("idx_pipelines_user_id", table_name="pipelines")
        op.drop_column("pipelines", "user_id")
