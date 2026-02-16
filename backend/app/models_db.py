from sqlalchemy import Column, String, Text, Integer, Boolean, BigInteger, Index
from sqlalchemy import DateTime
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB
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
