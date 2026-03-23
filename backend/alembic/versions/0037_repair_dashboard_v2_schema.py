"""Repair dashboards_v2 schema columns missed by 0027

Revision ID: 0037_repair_dashboard_v2_schema
Revises: 0036_reviews
Create Date: 2026-03-23

Migration 0027 added columns to dashboards_v2 / dashboard_tiles and created
dashboard_access / dashboard_views tables.  On plain Postgres deployments (e.g.
Render) the Supabase-specific ``auth.uid()`` RLS policies at the end of 0027
raise ``UndefinedFunction``, rolling back the entire transaction and leaving the
columns un-added while alembic_version is already stamped past 0027.

This migration repeats all DDL from 0027 with full idempotency guards and
WITHOUT the Supabase RLS policies.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import JSONB


revision = "0037_repair_dashboard_v2_schema"
down_revision = "0036_reviews"
branch_labels = None
depends_on = None


def _col_exists(inspector, table: str, column: str) -> bool:
    try:
        return any(c["name"] == column for c in inspector.get_columns(table))
    except Exception:
        return False


def _table_exists(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def _index_exists(bind, index_name: str) -> bool:
    row = bind.execute(
        sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname = :n"
        ),
        {"n": index_name},
    ).fetchone()
    return row is not None


def _constraint_exists(bind, constraint_name: str) -> bool:
    row = bind.execute(
        sa.text(
            "SELECT 1 FROM pg_constraint WHERE conname = :n"
        ),
        {"n": constraint_name},
    ).fetchone()
    return row is not None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── dashboards_v2 new columns ──────────────────────────────────────────
    if not _col_exists(inspector, "dashboards_v2", "theme"):
        op.add_column(
            "dashboards_v2",
            sa.Column("theme", JSONB, nullable=True, server_default="{}"),
        )
    if not _col_exists(inspector, "dashboards_v2", "is_published"):
        op.add_column(
            "dashboards_v2",
            sa.Column("is_published", sa.Boolean, nullable=False, server_default="false"),
        )
    if not _col_exists(inspector, "dashboards_v2", "share_token"):
        op.add_column(
            "dashboards_v2",
            sa.Column("share_token", sa.Text, nullable=True),
        )
        if not _constraint_exists(bind, "uq_dashboards_v2_share_token"):
            op.create_unique_constraint(
                "uq_dashboards_v2_share_token", "dashboards_v2", ["share_token"]
            )

    # ── dashboard_tiles new columns ────────────────────────────────────────
    tile_cols: list[tuple[str, sa.Column]] = [
        ("tile_type",        sa.Column("tile_type", sa.Text, nullable=False, server_default="chart")),
        ("echarts_config",   sa.Column("echarts_config", JSONB, nullable=True)),
        ("table_data",       sa.Column("table_data", JSONB, nullable=True)),
        ("metric_value",     sa.Column("metric_value", sa.Text, nullable=True)),
        ("metric_label",     sa.Column("metric_label", sa.Text, nullable=True)),
        ("metric_trend",     sa.Column("metric_trend", sa.Text, nullable=True)),
        ("metric_threshold", sa.Column("metric_threshold", JSONB, nullable=True)),
    ]
    for col_name, col_def in tile_cols:
        if not _col_exists(inspector, "dashboard_tiles", col_name):
            op.add_column("dashboard_tiles", col_def)

    # ── dashboard_access ───────────────────────────────────────────────────
    if not _table_exists(inspector, "dashboard_access"):
        op.create_table(
            "dashboard_access",
            sa.Column("id", sa.Text, primary_key=True),
            sa.Column(
                "dashboard_id",
                sa.Text,
                sa.ForeignKey("dashboards_v2.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("granted_to_user_id", sa.Text, nullable=True),
            sa.Column("granted_to_email", sa.Text, nullable=True),
            sa.Column("access_level", sa.Text, nullable=False, server_default="view"),
            sa.Column("granted_by", sa.Text, nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("token", sa.Text, nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        if not _index_exists(bind, "idx_dashboard_access_dashboard"):
            op.create_index(
                "idx_dashboard_access_dashboard", "dashboard_access", ["dashboard_id"]
            )
        if not _index_exists(bind, "idx_dashboard_access_user"):
            op.create_index(
                "idx_dashboard_access_user", "dashboard_access", ["granted_to_user_id"]
            )
        if not _constraint_exists(bind, "uq_dashboard_access_token"):
            op.create_unique_constraint(
                "uq_dashboard_access_token", "dashboard_access", ["token"]
            )

    # ── dashboard_views ────────────────────────────────────────────────────
    if not _table_exists(inspector, "dashboard_views"):
        op.create_table(
            "dashboard_views",
            sa.Column("id", sa.Text, primary_key=True),
            sa.Column(
                "dashboard_id",
                sa.Text,
                sa.ForeignKey("dashboards_v2.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("viewed_by_user_id", sa.Text, nullable=True),
            sa.Column("viewed_by_email", sa.Text, nullable=True),
            sa.Column(
                "viewed_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("ip_address", sa.Text, nullable=True),
        )
        if not _index_exists(bind, "idx_dashboard_views_dashboard"):
            op.create_index(
                "idx_dashboard_views_dashboard", "dashboard_views", ["dashboard_id"]
            )
        if not _index_exists(bind, "idx_dashboard_views_user"):
            op.create_index(
                "idx_dashboard_views_user", "dashboard_views", ["viewed_by_user_id"]
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if _table_exists(inspector, "dashboard_views"):
        op.drop_table("dashboard_views")
    if _table_exists(inspector, "dashboard_access"):
        op.drop_table("dashboard_access")

    for col in [
        "metric_threshold", "metric_trend", "metric_label", "metric_value",
        "table_data", "echarts_config", "tile_type",
    ]:
        if _col_exists(inspector, "dashboard_tiles", col):
            op.drop_column("dashboard_tiles", col)

    for col in ["share_token", "is_published", "theme"]:
        if _col_exists(inspector, "dashboards_v2", col):
            op.drop_column("dashboards_v2", col)
