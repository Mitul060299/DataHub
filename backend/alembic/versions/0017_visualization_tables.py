"""Add visualization tables

Revision ID: 0017_visualization_tables
Revises: 0016_transformation_history
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0017_visualization_tables'
down_revision = '0016_transformation_history'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    def ensure_index(index_name, table_name, columns):
        existing_indexes = {
            idx.get('name')
            for idx in inspector.get_indexes(table_name)
            if idx.get('name')
        }
        if index_name not in existing_indexes:
            # Skip if any referenced column no longer exists (e.g. workspace_id was dropped)
            existing_cols = {c['name'] for c in inspector.get_columns(table_name)}
            if not all(c in existing_cols for c in columns):
                return
            op.create_index(index_name, table_name, columns)

    # Dashboard Themes Table (using viz_ prefix to avoid conflicts)
    if not inspector.has_table('viz_dashboard_themes'):
        op.create_table('viz_dashboard_themes',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('workspace_id', sa.Integer(), nullable=True),
            sa.Column('is_global', sa.Boolean(), default=False),
            sa.Column('colors', postgresql.JSONB(), nullable=False),
            sa.Column('fonts', postgresql.JSONB(), nullable=True),
            sa.Column('logo_url', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), onupdate=sa.text('now()')),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
    ensure_index('idx_viz_dashboard_themes_user', 'viz_dashboard_themes', ['user_id'])
    ensure_index('idx_viz_dashboard_themes_workspace', 'viz_dashboard_themes', ['workspace_id'])

    # Dashboards Table
    if not inspector.has_table('viz_dashboards'):
        op.create_table('viz_dashboards',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('workspace_id', sa.Integer(), nullable=False),
            sa.Column('dataset_id', sa.Integer(), nullable=True),
            sa.Column('theme_id', sa.Integer(), nullable=True),
            sa.Column('layout', postgresql.JSONB(), nullable=True),
            sa.Column('refresh_interval', sa.Integer(), nullable=True),
            sa.Column('is_public', sa.Boolean(), default=False),
            sa.Column('share_token', sa.String(), nullable=True, unique=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), onupdate=sa.text('now()')),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['theme_id'], ['viz_dashboard_themes.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
    ensure_index('idx_viz_dashboards_user', 'viz_dashboards', ['user_id'])
    ensure_index('idx_viz_dashboards_workspace', 'viz_dashboards', ['workspace_id'])
    ensure_index('idx_viz_dashboards_dataset', 'viz_dashboards', ['dataset_id'])
    ensure_index('idx_viz_dashboards_share_token', 'viz_dashboards', ['share_token'])

    # Dashboard Widgets Table
    if not inspector.has_table('viz_dashboard_widgets'):
        op.create_table('viz_dashboard_widgets',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('dashboard_id', sa.Integer(), nullable=False),
            sa.Column('widget_type', sa.String(), nullable=False),  # bar, line, pie, kpi, table, etc.
            sa.Column('title', sa.String(), nullable=False),
            sa.Column('dataset_id', sa.Integer(), nullable=True),
            sa.Column('config', postgresql.JSONB(), nullable=False),  # Stores chart configuration
            sa.Column('position', postgresql.JSONB(), nullable=False),  # {x, y, w, h} for grid layout
            sa.Column('filters', postgresql.JSONB(), nullable=True),  # Widget-specific filters
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), onupdate=sa.text('now()')),
            sa.ForeignKeyConstraint(['dashboard_id'], ['viz_dashboards.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
    ensure_index('idx_viz_dashboard_widgets_dashboard', 'viz_dashboard_widgets', ['dashboard_id'])
    ensure_index('idx_viz_dashboard_widgets_dataset', 'viz_dashboard_widgets', ['dataset_id'])

    # Dashboard Filters Table
    if not inspector.has_table('viz_dashboard_filters'):
        op.create_table('viz_dashboard_filters',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('dashboard_id', sa.Integer(), nullable=False),
            sa.Column('filter_type', sa.String(), nullable=False),  # date_range, dropdown, slider, etc.
            sa.Column('column_name', sa.String(), nullable=False),
            sa.Column('config', postgresql.JSONB(), nullable=False),
            sa.Column('applies_to_widgets', postgresql.ARRAY(sa.Integer()), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), onupdate=sa.text('now()')),
            sa.ForeignKeyConstraint(['dashboard_id'], ['viz_dashboards.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
    ensure_index('idx_viz_dashboard_filters_dashboard', 'viz_dashboard_filters', ['dashboard_id'])


def downgrade():
    op.drop_index('idx_viz_dashboard_filters_dashboard')
    op.drop_table('viz_dashboard_filters')
    
    op.drop_index('idx_viz_dashboard_widgets_dataset')
    op.drop_index('idx_viz_dashboard_widgets_dashboard')
    op.drop_table('viz_dashboard_widgets')
    
    op.drop_index('idx_viz_dashboards_share_token')
    op.drop_index('idx_viz_dashboards_dataset')
    op.drop_index('idx_viz_dashboards_workspace')
    op.drop_index('idx_viz_dashboards_user')
    op.drop_table('viz_dashboards')
    
    op.drop_index('idx_viz_dashboard_themes_workspace')
    op.drop_index('idx_viz_dashboard_themes_user')
    op.drop_table('viz_dashboard_themes')
