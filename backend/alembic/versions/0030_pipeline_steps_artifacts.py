"""add pipeline_steps and artifacts tables

Revision ID: 0030_pipeline_steps_artifacts
Revises: 0029_projects
Create Date: 2026-03-20

- Creates `artifacts` table (per-step S3 Parquet snapshots)
- Creates `pipeline_steps` table (FK to pipeline_runs_v2 and artifacts)
Both tables are created idempotently using SQLAlchemy inspector checks.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.dialects.postgresql import JSONB

revision = "0030_pipeline_steps_artifacts"
down_revision = "0029_projects"
branch_labels = None
depends_on = None


def _has_table(bind, name: str) -> bool:
    return sa_inspect(bind).has_table(name)


def _has_column(bind, table: str, column: str) -> bool:
    cols = [c["name"] for c in sa_inspect(bind).get_columns(table)]
    return column in cols


def _has_index(bind, table: str, index: str) -> bool:
    indexes = [i["name"] for i in sa_inspect(bind).get_indexes(table)]
    return index in indexes


def upgrade() -> None:
    bind = op.get_bind()

    # ── 1. Create artifacts table ─────────────────────────────────────────────
    # Must be created before pipeline_steps (which FKs into it)
    if not _has_table(bind, "artifacts"):
        op.create_table(
            "artifacts",
            sa.Column("id", sa.Text, primary_key=True),
            sa.Column("user_id", sa.Text, nullable=False),
            sa.Column("session_id", sa.Text, nullable=True),
            sa.Column(
                "pipeline_run_id",
                sa.Text,
                sa.ForeignKey("pipeline_runs_v2.id", ondelete="SET NULL", name="fk_artifacts_pipeline_run"),
                nullable=True,
            ),
            # step_id is added after pipeline_steps is created (circular FK avoided: artifacts ← pipeline_steps)
            sa.Column("step_id", sa.Text, nullable=True),
            sa.Column("name", sa.Text, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("s3_key", sa.Text, nullable=False),
            sa.Column("row_count", sa.Integer, nullable=True),
            sa.Column("column_schema", JSONB, nullable=True, server_default="[]"),
            sa.Column("type", sa.Text, nullable=False, server_default="auto"),
            sa.Column("format", sa.Text, nullable=False, server_default="parquet"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index("idx_artifacts_user_id", "artifacts", ["user_id"])
        op.create_index("idx_artifacts_session_id", "artifacts", ["session_id"])
        op.create_index("idx_artifacts_pipeline_run_id", "artifacts", ["pipeline_run_id"])

    # ── 2. Create pipeline_steps table ───────────────────────────────────────
    if not _has_table(bind, "pipeline_steps"):
        op.create_table(
            "pipeline_steps",
            sa.Column("id", sa.Text, primary_key=True),
            sa.Column(
                "pipeline_run_id",
                sa.Text,
                sa.ForeignKey("pipeline_runs_v2.id", ondelete="CASCADE", name="fk_pipeline_steps_run"),
                nullable=True,
            ),
            sa.Column("user_id", sa.Text, nullable=False),
            sa.Column("session_id", sa.Text, nullable=True),
            sa.Column("step_number", sa.Integer, nullable=False),
            sa.Column("intent", sa.Text, nullable=True),
            sa.Column("operation", sa.Text, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column(
                "input_tables",
                JSONB,
                nullable=False,
                server_default="[]",
            ),
            sa.Column("input_table", sa.Text, nullable=True),   # kept for legacy; stop writing to it
            sa.Column("output_table", sa.Text, nullable=True),
            sa.Column("duckdb_sql", sa.Text, nullable=True),
            sa.Column(
                "parameters",
                JSONB,
                nullable=True,
            ),
            sa.Column("status", sa.Text, nullable=False, server_default="completed"),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("execution_time_ms", sa.Integer, nullable=True),
            sa.Column("row_count_before", sa.Integer, nullable=True),
            sa.Column("row_count_after", sa.Integer, nullable=True),
            sa.Column(
                "artifact_id",
                sa.Text,
                sa.ForeignKey("artifacts.id", ondelete="SET NULL", name="fk_pipeline_steps_artifact"),
                nullable=True,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index("idx_pipeline_steps_run_id", "pipeline_steps", ["pipeline_run_id"])
        op.create_index("idx_pipeline_steps_user_id", "pipeline_steps", ["user_id"])
        op.create_index("idx_pipeline_steps_session_id", "pipeline_steps", ["session_id"])


def downgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "pipeline_steps"):
        op.drop_index("idx_pipeline_steps_session_id", table_name="pipeline_steps")
        op.drop_index("idx_pipeline_steps_user_id", table_name="pipeline_steps")
        op.drop_index("idx_pipeline_steps_run_id", table_name="pipeline_steps")
        op.drop_table("pipeline_steps")

    if _has_table(bind, "artifacts"):
        op.drop_index("idx_artifacts_pipeline_run_id", table_name="artifacts")
        op.drop_index("idx_artifacts_session_id", table_name="artifacts")
        op.drop_index("idx_artifacts_user_id", table_name="artifacts")
        op.drop_table("artifacts")
