from sqlalchemy import Column, String, Text, Integer, Boolean, BigInteger, Index, ForeignKey, ARRAY, text
from sqlalchemy import DateTime
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from .db import Base


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    role = Column(String, nullable=False, default="viewer")
    plan = Column(String, nullable=False, default="Free")


class Workspace(Base):
    __tablename__ = "workspaces"
    id = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    is_shared = Column(Boolean, nullable=False, default=False)
    share_token = Column(String, nullable=True)
    share_expires_at = Column(DateTime(timezone=True), nullable=True)
    share_scope = Column(String, nullable=True)


class Context(Base):
    __tablename__ = "contexts"
    id = Column(String, primary_key=True)
    workspace_id = Column(String, nullable=False)
    glossary = Column(JSONB, nullable=False, default=dict)
    rules = Column(JSONB, nullable=False, default=list)


class ContextVersion(Base):
    __tablename__ = "context_versions"
    id = Column(String, primary_key=True)
    workspace_id = Column(String, nullable=False)
    glossary = Column(JSONB, nullable=False, default=dict)
    rules = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# DEPRECATED: Old simple dashboard - use VizDashboardDB instead
# Kept for backwards compatibility with existing data
class Dashboard(Base):
    __tablename__ = "dashboards"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    widgets = Column(JSONB, nullable=False, default=list)
    is_shared = Column(Boolean, nullable=False, default=False)
    share_token = Column(String, nullable=True)
    share_expires_at = Column(DateTime(timezone=True), nullable=True)
    share_scope = Column(String, nullable=True)


class DatasetMetaDB(Base):
    __tablename__ = "dataset_meta"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=True)
    workspace_id = Column(String, nullable=False, default="default")
    name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    source_type = Column(String, nullable=True)
    storage_provider = Column(String, nullable=True, default="s3")
    storage_path = Column(Text, nullable=True)
    file_format = Column(String, nullable=True, default="parquet")
    schema_json = Column(JSONB, nullable=True, default=dict)
    stats_json = Column(JSONB, nullable=True, default=dict)
    columns = Column(JSONB, nullable=False, default=list)
    row_count = Column(Integer, nullable=False)
    file_size_bytes = Column(BigInteger, nullable=True)
    compressed_size_bytes = Column(BigInteger, nullable=True)
    status = Column(String, nullable=False, default="processing")
    error_message = Column(Text, nullable=True)
    last_queried_at = Column(DateTime(timezone=True), nullable=True)
    query_count = Column(Integer, nullable=False, default=0)
    access_tier = Column(String, nullable=False, default="hot")
    parent_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_datasets_user_workspace", "user_id", "workspace_id"),
        Index("idx_datasets_status", "status"),
        Index("idx_datasets_access_tier", "access_tier"),
        Index("idx_datasets_last_queried", "last_queried_at"),
    )


class DatasetDataDB(Base):
    __tablename__ = "dataset_data"
    id = Column(String, primary_key=True)
    rows = Column(JSONB, nullable=False, default=list)


