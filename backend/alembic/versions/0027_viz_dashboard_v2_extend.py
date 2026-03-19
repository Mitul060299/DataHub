"""Add echarts config, metric tiles, access control, share token to dashboards_v2

Revision ID: 0027_viz_dashboard_v2_extend
Revises: 0026_live_refresh
Create Date: 2026-03-19

Changes:
- dashboards_v2: add theme JSONB, is_published BOOL, share_token TEXT UNIQUE
- dashboard_tiles: add tile_type, echarts_config, table_data, metric_value,
                   metric_label, metric_trend, metric_threshold
- CREATE TABLE dashboard_access  (grant management)
- CREATE TABLE dashboard_views   (access audit log)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text
from sqlalchemy.dialects.postgresql import JSONB

revision = "0027_viz_dashboard_v2_extend"
down_revision = "0026_live_refresh"
branch_labels = None
depends_on = None


def _col_exists(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def _table_exists(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── dashboards_v2 new columns ──────────────────────────────────────────
    if not _col_exists(inspector, "dashboards_v2", "theme"):
        op.add_column("dashboards_v2", sa.Column("theme", JSONB, nullable=True, server_default="{}"))
    if not _col_exists(inspector, "dashboards_v2", "is_published"):
        op.add_column("dashboards_v2", sa.Column("is_published", sa.Boolean, nullable=False, server_default="false"))
    if not _col_exists(inspector, "dashboards_v2", "share_token"):
        op.add_column("dashboards_v2", sa.Column("share_token", sa.Text, nullable=True))
        try:
            op.create_unique_constraint("uq_dashboards_v2_share_token", "dashboards_v2", ["share_token"])
        except Exception:
            pass

    # ── dashboard_tiles new columns ────────────────────────────────────────
    tile_cols = {
        "tile_type":        sa.Column("tile_type", sa.Text, nullable=False, server_default="chart"),
        "echarts_config":   sa.Column("echarts_config", JSONB, nullable=True),
        "table_data":       sa.Column("table_data", JSONB, nullable=True),
        "metric_value":     sa.Column("metric_value", sa.Text, nullable=True),
        "metric_label":     sa.Column("metric_label", sa.Text, nullable=True),
        "metric_trend":     sa.Column("metric_trend", sa.Text, nullable=True),
        "metric_threshold": sa.Column("metric_threshold", JSONB, nullable=True),
    }
    for col_name, col_def in tile_cols.items():
        if not _col_exists(inspector, "dashboard_tiles", col_name):
            op.add_column("dashboard_tiles", col_def)

    # ── dashboard_access ──────────────────────────────────────────────────
    if not _table_exists(inspector, "dashboard_access"):
        op.create_table(
            "dashboard_access",
            sa.Column("id", sa.Text, primary_key=True),
            sa.Column("dashboard_id", sa.Text, sa.ForeignKey("dashboards_v2.id", ondelete="CASCADE"), nullable=False),
            sa.Column("granted_to_user_id", sa.Text, nullable=True),
            sa.Column("granted_to_email", sa.Text, nullable=True),
            sa.Column("access_level", sa.Text, nullable=False, server_default="view"),
            sa.Column("granted_by", sa.Text, nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("token", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_dashboard_access_dashboard", "dashboard_access", ["dashboard_id"])
        op.create_index("idx_dashboard_access_user", "dashboard_access", ["granted_to_user_id"])
        try:
            op.create_unique_constraint("uq_dashboard_access_token", "dashboard_access", ["token"])
        except Exception:
            pass

        bind.execute(text("ALTER TABLE dashboard_access ENABLE ROW LEVEL SECURITY"))
        # Owner full access
        bind.execute(text(
            "CREATE POLICY dashboard_access_owner ON dashboard_access "
            "FOR ALL USING ("
            "  EXISTS (SELECT 1 FROM dashboards_v2 d "
            "          WHERE d.id = dashboard_access.dashboard_id "
            "          AND auth.uid()::text = d.user_id)"
            ")"
        ))
        # Grantee can see own grant row
        bind.execute(text(
            "CREATE POLICY dashboard_access_grantee_select ON dashboard_access "
            "FOR SELECT USING (auth.uid()::text = granted_to_user_id)"
        ))

    # ── dashboard_views ───────────────────────────────────────────────────
    if not _table_exists(inspector, "dashboard_views"):
        op.create_table(
            "dashboard_views",
            sa.Column("id", sa.Text, primary_key=True),
            sa.Column("dashboard_id", sa.Text, sa.ForeignKey("dashboards_v2.id", ondelete="CASCADE"), nullable=False),
            sa.Column("viewed_by_user_id", sa.Text, nullable=True),
            sa.Column("viewed_by_email", sa.Text, nullable=True),
            sa.Column("viewed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("ip_address", sa.Text, nullable=True),
        )
        op.create_index("idx_dashboard_views_dashboard", "dashboard_views", ["dashboard_id"])
        op.create_index("idx_dashboard_views_user", "dashboard_views", ["viewed_by_user_id"])

        bind.execute(text("ALTER TABLE dashboard_views ENABLE ROW LEVEL SECURITY"))
        # Any authenticated user can INSERT (for public share token routes handled at API layer)
        bind.execute(text(
            "CREATE POLICY dashboard_views_insert ON dashboard_views "
            "FOR INSERT WITH CHECK (true)"
        ))
        # Only dashboard owner can SELECT
        bind.execute(text(
            "CREATE POLICY dashboard_views_owner_select ON dashboard_views "
            "FOR SELECT USING ("
            "  EXISTS (SELECT 1 FROM dashboards_v2 d "
            "          WHERE d.id = dashboard_views.dashboard_id "
            "          AND auth.uid()::text = d.user_id)"
            ")"
        ))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if _table_exists(inspector, "dashboard_views"):
        op.drop_table("dashboard_views")
    if _table_exists(inspector, "dashboard_access"):
        op.drop_table("dashboard_access")

    for col in ["metric_threshold", "metric_trend", "metric_label", "metric_value",
                "table_data", "echarts_config", "tile_type"]:
        if _col_exists(inspector, "dashboard_tiles", col):
            op.drop_column("dashboard_tiles", col)

    for col in ["share_token", "is_published", "theme"]:
        if _col_exists(inspector, "dashboards_v2", col):
            op.drop_column("dashboards_v2", col)
