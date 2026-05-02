"""drop workspace tables and make workspace_id nullable

Revision ID: 0067
Revises: 0066
Create Date: 2025-07-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0067"
down_revision = "0066_dashboard_share_expiry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make workspace_id nullable on resource tables (no longer required)
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
        try:
            op.alter_column(table, "workspace_id", existing_type=sa.String(), nullable=True)
        except Exception:
            pass  # column may already be nullable or not exist

    # Drop workspace_members before workspaces (FK constraint)
    try:
        op.drop_table("workspace_members")
    except Exception:
        pass

    try:
        op.drop_table("workspaces")
    except Exception:
        pass


def downgrade() -> None:
    pass  # Non-reversible
