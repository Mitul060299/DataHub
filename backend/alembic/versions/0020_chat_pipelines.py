"""Add Chat Sessions and Reproducible Pipeline tables

Revision ID: 0020
Revises: 0018_fix_visualization_column_types
Create Date: 2026-02-19 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0020'
down_revision = '0018_fix_visualization_column_types'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    def ensure_index(index_name, table_name, columns):
        existing_indexes = {
            idx.get('name')
            for idx in sa.inspect(bind).get_indexes(table_name)
            if idx.get('name')
        }
        if index_name not in existing_indexes:
            op.create_index(index_name, table_name, columns)

    # ==================== CHAT SESSIONS TABLE ====================
    if not inspector.has_table('chat_sessions'):
        op.create_table('chat_sessions',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                    server_default=sa.text('gen_random_uuid()')),
            sa.Column('user_id', postgresql.UUID(as_uuid=True),
                    sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('workspace_id', sa.String(255),
                    sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
            sa.Column('dataset_id', postgresql.UUID(as_uuid=True),
                    sa.ForeignKey('dataset_meta.id', ondelete='CASCADE'), nullable=False),

            sa.Column('title', sa.String(500)),
            sa.Column('description', sa.Text, nullable=True),
            sa.Column('status', sa.String(50), default='active'),

            sa.Column('messages', postgresql.JSONB, server_default='[]'),
            sa.Column('pipeline_id', postgresql.UUID(as_uuid=True), nullable=True),
            
            sa.Column('execution_context', postgresql.JSONB, server_default='{}'),
            sa.Column('parameters', postgresql.JSONB, server_default='{}'),
            sa.Column('artifacts', postgresql.JSONB, server_default='{}'),
            
            sa.Column('shared_with', postgresql.JSONB, server_default='[]'),
            sa.Column('tags', postgresql.ARRAY(sa.String(255)), server_default='{}'),
            sa.Column('pinned', sa.Boolean, default=False),
            sa.Column('is_template', sa.Boolean, default=False),

            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        )

    ensure_index('idx_chat_sessions_user', 'chat_sessions', ['user_id'])
    ensure_index('idx_chat_sessions_workspace', 'chat_sessions', ['workspace_id'])
    ensure_index('idx_chat_sessions_dataset', 'chat_sessions', ['dataset_id'])
    ensure_index('idx_chat_sessions_status', 'chat_sessions', ['status'])
    ensure_index('idx_chat_sessions_created', 'chat_sessions', ['created_at'])

    # ==================== PIPELINES TABLE ====================
    if not inspector.has_table('pipelines_v2'):
        op.create_table('pipelines_v2',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                    server_default=sa.text('gen_random_uuid()')),
            sa.Column('user_id', postgresql.UUID(as_uuid=True),
                    sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('workspace_id', sa.String(255),
                    sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),

            sa.Column('name', sa.String(500), nullable=False),
            sa.Column('description', sa.Text, nullable=True),
            sa.Column('type', sa.String(50), default='manual'),
            sa.Column('status', sa.String(50), default='draft'),
            
            sa.Column('steps', postgresql.JSONB, nullable=False),
            sa.Column('execution_config', postgresql.JSONB, server_default='{}'),
            
            sa.Column('version', sa.Integer, default=1),
            sa.Column('parent_pipeline_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('checksum', sa.String(64), nullable=True),
            
            sa.Column('tags', postgresql.ARRAY(sa.String(255)), nullable=True),
            sa.Column('is_public', sa.Boolean, default=False),

            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        )

    ensure_index('idx_pipelines_v2_user', 'pipelines_v2', ['user_id'])
    ensure_index('idx_pipelines_v2_workspace', 'pipelines_v2', ['workspace_id'])
    ensure_index('idx_pipelines_v2_status', 'pipelines_v2', ['status'])

    # ==================== PIPELINE RUNS TABLE ====================
    if not inspector.has_table('pipeline_runs_v2'):
        op.create_table('pipeline_runs_v2',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                server_default=sa.text('gen_random_uuid()')),
            sa.Column('pipeline_id', postgresql.UUID(as_uuid=True),
                sa.ForeignKey('pipelines_v2.id', ondelete='CASCADE'), nullable=False),
            sa.Column('user_id', postgresql.UUID(as_uuid=True),
                sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('session_id', postgresql.UUID(as_uuid=True),
                sa.ForeignKey('chat_sessions.id', ondelete='SET NULL'), nullable=True),

            sa.Column('status', sa.String(50), default='pending'),
            sa.Column('step_results', postgresql.JSONB, server_default='{}'),
            
            sa.Column('input_dataset_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('output_dataset_id', postgresql.UUID(as_uuid=True), nullable=True),
            
            sa.Column('metrics', postgresql.JSONB, server_default='{}'),
            sa.Column('execution_log', postgresql.JSONB, server_default='[]'),
            
            sa.Column('triggered_by', sa.String(50), default='manual'),
            sa.Column('error_message', sa.Text, nullable=True),
            
            sa.Column('started_at', sa.DateTime(timezone=True)),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        )

    ensure_index('idx_pipeline_runs_v2_pipeline', 'pipeline_runs_v2', ['pipeline_id'])
    ensure_index('idx_pipeline_runs_v2_session', 'pipeline_runs_v2', ['session_id'])
    ensure_index('idx_pipeline_runs_v2_status', 'pipeline_runs_v2', ['status'])

    # ==================== TRANSFORMATION STEPS TABLE ====================
    if not inspector.has_table('transformation_steps'):
        op.create_table('transformation_steps',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                    server_default=sa.text('gen_random_uuid()')),
            sa.Column('chat_session_id', postgresql.UUID(as_uuid=True),
                    sa.ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False),
            sa.Column('pipeline_run_id', postgresql.UUID(as_uuid=True),
                    sa.ForeignKey('pipeline_runs_v2.id', ondelete='SET NULL'), nullable=True),

            sa.Column('step_number', sa.Integer, nullable=False),
            sa.Column('action_type', sa.String(100), nullable=False),
            sa.Column('description', sa.Text),
            sa.Column('parameters', postgresql.JSONB),
            sa.Column('sql_generated', sa.Text, nullable=True),

            sa.Column('input_rows', sa.Integer, nullable=True),
            sa.Column('output_rows', sa.Integer, nullable=True),
            sa.Column('execution_time_ms', sa.Integer, nullable=True),

            sa.Column('status', sa.String(50), default='completed'),
            sa.Column('error_details', sa.Text, nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        )

    ensure_index('idx_transformation_steps_session', 'transformation_steps', ['chat_session_id'])
    ensure_index('idx_transformation_steps_run', 'transformation_steps', ['pipeline_run_id'])

    # ==================== CHAT TEMPLATES TABLE ====================
    if not inspector.has_table('chat_templates'):
        op.create_table('chat_templates',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                    server_default=sa.text('gen_random_uuid()')),
            sa.Column('user_id', postgresql.UUID(as_uuid=True),
                    sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('workspace_id', sa.String(255),
                    sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),

            sa.Column('name', sa.String(500), nullable=False),
            sa.Column('description', sa.Text, nullable=True),
            sa.Column('category', sa.String(100)),

            sa.Column('initial_prompt', sa.Text),
            sa.Column('execution_flow', postgresql.JSONB),
            
            sa.Column('is_public', sa.Boolean, default=False),
            sa.Column('usage_count', sa.Integer, default=0),

            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        )

    ensure_index('idx_chat_templates_workspace', 'chat_templates', ['workspace_id'])
    ensure_index('idx_chat_templates_category', 'chat_templates', ['category'])

    # ==================== CHAT SESSION SNAPSHOTS TABLE ====================
    if not inspector.has_table('chat_session_snapshots'):
        op.create_table('chat_session_snapshots',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                    server_default=sa.text('gen_random_uuid()')),
            sa.Column('session_id', postgresql.UUID(as_uuid=True),
                    sa.ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False),

            sa.Column('version', sa.Integer, nullable=False),
            sa.Column('snapshot_type', sa.String(50)),
            sa.Column('messages_count', sa.Integer),
            sa.Column('dataset_state', postgresql.JSONB),

            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),

            sa.UniqueConstraint('session_id', 'version', name='uq_session_version'),
        )

    ensure_index('idx_chat_session_snapshots_session', 'chat_session_snapshots', ['session_id'])


def downgrade():
    op.drop_index('idx_chat_session_snapshots_session')
    op.drop_table('chat_session_snapshots')

    op.drop_index('idx_chat_templates_category')
    op.drop_index('idx_chat_templates_workspace')
    op.drop_table('chat_templates')

    op.drop_index('idx_transformation_steps_run')
    op.drop_index('idx_transformation_steps_session')
    op.drop_table('transformation_steps')

    op.drop_index('idx_pipeline_runs_v2_status')
    op.drop_index('idx_pipeline_runs_v2_session')
    op.drop_index('idx_pipeline_runs_v2_pipeline')
    op.drop_table('pipeline_runs_v2')

    op.drop_index('idx_pipelines_v2_status')
    op.drop_index('idx_pipelines_v2_workspace')
    op.drop_index('idx_pipelines_v2_user')
    op.drop_table('pipelines_v2')

    op.drop_index('idx_chat_sessions_created')
    op.drop_index('idx_chat_sessions_status')
    op.drop_index('idx_chat_sessions_dataset')
    op.drop_index('idx_chat_sessions_workspace')
    op.drop_index('idx_chat_sessions_user')
    op.drop_table('chat_sessions')
