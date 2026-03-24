"""Repair pipeline_runs_v2 schema missed by migration 0026

Revision ID: 0038_repair_pipeline_runs_v2_schema
Revises: 0037_repair_dashboard_v2_schema
Create Date: 2026-03-24

Migration 0026 created the data_sources / pipeline_schedules / table_snapshots
tables and added output_snapshot_url, snapshot_id and refresh_config columns.
On plain Postgres deployments (e.g. Render) the Supabase-specific
``auth.uid()`` RLS policies at the end of the block raised ``UndefinedFunction``,
rolling back the entire transaction and leaving tables / columns un-created
while alembic_version was already stamped past 0026.

This migration repeats all 0026 DDL with full idempotency guards and WITHOUT
any RLS policies.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text
from sqlalchemy.dialects.postgresql import JSONB


revision = "0038_repair_pipeline_runs_v2_schema"
down_revision = "0037_repair_dashboard_v2_schema"
branch_labels = None
depends_on = None


# ── helpers ────────────────────────────────────────────────────────────────


def _tbl(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def _col(inspector, table: str, column: str) -> bool:
    if not _tbl(inspector, table):
        return False
    return any(c["name"] == column for c in inspector.get_columns(table))


def _idx(bind, index_name: str) -> bool:
    return bool(
        bind.execute(
            sa.text("SELECT 1 FROM pg_indexes WHERE indexname = :n"),
            {"n": index_name},
        ).fetchone()
    )


# ── upgrade ────────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── 1. data_sources ───────────────────────────────────────────────────
    if not _tbl(inspector, "data_sources"):
        op.create_table(
            "data_sources",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("source_type", sa.String(50), nullable=False),
            sa.Column(
                "config",
                JSONB,
                nullable=False,
                server_default="{}",
            ),
            sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_pulled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        if not _idx(bind, "idx_data_sources_user"):
            op.create_index("idx_data_sources_user", "data_sources", ["user_id"])

    # project_id FK column (added by 0029 — guard here in case 0029 also failed)
    if not _col(inspector, "data_sources", "project_id"):
        op.add_column(
            "data_sources",
            sa.Column("project_id", sa.Text(), nullable=True),
        )

    # ── 2. pipeline_schedules ─────────────────────────────────────────────
    if not _tbl(inspector, "pipeline_schedules"):
        op.create_table(
            "pipeline_schedules",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "pipeline_id",
                sa.String(),
                sa.ForeignKey("pipelines_v2.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column(
                "cron_expression",
                sa.String(),
                nullable=False,
                server_default="0 9 * * 1",
            ),
            sa.Column(
                "timezone",
                sa.String(),
                nullable=False,
                server_default="Asia/Kolkata",
            ),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "auto_refresh_on_upload",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        if not _idx(bind, "idx_pipeline_schedules_pipeline"):
            op.create_index(
                "idx_pipeline_schedules_pipeline", "pipeline_schedules", ["pipeline_id"]
            )
        if not _idx(bind, "idx_pipeline_schedules_next_run"):
            op.create_index(
                "idx_pipeline_schedules_next_run", "pipeline_schedules", ["next_run_at"]
            )

    # ── 3. table_snapshots ────────────────────────────────────────────────
    if not _tbl(inspector, "table_snapshots"):
        op.create_table(
            "table_snapshots",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "pipeline_run_id",
                sa.String(),
                sa.ForeignKey("pipeline_runs_v2.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("table_name", sa.String(), nullable=False),
            sa.Column("snapshot_url", sa.Text(), nullable=False),
            sa.Column("row_count", sa.Integer(), nullable=True),
            sa.Column("schema", JSONB, nullable=False, server_default="{}"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        if not _idx(bind, "idx_table_snapshots_run"):
            op.create_index(
                "idx_table_snapshots_run", "table_snapshots", ["pipeline_run_id"]
            )
        if not _idx(bind, "idx_table_snapshots_table_name"):
            op.create_index(
                "idx_table_snapshots_table_name", "table_snapshots", ["table_name"]
            )

    # ── 4. pipeline_runs_v2: output_snapshot_url ──────────────────────────
    if not _col(inspector, "pipeline_runs_v2", "output_snapshot_url"):
        op.add_column(
            "pipeline_runs_v2",
            sa.Column("output_snapshot_url", sa.Text(), nullable=True),
        )

    # ── 5. dashboard_tiles: snapshot_id ───────────────────────────────────
    if not _col(inspector, "dashboard_tiles", "snapshot_id"):
        op.add_column(
            "dashboard_tiles",
            sa.Column(
                "snapshot_id",
                sa.String(),
                sa.ForeignKey("table_snapshots.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        if not _idx(bind, "idx_dashboard_tiles_snapshot"):
            op.create_index(
                "idx_dashboard_tiles_snapshot", "dashboard_tiles", ["snapshot_id"]
            )

    # ── 6. dashboard_tiles: refresh_config ────────────────────────────────
    if not _col(inspector, "dashboard_tiles", "refresh_config"):
        op.add_column(
            "dashboard_tiles",
            sa.Column(
                "refresh_config",
                JSONB,
                nullable=False,
                server_default="{}",
            ),
        )


# ── downgrade ──────────────────────────────────────────────────────────────


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(text("ALTER TABLE dashboard_tiles DROP COLUMN IF EXISTS refresh_config"))
    bind.execute(text("ALTER TABLE dashboard_tiles DROP COLUMN IF EXISTS snapshot_id"))
    bind.execute(text("ALTER TABLE pipeline_runs_v2 DROP COLUMN IF EXISTS output_snapshot_url"))
    bind.execute(text("DROP TABLE IF EXISTS table_snapshots"))
    bind.execute(text("DROP TABLE IF EXISTS pipeline_schedules"))
    bind.execute(text("ALTER TABLE data_sources DROP COLUMN IF EXISTS project_id"))
    bind.execute(text("DROP TABLE IF EXISTS data_sources"))
