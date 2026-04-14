"""Drop the legacy 'dashboards' table (superseded by dashboards_v2).

The old Dashboard model has zero references in any router or service.
All dashboard functionality uses DashboardV2DB / dashboards_v2 table.

Revision ID: 0048
Revises: 0047
Create Date: 2026-04-14
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect as sa_inspect, text
import sqlalchemy as sa

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if inspector.has_table("dashboards"):
        op.drop_table("dashboards")


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    if not inspector.has_table("dashboards"):
        op.create_table(
            "dashboards",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("widgets", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("is_shared", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("share_token", sa.String(), nullable=True),
            sa.Column("share_expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("share_scope", sa.String(), nullable=True),
        )
