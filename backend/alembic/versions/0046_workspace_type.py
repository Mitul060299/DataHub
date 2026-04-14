"""Add workspace_type column to workspaces and seed personal workspace per user.

Revision ID: 0046
Revises: 0045
Create Date: 2026-04-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect, text

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)

    # 1. Add workspace_type column if absent
    existing_cols = {c["name"] for c in inspector.get_columns("workspaces")}
    if "workspace_type" not in existing_cols:
        op.add_column(
            "workspaces",
            sa.Column(
                "workspace_type",
                sa.String(),
                nullable=False,
                server_default="personal",
            ),
        )

    # 2. Backfill: all existing workspaces default to 'personal'
    conn.execute(text(
        "UPDATE workspaces SET workspace_type = 'personal' WHERE workspace_type IS NULL OR workspace_type = ''"
    ))

    # 3. For every user in the users table that has NO owned workspace,
    #    create a personal workspace named after them.
    users = conn.execute(text("SELECT id, username FROM users")).fetchall()
    for user in users:
        user_id = user[0]
        username = user[1] or user_id
        existing = conn.execute(
            text("SELECT id FROM workspaces WHERE owner_id = :uid LIMIT 1"),
            {"uid": user_id},
        ).fetchone()
        if existing:
            continue
        import uuid as _uuid
        ws_id = _uuid.uuid4().hex
        # Derive a safe unique name from username
        safe_name = (username.split("@")[0] if "@" in username else username)[:40]
        ws_name = f"{safe_name}-personal"
        # Ensure uniqueness by appending short id suffix if name already taken
        taken = conn.execute(
            text("SELECT 1 FROM workspaces WHERE owner_id IS NOT DISTINCT FROM :uid AND name = :n LIMIT 1"),
            {"uid": user_id, "n": ws_name},
        ).fetchone()
        if taken:
            ws_name = f"{safe_name}-{ws_id[:6]}"
        conn.execute(
            text(
                "INSERT INTO workspaces (id, name, is_shared, workspace_type, owner_id) "
                "VALUES (:id, :name, false, 'personal', :owner)"
            ),
            {"id": ws_id, "name": ws_name, "owner": user_id},
        )
        member_id = _uuid.uuid4().hex
        conn.execute(
            text(
                "INSERT INTO workspace_members "
                "(id, workspace_id, user_id, email, role, status, invited_by, created_at) "
                "VALUES (:mid, :wid, :uid, :email, 'admin', 'active', :uid, NOW())"
            ),
            {"mid": member_id, "wid": ws_id, "uid": user_id, "email": username},
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing_cols = {c["name"] for c in inspector.get_columns("workspaces")}
    if "workspace_type" in existing_cols:
        op.drop_column("workspaces", "workspace_type")
