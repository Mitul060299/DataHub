"""transformation history

Revision ID: 0016_transformation_history
Revises: 0015_workspace_scope
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa

revision = "0016_transformation_history"
down_revision = "0015_workspace_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transformation_history",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("dataset_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("operation", sa.String(), nullable=False),
        sa.Column("sql", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("affected_rows", sa.String(), nullable=True),
        sa.Column("execution_time_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="completed"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "idx_transformation_history_dataset",
        "transformation_history",
        ["dataset_id"],
    )
    op.create_index(
        "idx_transformation_history_user",
        "transformation_history",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_transformation_history_user", table_name="transformation_history")
    op.drop_index("idx_transformation_history_dataset", table_name="transformation_history")
    op.drop_table("transformation_history")
