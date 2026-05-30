"""0084_tile_sparkline_delta

Revision ID: 0084_tile_sparkline_delta
Revises: 0083_new_pricing_tiers
Create Date: 2026-05-30

Add sparkline_data (JSONB) and delta_pct (DOUBLE PRECISION) to dashboard_tiles.
These columns support the Phase 11 dashboard metric tile enhancements.
DDL is idempotent — safe to run on a DB that already has the columns.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0084_tile_sparkline_delta"
down_revision = "0083_new_pricing_tiers"
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

    if not _col_exists(conn, "dashboard_tiles", "sparkline_data"):
        op.add_column(
            "dashboard_tiles",
            sa.Column("sparkline_data", sa.JSON(), nullable=True),
        )

    if not _col_exists(conn, "dashboard_tiles", "delta_pct"):
        op.add_column(
            "dashboard_tiles",
            sa.Column("delta_pct", sa.Float(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()

    if _col_exists(conn, "dashboard_tiles", "delta_pct"):
        op.drop_column("dashboard_tiles", "delta_pct")

    if _col_exists(conn, "dashboard_tiles", "sparkline_data"):
        op.drop_column("dashboard_tiles", "sparkline_data")