class DatasetChunkDB(Base):
    __tablename__ = "dataset_chunks"
    id = Column(String, primary_key=True)
    dataset_id = Column(String, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    rows = Column(JSONB, nullable=False, default=list)


class CalculatedColumnDB(Base):
    __tablename__ = "calculated_columns"

    id = Column(String, primary_key=True)
    dataset_id = Column(String, ForeignKey("dataset_meta.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    formula = Column(Text, nullable=False)
    column_type = Column(String, nullable=False, default="dynamic")
    cached_value = Column(Text, nullable=True)
    display_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_calculated_columns_dataset", "dataset_id"),
        Index("uq_calculated_columns_dataset_name", "dataset_id", "name", unique=True),
    )


class ImportTableDB(Base):
    __tablename__ = "import_tables"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    dataset_id = Column(String, nullable=False)
    workspace_id = Column(String, nullable=False, default="default")
    source_type = Column(String, nullable=False)
    source_name = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ImportConnectionDB(Base):
    __tablename__ = "import_connections"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    workspace_id = Column(String, nullable=False, default="default")
    host = Column(String, nullable=True)
    database = Column(String, nullable=True)
    status = Column(String, nullable=False, default="connected")
    config = Column(JSONB, nullable=False, default=dict)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AuditLogDB(Base):
    __tablename__ = "audit_logs"
    id = Column(String, primary_key=True)
    action = Column(String, nullable=False)
    actor = Column(String, nullable=False)
    target = Column(String, nullable=False)
    metadata_ = Column("metadata", JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AgentFeedbackDB(Base):
    __tablename__ = "agent_feedback"
    id = Column(String, primary_key=True)
    dataset_id = Column(String, nullable=False)
    rating = Column(String, nullable=False)
    source = Column(String, nullable=False, default="suggestion")
    notes = Column(Text, nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FeedbackDB(Base):
    __tablename__ = "feedback"

    id = Column(UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    name = Column(Text, nullable=False)
    email = Column(Text, nullable=False)
    subject = Column(Text, nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ApprovalRequestDB(Base):
    __tablename__ = "approval_requests"
    id = Column(String, primary_key=True)
    requester = Column(String, nullable=False)
    resource_type = Column(String, nullable=False)
    resource_id = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WebhookDB(Base):
    __tablename__ = "webhooks"
    id = Column(String, primary_key=True)
    target_url = Column(Text, nullable=False)
    event = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ScheduledJobDB(Base):
    __tablename__ = "scheduled_jobs"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    cron = Column(String, nullable=False)
    action = Column(String, nullable=False)
    status = Column(String, nullable=False, default="scheduled")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PipelineDB(Base):
    __tablename__ = "pipelines"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    cadence = Column(String, nullable=False)
    time_of_day = Column(String, nullable=True)
    day_of_week = Column(Integer, nullable=True)
    day_of_month = Column(Integer, nullable=True)
    dataset_id = Column(String, nullable=True)
    connector = Column(String, nullable=True)
    connector_config = Column(JSONB, nullable=False, default=dict)
    apply_recipe = Column(Boolean, nullable=False, default=False)
    run_profile = Column(Boolean, nullable=False, default=True)
    run_insights = Column(Boolean, nullable=False, default=True)
    enabled = Column(Boolean, nullable=False, default=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    last_run_metadata = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PipelineRunDB(Base):
    __tablename__ = "pipeline_runs"
    id = Column(String, primary_key=True)
    pipeline_id = Column(String, nullable=False)
    status = Column(String, nullable=False)
    dataset_id = Column(String, nullable=True)
    error = Column(Text, nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=False, default=dict)
    started_at = Column(DateTime(timezone=True), nullable=False)
    finished_at = Column(DateTime(timezone=True), nullable=True)


class QueryCacheDB(Base):
    __tablename__ = "query_cache"
    id = Column(String, primary_key=True)
    dataset_id = Column(String, nullable=False)
    user_id = Column(String, nullable=True)
    query_hash = Column(String, nullable=False, unique=True)
    query_sql = Column(Text, nullable=False)
    result_json = Column(JSONB, nullable=True)
    result_row_count = Column(Integer, nullable=False, default=0)
    execution_time_ms = Column(Integer, nullable=True)
    cache_hits = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_accessed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_query_cache_hash", "query_hash"),
        Index("idx_query_cache_expires", "expires_at"),
    )


class TransformationHistoryDB(Base):
    __tablename__ = "transformation_history"
    id = Column(String, primary_key=True)
    dataset_id = Column(String, nullable=False)
    user_id = Column(String, nullable=True)
    operation = Column(String, nullable=False)
    sql = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    affected_rows = Column(String, nullable=True)
    execution_time_ms = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="completed")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_transformation_history_dataset", "dataset_id"),
        Index("idx_transformation_history_user", "user_id"),
    )


# Visualization models (using viz_ prefix to avoid conflicts)
class VizDashboardThemeDB(Base):
    __tablename__ = "viz_dashboard_themes"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    user_id = Column(String, nullable=False)
    workspace_id = Column(String, nullable=True)
    is_global = Column(Boolean, default=False)
    colors = Column(JSONB, nullable=False)
    fonts = Column(JSONB, nullable=True)
    logo_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class VizDashboardDB(Base):
    __tablename__ = "viz_dashboards"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    user_id = Column(String, nullable=False)
    workspace_id = Column(String, nullable=False)
    dataset_id = Column(Integer, nullable=True)
    theme_id = Column(Integer, nullable=True)
    layout = Column(JSONB, nullable=True)
    refresh_interval = Column(Integer, nullable=True)
    is_public = Column(Boolean, default=False)
    share_token = Column(String, nullable=True, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class VizDashboardWidgetDB(Base):
    __tablename__ = "viz_dashboard_widgets"
    id = Column(Integer, primary_key=True)
    dashboard_id = Column(Integer, nullable=False)
    widget_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    dataset_id = Column(Integer, nullable=True)
    config = Column(JSONB, nullable=False)
    position = Column(JSONB, nullable=False)
    filters = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class VizDashboardFilterDB(Base):
    __tablename__ = "viz_dashboard_filters"
    id = Column(Integer, primary_key=True)
    dashboard_id = Column(Integer, nullable=False)
    filter_type = Column(String, nullable=False)
    column_name = Column(String, nullable=False)
    config = Column(JSONB, nullable=False)
    applies_to_widgets = Column(ARRAY(Integer), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class DashboardV2DB(Base):
    __tablename__ = "dashboards_v2"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    workspace_id = Column(String, nullable=False, default="default")
    dataset_id = Column(String, nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    layout = Column(JSONB, nullable=False, default=dict)
    # Viz extension columns
    theme = Column(JSONB, nullable=True, default=dict)
    is_published = Column(Boolean, nullable=False, default=False)
    share_token = Column(Text, nullable=True, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_dashboards_v2_workspace", "workspace_id"),
        Index("idx_dashboards_v2_user", "user_id"),
    )


class DashboardTileDB(Base):
    __tablename__ = "dashboard_tiles"

    id = Column(String, primary_key=True)
    dashboard_id = Column(String, ForeignKey("dashboards_v2.id", ondelete="CASCADE"), nullable=False)
    dataset_id = Column(String, nullable=True)
    title = Column(String, nullable=False)
    chart_type = Column(String, nullable=False)
    query_spec = Column(JSONB, nullable=False, default=dict)
    layout = Column(JSONB, nullable=False, default=dict)
    # Snapshot binding — set by pipeline_runner after a successful pipeline run
    snapshot_id = Column(String, ForeignKey("table_snapshots.id", ondelete="SET NULL"), nullable=True)
    refresh_config = Column(JSONB, nullable=False, default=dict)
    # Viz extension columns
    tile_type = Column(Text, nullable=False, default="chart")  # chart | table | text | metric
    echarts_config = Column(JSONB, nullable=True)               # complete ECharts option object
    table_data = Column(JSONB, nullable=True)                   # static snapshot for table tiles
    metric_value = Column(Text, nullable=True)
    metric_label = Column(Text, nullable=True)
    metric_trend = Column(Text, nullable=True)                  # up | down | neutral
    metric_threshold = Column(JSONB, nullable=True)             # {value, color}
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_dashboard_tiles_dashboard", "dashboard_id"),
        Index("idx_dashboard_tiles_snapshot", "snapshot_id"),
    )


class DashboardAccessDB(Base):
    """Per-grant access control rows for dashboard_access table."""
    __tablename__ = "dashboard_access"

    id = Column(String, primary_key=True)
    dashboard_id = Column(String, ForeignKey("dashboards_v2.id", ondelete="CASCADE"), nullable=False)
    granted_to_user_id = Column(String, nullable=True)   # internal DataHub user
    granted_to_email = Column(String, nullable=True)     # external client viewer
    access_level = Column(String, nullable=False, default="view")  # view | comment | edit
    granted_by = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    token = Column(String, nullable=True, unique=True)   # per-grant link token
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_dashboard_access_dashboard", "dashboard_id"),
        Index("idx_dashboard_access_user", "granted_to_user_id"),
    )


class DashboardViewDB(Base):
    """Access audit log for dashboard views."""
    __tablename__ = "dashboard_views"

    id = Column(String, primary_key=True)
    dashboard_id = Column(String, ForeignKey("dashboards_v2.id", ondelete="CASCADE"), nullable=False)
    viewed_by_user_id = Column(String, nullable=True)
    viewed_by_email = Column(String, nullable=True)
    viewed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ip_address = Column(String, nullable=True)

    __table_args__ = (
        Index("idx_dashboard_views_dashboard", "dashboard_id"),
        Index("idx_dashboard_views_user", "viewed_by_user_id"),
    )


class DashboardPublishDB(Base):
    __tablename__ = "dashboard_publishes"

    id = Column(String, primary_key=True)
    dashboard_id = Column(String, ForeignKey("dashboards_v2.id", ondelete="CASCADE"), nullable=False)
    publish_token = Column(String, nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, default=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_dashboard_publishes_dashboard", "dashboard_id"),
    )


# ==================== LIVE DATA PLATFORM MODELS ====================


class DataSourceDB(Base):
    """Registered data sources used as inputs to pipelines (manual upload, S3, Sheets, SFTP, URL)."""
    __tablename__ = "data_sources"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    source_type = Column(String(50), nullable=False)   # manual_upload | s3_folder | google_sheets | sftp | url
    config = Column(JSONB, nullable=False, default=dict)  # connection details (encrypted at rest in Supabase)
    last_tested_at = Column(DateTime(timezone=True), nullable=True)
    last_pulled_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_data_sources_user", "user_id"),
    )


class PipelineScheduleDB(Base):
    """Schedule configuration for a pipeline_v2 — drives Render Cron Job refresh."""
    __tablename__ = "pipeline_schedules"

    id = Column(String, primary_key=True)
    pipeline_id = Column(String, ForeignKey("pipelines_v2.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, nullable=False)
    cron_expression = Column(String, nullable=False, default="0 9 * * 1")
    timezone = Column(String, nullable=False, default="Asia/Kolkata")
    is_active = Column(Boolean, nullable=False, default=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    auto_refresh_on_upload = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_pipeline_schedules_pipeline", "pipeline_id"),
        Index("idx_pipeline_schedules_next_run", "next_run_at"),
    )


class TableSnapshotDB(Base):
    """A Parquet snapshot produced by a pipeline run — referenced by dashboard tiles."""
    __tablename__ = "table_snapshots"

    id = Column(String, primary_key=True)
    pipeline_run_id = Column(String, ForeignKey("pipeline_runs_v2.id", ondelete="CASCADE"), nullable=False)
    table_name = Column(String, nullable=False)   # logical name e.g. reconciliation_final
    snapshot_url = Column(Text, nullable=False)    # S3 storage_path
    row_count = Column(Integer, nullable=True)
    schema = Column(JSONB, nullable=False, default=dict)  # {column_name: dtype, ...}
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_table_snapshots_run", "pipeline_run_id"),
        Index("idx_table_snapshots_table_name", "table_name"),
    )


# ==================== CHAT & PIPELINE MODELS ====================

class ChatSessionDB(Base):
    """Stores chat conversation sessions with full message history and reproducibility context"""
    __tablename__ = "chat_sessions"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    workspace_id = Column(String, nullable=False)
    dataset_id = Column(String, nullable=False)
    
    title = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default='active')
    
    messages = Column(JSONB, nullable=False, server_default='[]')
    pipeline_id = Column(String, nullable=True)
    
    execution_context = Column(JSONB, nullable=False, server_default='{}')
    parameters = Column(JSONB, nullable=False, server_default='{}')
    artifacts = Column(JSONB, nullable=False, server_default='{}')
    
    shared_with = Column(JSONB, nullable=False, server_default='[]')
    tags = Column(ARRAY(String(255)), server_default='{}')
    pinned = Column(Boolean, nullable=False, default=False)
    is_template = Column(Boolean, nullable=False, default=False)
    
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    __table_args__ = (
        Index("idx_chat_sessions_user", "user_id"),
        Index("idx_chat_sessions_workspace", "workspace_id"),
        Index("idx_chat_sessions_dataset", "dataset_id"),
        Index("idx_chat_sessions_status", "status"),
        Index("idx_chat_sessions_created", "created_at"),
    )


class PipelineV2DB(Base):
    """Reproducible pipelines - reusable sequences of transformation steps"""
    __tablename__ = "pipelines_v2"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    workspace_id = Column(String, nullable=False)
    
    name = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    type = Column(String(50), nullable=False, default='manual')
    status = Column(String(50), nullable=False, default='draft')
    
    steps = Column(JSONB, nullable=False)
    execution_config = Column(JSONB, nullable=False, server_default='{}')
    
    version = Column(Integer, nullable=False, default=1)
    parent_pipeline_id = Column(String, nullable=True)
    checksum = Column(String(64), nullable=True)
    
    tags = Column(ARRAY(String(255)), nullable=True)
    is_public = Column(Boolean, nullable=False, default=False)
    
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    
    __table_args__ = (
        Index("idx_pipelines_v2_user", "user_id"),
        Index("idx_pipelines_v2_workspace", "workspace_id"),
        Index("idx_pipelines_v2_status", "status"),
    )


class PipelineRunV2DB(Base):
    """Execution records for pipelines - tracks each run and results"""
    __tablename__ = "pipeline_runs_v2"
    
    id = Column(String, primary_key=True)
    pipeline_id = Column(String, nullable=False)
    user_id = Column(String, nullable=False)
    session_id = Column(String, nullable=True)
    
    status = Column(String(50), nullable=False, default='pending')
    step_results = Column(JSONB, nullable=False, server_default='{}')
    
    input_dataset_id = Column(String, nullable=True)
    output_dataset_id = Column(String, nullable=True)
    output_snapshot_url = Column(Text, nullable=True)  # primary S3 snapshot from this run
    
    metrics = Column(JSONB, nullable=False, server_default='{}')
    execution_log = Column(JSONB, nullable=False, server_default='[]')
    
    triggered_by = Column(String(50), nullable=False, default='manual')
    error_message = Column(Text, nullable=True)
    
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    
    __table_args__ = (
        Index("idx_pipeline_runs_v2_pipeline", "pipeline_id"),
        Index("idx_pipeline_runs_v2_session", "session_id"),
        Index("idx_pipeline_runs_v2_status", "status"),
    )


class TransformationStepDB(Base):
    """Individual transformation steps within a session - for visualization in UI"""
    __tablename__ = "transformation_steps"
    
    id = Column(String, primary_key=True)
    chat_session_id = Column(String, nullable=False)
    pipeline_run_id = Column(String, nullable=True)
    
    step_number = Column(Integer, nullable=False)
    action_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    parameters = Column(JSONB, nullable=True)
    sql_generated = Column(Text, nullable=True)
    
    input_rows = Column(Integer, nullable=True)
    output_rows = Column(Integer, nullable=True)
    execution_time_ms = Column(Integer, nullable=True)
    
    status = Column(String(50), nullable=False, default='completed')
    error_details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    
    __table_args__ = (
        Index("idx_transformation_steps_session", "chat_session_id"),
        Index("idx_transformation_steps_run", "pipeline_run_id"),
    )


class ChatTemplateDB(Base):
    """Reusable chat templates for common workflows"""
    __tablename__ = "chat_templates"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    workspace_id = Column(String, nullable=False)
    
    name = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    
    initial_prompt = Column(Text, nullable=True)
    execution_flow = Column(JSONB, nullable=True)
    
    is_public = Column(Boolean, nullable=False, default=False)
    usage_count = Column(Integer, nullable=False, default=0)
    
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    
    __table_args__ = (
        Index("idx_chat_templates_workspace", "workspace_id"),
        Index("idx_chat_templates_category", "category"),
    )


class ChatSessionSnapshotDB(Base):
    """Point-in-time snapshots of session state for rollback/checkpoint functionality"""
    __tablename__ = "chat_session_snapshots"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, nullable=False)
    
    version = Column(Integer, nullable=False)
    snapshot_type = Column(String(50), nullable=True)
    messages_count = Column(Integer, nullable=True)
    dataset_state = Column(JSONB, nullable=True)
    
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

