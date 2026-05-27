"""0083_new_pricing_tiers

Revision ID: 0083_new_pricing_tiers
Revises: 0082_ensure_forked_step_col
Create Date: 2026-06-04

Implements the new 3-tier pricing model (Starter / Professional / Expert)
while BILLING_ENABLED=false so all changes are invisible to end users
today (everyone resolves to Beta).

Changes:
  1. Data-migrate ``users.plan``:
       Free        → Starter
       Starter     → Professional   (old paid Starter → new mid tier)
       Professional → Professional  (normalise case)
       Team        → Expert
       Business    → Expert
       Enterprise  → Expert
     Beta rows are not touched.

  2. Add ``project_id`` FK column to ``audit_logs`` (nullable, soft FK so
     rows survive project deletion).

  3. Drop ``organizations`` and ``organization_members`` tables which are
     superseded by project-level collaboration.

All DDL is idempotent — safe to run on a clean DB or one that already has
some of these changes applied.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0083_new_pricing_tiers"
down_revision = "0082_ensure_forked_step_col"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ------------------------------------------------------------------
    # 1. Data-migrate users.plan
    # ------------------------------------------------------------------
    conn.execute(sa.text(
        "UPDATE users SET plan = 'Starter' WHERE lower(plan) = 'free'"
    ))
    # Old paid 'Starter' (₹999 tier) maps to new 'Professional'
    conn.execute(sa.text(
        "UPDATE users SET plan = 'Professional' WHERE lower(plan) = 'starter'"
    ))
    # Normalise case for Professional (in case of mixed-case rows)
    conn.execute(sa.text(
        "UPDATE users SET plan = 'Professional' WHERE lower(plan) = 'professional'"
    ))
    conn.execute(sa.text(
        "UPDATE users SET plan = 'Expert' WHERE lower(plan) = 'team'"
    ))
    conn.execute(sa.text(
        "UPDATE users SET plan = 'Expert' WHERE lower(plan) = 'business'"
    ))
    conn.execute(sa.text(
        "UPDATE users SET plan = 'Expert' WHERE lower(plan) = 'enterprise'"
    ))
    # Beta rows are intentionally NOT touched.

    # ------------------------------------------------------------------
    # 2. Add project_id column to audit_logs (idempotent via DO block)
    # ------------------------------------------------------------------
    conn.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'audit_logs' AND column_name = 'project_id'
            ) THEN
                ALTER TABLE audit_logs
                    ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
                CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id
                    ON audit_logs (project_id);
            END IF;
        END
        $$;
    """))

    # ------------------------------------------------------------------
    # 3. Drop legacy organizations tables (superseded by project-level collab)
    # ------------------------------------------------------------------
    conn.execute(sa.text(
        "DROP TABLE IF EXISTS organization_members CASCADE"
    ))
    conn.execute(sa.text(
        "DROP TABLE IF EXISTS organizations CASCADE"
    ))


def downgrade() -> None:
    # NOTE: downgrade does NOT reverse the users.plan data migration —
    # restoring old plan strings would require knowing which users had
    # which paid plan before migration, which is not stored here.
    # Downgrade is intentionally partial (structural changes only).
    conn = op.get_bind()

    # Remove the project_id column from audit_logs
    conn.execute(sa.text("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'audit_logs' AND column_name = 'project_id'
            ) THEN
                ALTER TABLE audit_logs DROP COLUMN project_id;
            END IF;
        END
        $$;
    """))
    # We do NOT recreate organizations / organization_members tables on downgrade.
