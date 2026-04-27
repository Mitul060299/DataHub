"""0065_project_artifact_cascade

Change project_id FK on visualizations and canvas_layouts from ON DELETE SET NULL
to ON DELETE CASCADE.

Previously, deleting a project left orphaned rows with project_id = NULL in these
two tables. On subsequent queries those orphaned rows leaked into every project
context (any user/project combination), causing "ghost" visualizations and canvas
layouts to appear in new projects (even with different project UUIDs).

Datasets (dataset_meta), dashboards (dashboards_v2), and pipelines (pipelines_v2)
keep SET NULL because those are valuable, reusable assets — they become visible in
the workspace-level "no filter" view rather than being silently destroyed.

Revision ID: 0065
Revises: 0064
Create Date: 2026-04-27
"""
from alembic import op

# revision identifiers
revision = "0065"
down_revision = "0064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── visualizations ──────────────────────────────────────────────────────
    # Drop the existing FK (SET NULL), re-add as CASCADE.
    op.drop_constraint(
        "visualizations_project_id_fkey",
        "visualizations",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "visualizations_project_id_fkey",
        "visualizations",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # ── canvas_layouts ──────────────────────────────────────────────────────
    op.drop_constraint(
        "canvas_layouts_project_id_fkey",
        "canvas_layouts",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "canvas_layouts_project_id_fkey",
        "canvas_layouts",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # ── clean up existing orphans (project_id = NULL due to prior deletions) ─
    # These rows are no longer reachable from any project context; removing them
    # eliminates the ghost-data problem for existing databases immediately.
    op.execute("DELETE FROM visualizations WHERE project_id IS NULL")
    op.execute("DELETE FROM canvas_layouts WHERE project_id IS NULL")


def downgrade() -> None:
    # Restore SET NULL behaviour and re-create any deleted rows is impractical,
    # so downgrade simply reverts the FK constraint without restoring data.
    op.drop_constraint(
        "visualizations_project_id_fkey",
        "visualizations",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "visualizations_project_id_fkey",
        "visualizations",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint(
        "canvas_layouts_project_id_fkey",
        "canvas_layouts",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "canvas_layouts_project_id_fkey",
        "canvas_layouts",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )
