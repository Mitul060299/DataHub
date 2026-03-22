"""add reviews table

Revision ID: 0036_reviews
Revises: 0035_dashboard_comments
Create Date: 2026-03-21
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0036_reviews"
down_revision = "0035_dashboard_comments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reviews",
        sa.Column(
            "id",
            sa.Text(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()::text"),
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "approved",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("idx_reviews_approved", "reviews", ["approved"])


def downgrade() -> None:
    op.drop_index("idx_reviews_approved", table_name="reviews")
    op.drop_table("reviews")
