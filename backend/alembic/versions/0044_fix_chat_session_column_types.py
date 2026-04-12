"""Fix chat_sessions column types and drop FK constraints.

Migration 0020 created chat_sessions with UUID-typed columns and FK constraints
to users.id, workspaces.id, and dataset_meta.id.  The app data model uses:
  - user_id: email string or Supabase sub claim (may not match users.id UUIDs)
  - workspace_id: literal string "default" (no matching row in workspaces table)
  - dataset_id: UUID string (correct structurally but FK cascade causes deletes)
  - id: client-provided UUID string primary key

This migration drops the FK constraints and converts UUID-typed columns to TEXT
so any string identifier is accepted. Safe to run on any DB state.

Revision ID: 0044
Revises: 0043
Create Date: 2026-04-12
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect as sa_inspect, text


revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)

    if not inspector.has_table("chat_sessions"):
        return

    # 1. Drop all FK constraints on this table (introspect names to be portable).
    existing_fks = inspector.get_foreign_keys("chat_sessions")
    for fk in existing_fks:
        fk_name = fk.get("name")
        if not fk_name:
            continue
        try:
            op.drop_constraint(fk_name, "chat_sessions", type_="foreignkey")
        except Exception:
            pass

    # 2. Convert UUID-typed columns to TEXT so any string identifier is accepted.
    existing_cols = {c["name"]: c for c in inspector.get_columns("chat_sessions")}
    uuid_cols = ["id", "user_id", "workspace_id", "dataset_id", "pipeline_id"]
    for col_name in uuid_cols:
        if col_name not in existing_cols:
            continue
        type_str = str(existing_cols[col_name].get("type", "")).upper()
        if "UUID" not in type_str:
            continue
        try:
            conn.execute(
                text(
                    f"ALTER TABLE chat_sessions "
                    f"ALTER COLUMN \"{col_name}\" TYPE TEXT USING \"{col_name}\"::TEXT"
                )
            )
        except Exception:
            pass


def downgrade() -> None:
    pass
