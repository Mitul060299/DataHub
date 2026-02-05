"""init

Revision ID: 0001_init
Revises: 
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("username", sa.String(), nullable=False, unique=True),
        sa.Column("role", sa.String(), nullable=False),
    )
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
    )
    op.create_table(
        "contexts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("glossary", postgresql.JSONB(), nullable=False),
        sa.Column("rules", postgresql.JSONB(), nullable=False),
    )
    op.create_table(
        "dashboards",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("widgets", postgresql.JSONB(), nullable=False),
    )
    op.create_table(
        "dataset_meta",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("columns", postgresql.JSONB(), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
    )
    op.create_table(
        "dataset_data",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("rows", postgresql.JSONB(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("dataset_data")
    op.drop_table("dataset_meta")
    op.drop_table("dashboards")
    op.drop_table("contexts")
    op.drop_table("workspaces")
    op.drop_table("users")
