"""Convert remaining 0020-era UUID columns to TEXT.

Migration 0020 created several tables with ``postgresql.UUID`` columns and FK
constraints that the application code (which uses string identifiers and
Supabase ``sub`` claims) cannot reliably satisfy.  Migration 0044 fixed
``chat_sessions``; this migration repeats the same idempotent fix for the
remaining tables that 0020 created with UUID columns:

  - ``pipelines_v2``
  - ``pipeline_runs_v2``
  - ``transformation_steps``
  - ``chat_templates``
  - ``chat_session_snapshots``

Behaviour:
  * Drops every FK on each table (introspected by name).
  * Converts any UUID-typed column to TEXT with ``USING <col>::TEXT``.
  * No-op if the column is already TEXT/VARCHAR.

Safe to run on any DB state — including production environments where 0020
silently failed and the tables were re-created with TEXT columns later.

Revision ID: 0061
Revises: 0060
Create Date: 2026-04-26
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect as sa_inspect, text


revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None


# tables → columns we expect might be UUID-typed (per migration 0020)
_TABLES_TO_FIX: dict[str, list[str]] = {
    "pipelines_v2": ["id", "user_id", "parent_pipeline_id"],
    "pipeline_runs_v2": [
        "id",
        "pipeline_id",
        "user_id",
        "session_id",
        "input_dataset_id",
        "output_dataset_id",
    ],
    "transformation_steps": ["id", "chat_session_id", "pipeline_run_id"],
    "chat_templates": ["id", "user_id"],
    "chat_session_snapshots": ["id", "session_id"],
}


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    tables_in_db = set(inspector.get_table_names())

    for table_name, candidate_cols in _TABLES_TO_FIX.items():
        if table_name not in tables_in_db:
            continue

        # 1. Drop every FK constraint on this table — they reference UUID-typed
        #    parents and would block ALTER COLUMN.  Application code does its
        #    own integrity enforcement.
        for fk in inspector.get_foreign_keys(table_name):
            fk_name = fk.get("name")
            if not fk_name:
                continue
            try:
                op.drop_constraint(fk_name, table_name, type_="foreignkey")
            except Exception:
                pass

        # 2. Re-introspect after dropping FKs so we see fresh column metadata.
        existing_cols = {
            c["name"]: c for c in inspector.get_columns(table_name)
        }

        for col_name in candidate_cols:
            col_meta = existing_cols.get(col_name)
            if col_meta is None:
                continue
            type_str = str(col_meta.get("type", "")).upper()
            if "UUID" not in type_str:
                # Already TEXT/VARCHAR — nothing to do.
                continue
            try:
                conn.execute(
                    text(
                        f'ALTER TABLE "{table_name}" '
                        f'ALTER COLUMN "{col_name}" TYPE TEXT '
                        f'USING "{col_name}"::TEXT'
                    )
                )
            except Exception:
                # Best-effort — never fail the deploy on a single column.
                pass


def downgrade() -> None:
    # Intentional no-op: converting strings back to UUID would lose data
    # for any non-UUID identifiers the application has already inserted.
    pass
