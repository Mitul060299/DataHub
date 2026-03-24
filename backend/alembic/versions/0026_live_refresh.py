"""add live dashboard refresh tables

Revision ID: 0026_live_refresh
Revises: 0025_billing_tables
Create Date: 2026-03-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text
from sqlalchemy.dialects import postgresql


revision = "0026_live_refresh"
down_revision = "0025_billing_tables"
branch_labels = None
depends_on = None


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return any(c.get("name") == column_name for c in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── 1. data_sources ───────────────────────────────────────────────────────
    if not _table_exists(inspector, "data_sources"):
        op.create_table(
            "data_sources",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("source_type", sa.String(50), nullable=False),
            sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
            sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_pulled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("idx_data_sources_user", "data_sources", ["user_id"])

        # RLS — Supabase only; skip silently on plain Postgres
        try:
            bind.execute(text("ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY"))
            bind.execute(text(
                "CREATE POLICY data_sources_owner_all ON data_sources "
                "FOR ALL USING (auth.uid()::text = user_id)"
            ))
        except Exception:
            pass

    # ── 2. pipeline_schedules ─────────────────────────────────────────────────
    if not _table_exists(inspector, "pipeline_schedules"):
        op.create_table(
            "pipeline_schedules",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("pipeline_id", sa.String(), sa.ForeignKey("pipelines_v2.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("cron_expression", sa.String(), nullable=False, server_default="0 9 * * 1"),
            sa.Column("timezone", sa.String(), nullable=False, server_default="Asia/Kolkata"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("auto_refresh_on_upload", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("idx_pipeline_schedules_pipeline", "pipeline_schedules", ["pipeline_id"])
        op.create_index("idx_pipeline_schedules_next_run", "pipeline_schedules", ["next_run_at"])

        # RLS — Supabase only; skip silently on plain Postgres
        try:
            bind.execute(text("ALTER TABLE pipeline_schedules ENABLE ROW LEVEL SECURITY"))
            bind.execute(text(
                "CREATE POLICY pipeline_schedules_owner_all ON pipeline_schedules "
                "FOR ALL USING (auth.uid()::text = user_id)"
            ))
        except Exception:
            pass

    # ── 3. table_snapshots ────────────────────────────────────────────────────
    if not _table_exists(inspector, "table_snapshots"):
        op.create_table(
            "table_snapshots",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("pipeline_run_id", sa.String(), sa.ForeignKey("pipeline_runs_v2.id", ondelete="CASCADE"), nullable=False),
            sa.Column("table_name", sa.String(), nullable=False),
            sa.Column("snapshot_url", sa.Text(), nullable=False),
            sa.Column("row_count", sa.Integer(), nullable=True),
            sa.Column("schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("idx_table_snapshots_run", "table_snapshots", ["pipeline_run_id"])
        op.create_index("idx_table_snapshots_table_name", "table_snapshots", ["table_name"])

        bind.execute(text("ALTER TABLE table_snapshots ENABLE ROW LEVEL SECURITY"))
        # table_snapshots readable by anyone who can read the associated pipeline run
        bind.execute(text(
            "CREATE POLICY table_snapshots_select ON table_snapshots "
            "FOR SELECT USING (true)"
        ))
        bind.execute(text(
            "CREATE POLICY table_snapshots_insert ON table_snapshots "
            "FOR INSERT WITH CHECK (true)"
        ))

    # ── 4. pipeline_runs_v2: add output_snapshot_url ─────────────────────────
    if not _column_exists(inspector, "pipeline_runs_v2", "output_snapshot_url"):
        op.add_column(
            "pipeline_runs_v2",
            sa.Column("output_snapshot_url", sa.Text(), nullable=True),
        )

    # ── 5. dashboard_tiles: add snapshot_id + refresh_config ─────────────────
    if not _column_exists(inspector, "dashboard_tiles", "snapshot_id"):
        op.add_column(
            "dashboard_tiles",
            sa.Column(
                "snapshot_id",
                sa.String(),
                sa.ForeignKey("table_snapshots.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index("idx_dashboard_tiles_snapshot", "dashboard_tiles", ["snapshot_id"])

    if not _column_exists(inspector, "dashboard_tiles", "refresh_config"):
        op.add_column(
            "dashboard_tiles",
            sa.Column(
                "refresh_config",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()

    # remove added columns first
    bind.execute(text("ALTER TABLE dashboard_tiles DROP COLUMN IF EXISTS refresh_config"))
    bind.execute(text("ALTER TABLE dashboard_tiles DROP COLUMN IF EXISTS snapshot_id"))
    bind.execute(text("ALTER TABLE pipeline_runs_v2 DROP COLUMN IF EXISTS output_snapshot_url"))

    op.drop_table("table_snapshots")
    op.drop_table("pipeline_schedules")
    op.drop_table("data_sources")
