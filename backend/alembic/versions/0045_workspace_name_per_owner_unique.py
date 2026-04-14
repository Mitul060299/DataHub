"""Replace global workspaces.name unique constraint with per-owner compound unique.

Before: UNIQUE(name) — prevents two users from both naming their workspace "My Workspace".
After:  UNIQUE(owner_id, name) — uniqueness is scoped per owner, which is correct.

NULL owner_id rows are unaffected (PostgreSQL treats NULL != NULL in unique indexes,
so multiple NULL-owner rows with the same name are still allowed).

Revision ID: 0045
Revises: 0044
Create Date: 2026-04-14
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect as sa_inspect, text


revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)

    if not inspector.has_table("workspaces"):
        return

    # Drop the old global unique constraint/index on name.
    # Introspect the actual constraint name (varies by Alembic/PG version).
    existing_uq = inspector.get_unique_constraints("workspaces")
    for uq in existing_uq:
        if uq.get("column_names") == ["name"]:
            op.drop_constraint(uq["name"], "workspaces", type_="unique")
            break
    else:
        # Fall back: try dropping the implicit index by its common generated name.
        try:
            conn.execute(text("DROP INDEX IF EXISTS ix_workspaces_name"))
        except Exception:
            pass

    # Create the new compound unique index (owner_id, name).
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("workspaces")}
    if "uq_workspaces_owner_name" not in existing_indexes:
        op.create_index(
            "uq_workspaces_owner_name",
            "workspaces",
            ["owner_id", "name"],
            unique=True,
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)

    if not inspector.has_table("workspaces"):
        return

    # Drop compound index.
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("workspaces")}
    if "uq_workspaces_owner_name" in existing_indexes:
        op.drop_index("uq_workspaces_owner_name", table_name="workspaces")

    # Restore simple unique constraint on name.
    existing_uq_cols = [uq.get("column_names") for uq in inspector.get_unique_constraints("workspaces")]
    if ["name"] not in existing_uq_cols:
        op.create_unique_constraint("uq_workspaces_name", "workspaces", ["name"])
