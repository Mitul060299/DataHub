"""dashboard comments table

Revision ID: 0035_dashboard_comments
Revises: 0034_dataset_version_cols
Create Date: 2025-07-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0035_dashboard_comments"
down_revision = "0034_dataset_version_cols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Guard against the table already existing — the startup safety-net DDL in
    # main.py creates it with IF NOT EXISTS, so on first deploys that reached
    # the safety-net before Alembic ran the table is already present.
    bind = op.get_bind()
    if "dashboard_comments" in inspect(bind).get_table_names():
        return

    op.create_table(
        "dashboard_comments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("dashboard_id", sa.String(), nullable=False, index=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("author_name", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
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


def downgrade() -> None:
    op.drop_table("dashboard_comments")
