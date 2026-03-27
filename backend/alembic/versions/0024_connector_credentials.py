"""add connector_credentials table and fold columns on dataset_meta

Revision ID: 0024_connector_credentials
Revises: 0023_dashboards_v2
Create Date: 2026-03-27
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


revision = "0024_connector_credentials"
down_revision = "0023_dashboards_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # ── 1. New table: connector_credentials ───────────────────────────────────
    if "connector_credentials" not in existing_tables:
        op.create_table(
            "connector_credentials",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("workspace_id", sa.String(), nullable=False, server_default="default"),
            sa.Column("connector_type", sa.String(), nullable=False),
            sa.Column("label", sa.String(), nullable=True),
            sa.Column("encrypted_config", sa.Text(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index(
            "idx_connector_credentials_user_workspace",
            "connector_credentials",
            ["user_id", "workspace_id"],
        )

    # ── 2. New columns on dataset_meta ────────────────────────────────────────
    existing_cols = {c["name"] for c in inspector.get_columns("dataset_meta")}

    if "connector_credential_id" not in existing_cols:
        op.add_column(
            "dataset_meta",
            sa.Column("connector_credential_id", sa.String(), nullable=True),
        )

    if "import_mode" not in existing_cols:
        op.add_column(
            "dataset_meta",
            sa.Column(
                "import_mode",
                sa.String(),
                nullable=False,
                server_default="cached",
            ),
        )

    if "connector_config" not in existing_cols:
        op.add_column(
            "dataset_meta",
            sa.Column("connector_config", sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())
    existing_cols = {c["name"] for c in inspector.get_columns("dataset_meta")}

    for col in ("connector_config", "import_mode", "connector_credential_id"):
        if col in existing_cols:
            op.drop_column("dataset_meta", col)

    if "connector_credentials" in existing_tables:
        op.drop_index(
            "idx_connector_credentials_user_workspace",
            table_name="connector_credentials",
        )
        op.drop_table("connector_credentials")
