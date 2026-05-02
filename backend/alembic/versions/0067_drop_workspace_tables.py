"""drop workspace tables and make workspace_id nullable

Revision ID: 0067
Revises: 0066_dashboard_share_expiry
Create Date: 2025-07-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0067"
down_revision = "0066_dashboard_share_expiry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Make workspace_id nullable on resource tables.
    # Use PostgreSQL DO blocks so a missing column doesn't abort the transaction.
    tables = [
        "datasets",
        "connector_credentials",
        "pipelines_v2",
        "pipeline_schedules",
        "dashboards_v2",
        "chat_sessions",
        "chat_templates",
        "visualizations",
        "canvas_layouts",
        "contexts",
        "context_versions",
        "projects",
    ]
    for table in tables:
        conn.execute(sa.text(f"""
            DO $$ BEGIN
                ALTER TABLE {table} ALTER COLUMN workspace_id DROP NOT NULL;
            EXCEPTION WHEN others THEN NULL;
            END $$;
        """))

    # Drop workspace_members before workspaces (FK constraint)
    conn.execute(sa.text("DROP TABLE IF EXISTS workspace_members CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS workspaces CASCADE"))


def downgrade() -> None:
    pass  # Non-reversible
