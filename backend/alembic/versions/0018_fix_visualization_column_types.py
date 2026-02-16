"""Fix visualization tables column types

Revision ID: 0018_fix_visualization_column_types
Revises: 0017_visualization_tables
Create Date: 2025-02-16 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0018_fix_visualization_column_types'
down_revision = '0017_visualization_tables'
branch_labels = None
depends_on = None


def upgrade():
    # Fix viz_dashboard_themes columns
    op.alter_column('viz_dashboard_themes', 'user_id',
                    existing_type=sa.Integer(),
                    type_=sa.String(),
                    existing_nullable=False)
    
    op.alter_column('viz_dashboard_themes', 'workspace_id',
                    existing_type=sa.Integer(),
                    type_=sa.String(),
                    existing_nullable=True)
    
    # Fix viz_dashboards columns
    op.alter_column('viz_dashboards', 'user_id',
                    existing_type=sa.Integer(),
                    type_=sa.String(),
                    existing_nullable=False)
    
    op.alter_column('viz_dashboards', 'workspace_id',
                    existing_type=sa.Integer(),
                    type_=sa.String(),
                    existing_nullable=False)


def downgrade():
    # Revert viz_dashboards columns
    op.alter_column('viz_dashboards', 'workspace_id',
                    existing_type=sa.String(),
                    type_=sa.Integer(),
                    existing_nullable=False)
    
    op.alter_column('viz_dashboards', 'user_id',
                    existing_type=sa.String(),
                    type_=sa.Integer(),
                    existing_nullable=False)
    
    # Revert viz_dashboard_themes columns
    op.alter_column('viz_dashboard_themes', 'workspace_id',
                    existing_type=sa.String(),
                    type_=sa.Integer(),
                    existing_nullable=True)
    
    op.alter_column('viz_dashboard_themes', 'user_id',
                    existing_type=sa.String(),
                    type_=sa.Integer(),
                    existing_nullable=False)
