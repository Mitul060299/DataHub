"""add visualizations and canvas_layouts tables

Revision ID: 0039_visualizations_canvas_layouts
Revises: 0038_repair_pipeline_runs_v2_schema
Create Date: 2025-03-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text
from sqlalchemy.dialects.postgresql import JSONB

revision = "0039_visualizations_canvas_layouts"
down_revision = "0038_repair_pipeline_runs_v2_schema"
branch_labels = None
depends_on = None


def _tbl(inspector: inspect, table: str) -> bool:
    return table in inspector.get_table_names()


def _col(inspector: inspect, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def _idx(bind, name: str) -> bool:
    row = bind.execute(
        text("SELECT 1 FROM pg_indexes WHERE indexname = :n"), {"n": name}
    ).fetchone()
    return row is not None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # ------------------------------------------------------------------
    # visualizations
    # ------------------------------------------------------------------
    if not _tbl(inspector, "visualizations"):
        op.execute(text("""
            CREATE TABLE visualizations (
                id               TEXT PRIMARY KEY,
                user_id          TEXT NOT NULL,
                workspace_id     TEXT NOT NULL DEFAULT 'default',
                project_id       TEXT REFERENCES projects(id) ON DELETE SET NULL,
                name             TEXT NOT NULL,
                chart_type       TEXT NOT NULL DEFAULT 'bar',
                echarts_config   JSONB NOT NULL DEFAULT '{}',
                thumbnail_s3_key TEXT,
                created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))

    if not _idx(bind, "idx_visualizations_user"):
        op.execute(text(
            "CREATE INDEX idx_visualizations_user ON visualizations (user_id)"
        ))

    if not _idx(bind, "idx_visualizations_workspace") and _col(inspector, "visualizations", "workspace_id"):
        op.execute(text(
            "CREATE INDEX idx_visualizations_workspace ON visualizations (workspace_id)"
        ))

    # ------------------------------------------------------------------
    # canvas_layouts
    # ------------------------------------------------------------------
    if not _tbl(inspector, "canvas_layouts"):
        op.execute(text("""
            CREATE TABLE canvas_layouts (
                id           TEXT PRIMARY KEY,
                user_id      TEXT NOT NULL,
                workspace_id TEXT NOT NULL DEFAULT 'default',
                project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
                name         TEXT NOT NULL DEFAULT 'Untitled Dashboard',
                layout       JSONB NOT NULL DEFAULT '[]',
                is_public    BOOLEAN NOT NULL DEFAULT false,
                public_token TEXT UNIQUE,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))

    if not _idx(bind, "idx_canvas_layouts_user"):
        op.execute(text(
            "CREATE INDEX idx_canvas_layouts_user ON canvas_layouts (user_id)"
        ))

    if not _idx(bind, "idx_canvas_layouts_workspace") and _col(inspector, "canvas_layouts", "workspace_id"):
        op.execute(text(
            "CREATE INDEX idx_canvas_layouts_workspace ON canvas_layouts (workspace_id)"
        ))

    if not _idx(bind, "idx_canvas_layouts_project"):
        op.execute(text(
            "CREATE INDEX idx_canvas_layouts_project ON canvas_layouts (project_id)"
        ))


def downgrade() -> None:
    op.execute(text("DROP TABLE IF EXISTS canvas_layouts"))
    op.execute(text("DROP TABLE IF EXISTS visualizations"))
