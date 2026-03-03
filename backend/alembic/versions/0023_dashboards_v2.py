"""add dashboards v2 tables

Revision ID: 0023_dashboards_v2
Revises: 0022_calculated_columns
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0023_dashboards_v2"
down_revision = "0022_calculated_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "dashboards_v2" not in existing_tables:
        op.create_table(
            "dashboards_v2",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("workspace_id", sa.String(), nullable=False, server_default="default"),
            sa.Column("dataset_id", sa.String(), nullable=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("layout", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    if "dashboard_tiles" not in existing_tables:
        op.create_table(
            "dashboard_tiles",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("dashboard_id", sa.String(), sa.ForeignKey("dashboards_v2.id", ondelete="CASCADE"), nullable=False),
            sa.Column("dataset_id", sa.String(), nullable=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("chart_type", sa.String(), nullable=False),
            sa.Column("query_spec", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
            sa.Column("layout", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    if "dashboard_publishes" not in existing_tables:
        op.create_table(
            "dashboard_publishes",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("dashboard_id", sa.String(), sa.ForeignKey("dashboards_v2.id", ondelete="CASCADE"), nullable=False),
            sa.Column("publish_token", sa.String(), nullable=False, unique=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    index_specs = [
        ("dashboards_v2", "idx_dashboards_v2_workspace", ["workspace_id"]),
        ("dashboards_v2", "idx_dashboards_v2_user", ["user_id"]),
        ("dashboard_tiles", "idx_dashboard_tiles_dashboard", ["dashboard_id"]),
        ("dashboard_publishes", "idx_dashboard_publishes_dashboard", ["dashboard_id"]),
    ]
    for table_name, index_name, columns in index_specs:
        if table_name in inspector.get_table_names():
            existing_indexes = {idx["name"] for idx in inspector.get_indexes(table_name)}
            if index_name not in existing_indexes:
                op.create_index(index_name, table_name, columns, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "dashboard_publishes" in existing_tables:
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("dashboard_publishes")}
        if "idx_dashboard_publishes_dashboard" in existing_indexes:
            op.drop_index("idx_dashboard_publishes_dashboard", table_name="dashboard_publishes")
        op.drop_table("dashboard_publishes")

    if "dashboard_tiles" in existing_tables:
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("dashboard_tiles")}
        if "idx_dashboard_tiles_dashboard" in existing_indexes:
            op.drop_index("idx_dashboard_tiles_dashboard", table_name="dashboard_tiles")
        op.drop_table("dashboard_tiles")

    if "dashboards_v2" in existing_tables:
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("dashboards_v2")}
        if "idx_dashboards_v2_workspace" in existing_indexes:
            op.drop_index("idx_dashboards_v2_workspace", table_name="dashboards_v2")
        if "idx_dashboards_v2_user" in existing_indexes:
            op.drop_index("idx_dashboards_v2_user", table_name="dashboards_v2")
        op.drop_table("dashboards_v2")