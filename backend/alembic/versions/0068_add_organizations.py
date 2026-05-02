"""add organizations and organization_members tables

Revision ID: 0068
Revises: 0067
Create Date: 2025-07-15

Introduces an org-account model where one paying user (the org owner) can
invite N other users by email. All members are equal at the project layer
(each can create/own projects), and all usage/quota/billing rolls up to the
org owner. Personal orgs are created lazily on first need; no backfill is
performed here so this migration is fully reversible and side-effect free.
"""
from alembic import op
import sqlalchemy as sa


revision = "0068"
down_revision = "0067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # organizations: one row per "billing entity". Owner is the paying user.
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TABLE IF NOT EXISTS organizations (
                id VARCHAR PRIMARY KEY,
                owner_user_id VARCHAR NOT NULL,
                name VARCHAR NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_organizations_owner_user_id
                ON organizations(owner_user_id);
        EXCEPTION WHEN others THEN NULL;
        END $$;
    """))

    # organization_members: pending + active members. Owner is implicit via
    # organizations.owner_user_id and is NOT inserted here. All members are
    # equal (no role column) — keeps things simple per spec.
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TABLE IF NOT EXISTS organization_members (
                id VARCHAR PRIMARY KEY,
                org_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                user_id VARCHAR NULL,
                email VARCHAR NOT NULL,
                status VARCHAR NOT NULL DEFAULT 'pending',
                invite_token VARCHAR NULL,
                invited_by VARCHAR NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                accepted_at TIMESTAMPTZ NULL
            );
            CREATE INDEX IF NOT EXISTS idx_om_org_id ON organization_members(org_id);
            CREATE INDEX IF NOT EXISTS idx_om_user_id ON organization_members(user_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_om_invite_token
                ON organization_members(invite_token) WHERE invite_token IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_om_org_email
                ON organization_members(org_id, email);
        EXCEPTION WHEN others THEN NULL;
        END $$;
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS organization_members CASCADE;"))
    conn.execute(sa.text("DROP TABLE IF EXISTS organizations CASCADE;"))
