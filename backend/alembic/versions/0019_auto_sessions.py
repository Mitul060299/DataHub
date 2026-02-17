"""Add Full Auto agent session tables - Revision 0019"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0019'
down_revision = '0018'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('auto_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('dataset_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('datasets.id', ondelete='CASCADE'), nullable=False),

        sa.Column('title', sa.String(255)),              # auto-generated from first message
        sa.Column('status', sa.String(50), default='active'),
        # 'active' | 'running' | 'completed' | 'failed'

        sa.Column('conversation', postgresql.JSONB, server_default='[]'),
        # Array of {role, content, type, data, timestamp}
        # type: 'text'|'plan'|'step_start'|'step_result'|'chart'|'insight'|'error'

        sa.Column('execution_plan', postgresql.JSONB),   # steps the agent will run
        sa.Column('completed_steps', postgresql.JSONB, server_default='[]'),
        sa.Column('current_step', sa.Integer, default=0),
        sa.Column('total_steps', sa.Integer, default=0),

        sa.Column('artifacts', postgresql.JSONB, server_default='{}'),
        # {
        #   'cleaned_dataset_id': '...',
        #   'experiment_id': '...',
        #   'dashboard_id': '...',
        #   'report_summary': '...',
        #   'insights': [...],
        # }

        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    op.create_index('idx_auto_sessions_user', 'auto_sessions', ['user_id'])
    op.create_index('idx_auto_sessions_dataset', 'auto_sessions', ['dataset_id'])
    op.create_index('idx_auto_sessions_status', 'auto_sessions', ['status'])


def downgrade():
    op.drop_index('idx_auto_sessions_status')
    op.drop_index('idx_auto_sessions_dataset')
    op.drop_index('idx_auto_sessions_user')
    op.drop_table('auto_sessions')
