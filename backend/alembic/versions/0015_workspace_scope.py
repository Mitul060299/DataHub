"""workspace scope

Revision ID: 0015_workspace_scope
Revises: 0014_user_plan
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa

revision = "0015_workspace_scope"
down_revision = "0014_user_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dataset_meta",
        sa.Column("workspace_id", sa.String(), nullable=False, server_default="default"),
    )
    op.add_column(
        "import_tables",
        sa.Column("workspace_id", sa.String(), nullable=False, server_default="default"),
    )
    op.add_column(
        "import_connections",
        sa.Column("workspace_id", sa.String(), nullable=False, server_default="default"),
    )
    op.alter_column("dataset_meta", "workspace_id", server_default=None)
    op.alter_column("import_tables", "workspace_id", server_default=None)
    op.alter_column("import_connections", "workspace_id", server_default=None)


def downgrade() -> None:
    op.drop_column("import_connections", "workspace_id")
    op.drop_column("import_tables", "workspace_id")
    op.drop_column("dataset_meta", "workspace_id")
