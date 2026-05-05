"""add projects table and project_id fk columns

Revision ID: 0029_projects
Revises: 0028_user_onboarding
Create Date: 2026-03-20

- Creates `projects` table (user-scoped, with colour + icon)
- Adds nullable `project_id` FK to pipelines_v2, dashboards_v2, data_sources
- Data migration: for each distinct user_id in those tables, inserts a
  "Default Project" and assigns all existing rows to it
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "0029_projects"
down_revision = "0028_user_onboarding"
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


def _has_fk(bind, table: str, fk_name: str) -> bool:
    fks = [fk["name"] for fk in sa_inspect(bind).get_foreign_keys(table)]
    return fk_name in fks


def upgrade() -> None:
    bind = op.get_bind()

    # ── 1. Create projects table ──────────────────────────────────────────────
    if not _has_table(bind, "projects"):
        op.create_table(
            "projects",
            sa.Column("id", sa.Text, primary_key=True),
            sa.Column("user_id", sa.Text, nullable=False),
            sa.Column("workspace_id", sa.Text, nullable=False, server_default="default"),
            sa.Column("name", sa.Text, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("colour", sa.Text, nullable=False, server_default="#5B6AF0"),
            sa.Column("icon", sa.Text, nullable=False, server_default="📁"),
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

    if not _has_index(bind, "projects", "idx_projects_user_id"):
        op.create_index("idx_projects_user_id", "projects", ["user_id"])
    if _has_column(bind, "projects", "workspace_id") and not _has_index(bind, "projects", "idx_projects_workspace_id"):
        op.create_index("idx_projects_workspace_id", "projects", ["workspace_id"])

    # ── 2. Add project_id FK columns (nullable, SET NULL on delete) ───────────
    for table in ("pipelines_v2", "dashboards_v2", "data_sources"):
        if not _has_column(bind, table, "project_id"):
            op.add_column(table, sa.Column("project_id", sa.Text, nullable=True))

    if not _has_fk(bind, "pipelines_v2", "fk_pipelines_v2_project"):
        op.create_foreign_key(
            "fk_pipelines_v2_project",
            "pipelines_v2", "projects",
            ["project_id"], ["id"],
            ondelete="SET NULL",
        )
    if not _has_fk(bind, "dashboards_v2", "fk_dashboards_v2_project"):
        op.create_foreign_key(
            "fk_dashboards_v2_project",
            "dashboards_v2", "projects",
            ["project_id"], ["id"],
            ondelete="SET NULL",
        )
    if not _has_fk(bind, "data_sources", "fk_data_sources_project"):
        op.create_foreign_key(
            "fk_data_sources_project",
            "data_sources", "projects",
            ["project_id"], ["id"],
            ondelete="SET NULL",
        )

    # ── 3. Data migration: create "Default Project" per user and assign rows ──
    # Skip the whole backfill if workspace_id has already been removed from any
    # source table (post-workspace removal in migration 0067 / startup DDL).
    _backfill_tables = ("projects", "pipelines_v2", "dashboards_v2", "data_sources")
    _backfill_safe = all(
        _has_column(bind, t, "workspace_id") if t != "data_sources" else True
        for t in _backfill_tables
    )
    if not _backfill_safe:
        return

    op.execute(sa.text("""
        INSERT INTO projects (id, user_id, workspace_id, name, colour, icon, created_at, updated_at)
        SELECT
            gen_random_uuid()::text,
            user_id,
            COALESCE(workspace_id, 'default'),
            'Default Project',
            '#5B6AF0',
            '📁',
            now(),
            now()
        FROM (
            SELECT DISTINCT user_id, workspace_id FROM pipelines_v2
            UNION
            SELECT DISTINCT user_id, workspace_id FROM dashboards_v2
            UNION
            SELECT DISTINCT user_id, 'default' AS workspace_id FROM data_sources
        ) AS sub
        WHERE user_id IS NOT NULL
        ON CONFLICT DO NOTHING
    """))

    op.execute(sa.text("""
        UPDATE pipelines_v2 pv
        SET project_id = p.id
        FROM projects p
        WHERE p.user_id = pv.user_id
          AND p.workspace_id = pv.workspace_id
          AND p.name = 'Default Project'
          AND pv.project_id IS NULL
    """))

    op.execute(sa.text("""
        UPDATE dashboards_v2 dv
        SET project_id = p.id
        FROM projects p
        WHERE p.user_id = dv.user_id
          AND p.workspace_id = dv.workspace_id
          AND p.name = 'Default Project'
          AND dv.project_id IS NULL
    """))

    op.execute(sa.text("""
        UPDATE data_sources ds
        SET project_id = p.id
        FROM projects p
        WHERE p.user_id = ds.user_id
          AND p.name = 'Default Project'
          AND ds.project_id IS NULL
    """))


def downgrade() -> None:
    op.drop_constraint("fk_data_sources_project", "data_sources", type_="foreignkey")
    op.drop_constraint("fk_dashboards_v2_project", "dashboards_v2", type_="foreignkey")
    op.drop_constraint("fk_pipelines_v2_project", "pipelines_v2", type_="foreignkey")

    op.drop_column("data_sources",  "project_id")
    op.drop_column("dashboards_v2", "project_id")
    op.drop_column("pipelines_v2",  "project_id")

    op.drop_index("idx_projects_workspace_id", table_name="projects")
    op.drop_index("idx_projects_user_id",      table_name="projects")
    op.drop_table("projects")
