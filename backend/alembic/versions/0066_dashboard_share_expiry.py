"""dashboard share expiry

Adds share_expires_at to dashboards_v2 and viz_dashboards so public share
tokens can be aged out instead of living forever. NULL means "no expiry"
for backward compatibility with already-issued tokens; new shares should
populate this column with a default lifetime (90d).

Revision ID: 0066_dashboard_share_expiry
Revises: 0065
Create Date: 2026-04-28
"""

from alembic import op
import sqlalchemy as sa


revision = "0066_dashboard_share_expiry"
down_revision = "0065"
branch_labels = None
depends_on = None


def _has_table(conn, table_name: str) -> bool:
    insp = sa.inspect(conn)
    return insp.has_table(table_name)


def _has_column(conn, table_name: str, column_name: str) -> bool:
    insp = sa.inspect(conn)
    if not insp.has_table(table_name):
        return False
    return any(col["name"] == column_name for col in insp.get_columns(table_name))


def upgrade() -> None:
    conn = op.get_bind()
    if _has_table(conn, "dashboards_v2") and not _has_column(conn, "dashboards_v2", "share_expires_at"):
        op.add_column(
            "dashboards_v2",
            sa.Column("share_expires_at", sa.DateTime(timezone=True), nullable=True),
        )
    if _has_table(conn, "viz_dashboards") and not _has_column(conn, "viz_dashboards", "share_expires_at"):
        op.add_column(
            "viz_dashboards",
            sa.Column("share_expires_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _has_column(conn, "viz_dashboards", "share_expires_at"):
        op.drop_column("viz_dashboards", "share_expires_at")
    if _has_column(conn, "dashboards_v2", "share_expires_at"):
        op.drop_column("dashboards_v2", "share_expires_at")
