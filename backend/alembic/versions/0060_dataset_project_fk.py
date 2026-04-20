"""add ON DELETE SET NULL FK on dataset_meta.project_id

Migration 0057 added the ``dataset_meta.project_id`` *column* but never
attached a database-level foreign-key constraint.  As a result the
``delete_project`` route had to manually NULL every child reference
before it could drop the projects row -- and any orphan rows pointing
at a nonexistent project would silently linger.

This migration:
  1. Repairs any orphaned ``project_id`` values (point → missing parent)
     by setting them to NULL.
  2. Adds the FK ``dataset_meta.project_id -> projects.id`` with
     ``ON DELETE SET NULL`` so future project deletions cascade
     correctly via the database itself.

Revision ID: 0060
Revises:    0059
Create Date: 2026-04-20
"""
from __future__ import annotations

from alembic import op


revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None


FK_NAME = "fk_dataset_meta_project_id"


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Repair orphans so the FK creation does not fail.
    bind.exec_driver_sql(
        """
        UPDATE dataset_meta
        SET    project_id = NULL
        WHERE  project_id IS NOT NULL
          AND  project_id NOT IN (SELECT id FROM projects)
        """
    )

    # 2. Drop any pre-existing constraint with this name (defensive — safe
    #    on first run and idempotent on retries).
    bind.exec_driver_sql(
        f"ALTER TABLE dataset_meta DROP CONSTRAINT IF EXISTS {FK_NAME}"
    )

    # 3. Create the constraint.
    op.create_foreign_key(
        FK_NAME,
        source_table="dataset_meta",
        referent_table="projects",
        local_cols=["project_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql(
        f"ALTER TABLE dataset_meta DROP CONSTRAINT IF EXISTS {FK_NAME}"
    )
