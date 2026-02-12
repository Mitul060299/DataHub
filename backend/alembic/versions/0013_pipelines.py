"""pipelines

Revision ID: 0013_pipelines
Revises: 0012_jobs_webhooks
Create Date: 2026-02-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0013_pipelines"
down_revision = "0012_jobs_webhooks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pipelines",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("cadence", sa.String(), nullable=False),
        sa.Column("time_of_day", sa.String(), nullable=True),
        sa.Column("day_of_week", sa.Integer(), nullable=True),
        sa.Column("day_of_month", sa.Integer(), nullable=True),
        sa.Column("dataset_id", sa.String(), nullable=True),
        sa.Column("connector", sa.String(), nullable=True),
        sa.Column("connector_config", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("apply_recipe", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("run_profile", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("run_insights", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "pipeline_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("pipeline_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("dataset_id", sa.String(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("pipeline_runs")
    op.drop_table("pipelines")
