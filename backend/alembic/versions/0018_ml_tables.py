"""Add ML tables - Revision 0018"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0018'
down_revision = '0017'
branch_labels = None
depends_on = None


def upgrade():
    # ML experiments table
    op.create_table('ml_experiments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('dataset_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('datasets.id', ondelete='CASCADE'), nullable=False),

        # Experiment metadata
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text),
        sa.Column('experiment_type', sa.String(50), nullable=False),
        # 'classification' | 'regression' | 'clustering' | 'forecasting' | 'anomaly_detection' | 'automl'

        # Configuration
        sa.Column('target_column', sa.String(255)),       # column to predict
        sa.Column('feature_columns', postgresql.JSONB),   # list of feature columns
        sa.Column('model_config', postgresql.JSONB),      # model hyperparameters
        sa.Column('training_config', postgresql.JSONB),   # train/test split, CV folds, etc.

        # Status
        sa.Column('status', sa.String(50), default='pending'),
        # 'pending' | 'preprocessing' | 'training' | 'evaluating' | 'completed' | 'failed'
        sa.Column('progress', sa.Integer, default=0),     # 0-100

        # Results
        sa.Column('metrics', postgresql.JSONB),           # accuracy, F1, RMSE, etc.
        sa.Column('best_model', sa.String(100)),          # e.g. 'RandomForest'
        sa.Column('feature_importance', postgresql.JSONB),
        sa.Column('confusion_matrix', postgresql.JSONB),
        sa.Column('predictions_path', sa.String(500)),    # S3 path to predictions CSV
        sa.Column('model_path', sa.String(500)),          # S3 path to saved model

        # AutoML
        sa.Column('is_automl', sa.Boolean, default=False),
        sa.Column('automl_trials', sa.Integer, default=0),
        sa.Column('automl_best_params', postgresql.JSONB),

        # Timing
        sa.Column('started_at', sa.DateTime(timezone=True)),
        sa.Column('completed_at', sa.DateTime(timezone=True)),
        sa.Column('training_duration_seconds', sa.Float),

        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    # Trained models table
    op.create_table('trained_models',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('ml_experiments.id', ondelete='CASCADE')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE')),

        sa.Column('model_name', sa.String(100), nullable=False),   # e.g. 'RandomForest', 'LSTM'
        sa.Column('model_type', sa.String(50)),                     # 'traditional' | 'deep_learning'
        sa.Column('framework', sa.String(50)),                      # 'sklearn' | 'pytorch' | 'keras'
        sa.Column('hyperparameters', postgresql.JSONB),
        sa.Column('metrics', postgresql.JSONB),
        sa.Column('model_path', sa.String(500)),
        sa.Column('is_best', sa.Boolean, default=False),

        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    # Predictions table
    op.create_table('predictions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('experiment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('ml_experiments.id', ondelete='CASCADE')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE')),

        sa.Column('input_data', postgresql.JSONB),
        sa.Column('prediction', postgresql.JSONB),
        sa.Column('confidence', sa.Float),
        sa.Column('prediction_type', sa.String(50)),   # 'single' | 'batch'

        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    # Indexes
    op.create_index('idx_ml_experiments_user', 'ml_experiments', ['user_id'])
    op.create_index('idx_ml_experiments_dataset', 'ml_experiments', ['dataset_id'])
    op.create_index('idx_ml_experiments_status', 'ml_experiments', ['status'])
    op.create_index('idx_trained_models_experiment', 'trained_models', ['experiment_id'])
    op.create_index('idx_predictions_experiment', 'predictions', ['experiment_id'])


def downgrade():
    op.drop_index('idx_predictions_experiment')
    op.drop_index('idx_trained_models_experiment')
    op.drop_index('idx_ml_experiments_status')
    op.drop_index('idx_ml_experiments_dataset')
    op.drop_index('idx_ml_experiments_user')
    op.drop_table('predictions')
    op.drop_table('trained_models')
    op.drop_table('ml_experiments')
