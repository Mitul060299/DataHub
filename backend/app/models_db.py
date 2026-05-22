import uuid
from sqlalchemy import Column, String, Text, Integer, Boolean, BigInteger, Index, ForeignKey, ARRAY, text
from sqlalchemy import DateTime, JSON
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from .db import Base


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    role = Column(String, nullable=False, default="viewer")
    plan = Column(String, nullable=False, default="Free")
    has_completed_onboarding = Column(Boolean, nullable=False, default=False)
    has_uploaded_first_file = Column(Boolean, nullable=False, default=False)
    notification_prefs = Column(JSONB, nullable=True, default=dict)
    # 0064 — 15-day opt-in trial state
    trial_plan = Column(String, nullable=True)
    trial_started_at = Column(DateTime(timezone=True), nullable=True)
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)
    trial_used = Column(Boolean, nullable=False, default=False)
    payment_method_on_file = Column(Boolean, nullable=False, default=False)
    # Billing columns — added to DB by migration 0025; also accessed via Supabase client in billing_repository
    razorpay_customer_id = Column(String, nullable=True)
    # subscription_id is a UUID FK to subscriptions.id (see migration 0025)
    subscription_id = Column(UUID(as_uuid=False), nullable=True)
    # NOTE: Activation milestone columns (first_dataset_at, first_ai_answer_at,
    # first_pipeline_step_at, first_export_at) are managed by migration 0070
    # but intentionally NOT mapped on this model. Reason: if the migration
    # hasn't applied yet, SQLAlchemy would include them in INSERT statements
    # (deferred() only suppresses SELECTs), causing every signup to 500 with
    # UndefinedColumn. Read/write these columns via raw SQL in
    # activation_service / users router with try/except guards.


class UserUsageDB(Base):
    """Monthly per-user usage counters, keyed by (user_id, period='YYYY-MM')."""
    __tablename__ = "user_usage"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    period = Column(String, nullable=False)  # YYYY-MM
    api_calls = Column(Integer, nullable=False, default=0)
    pipeline_runs = Column(Integer, nullable=False, default=0)
    datasets_uploaded = Column(Integer, nullable=False, default=0)
    storage_bytes_used = Column(BigInteger, nullable=False, default=0)
    # Added by migration 0043 — tracks cumulative DuckDB bytes read this month
    data_scanned_bytes = Column(BigInteger, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_user_usage_user_period", "user_id", "period", unique=True),
    )


class ProjectDB(Base):
    """User-scoped project that groups pipelines, dashboards and data sources."""
    __tablename__ = "projects"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    colour = Column(String, nullable=False, default="#5B6AF0")
    icon = Column(String, nullable=False, default="📁")
    is_quickstart = Column(Boolean, nullable=False, server_default="false", default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_projects_user_id", "user_id"),
    )


class ProjectMemberDB(Base):
    """Per-project membership rows (active + pending invites).

    Replaces ``WorkspaceMemberDB`` as the source of truth for collaboration
    once the workspace abstraction is removed. The project owner is implicit
    via ``projects.user_id`` and is *not* inserted into this table.
    """
    __tablename__ = "project_members"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, nullable=True)         # null until invite is accepted
    email = Column(String, nullable=False)
    role = Column(String, nullable=False, default="editor")  # owner|editor|viewer
    status = Column(String, nullable=False, default="pending")  # pending|active
    invite_token = Column(String, unique=True, nullable=True)
    invited_by = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_pm_project_id", "project_id"),
        Index("idx_pm_user_id", "user_id"),
        Index("idx_pm_invite_token", "invite_token", unique=True),
        Index("idx_pm_project_email", "project_id", "email", unique=True),
    )


class OrganizationDB(Base):
    """Org account: one paying user (owner) + N invited members.

    Created lazily on first need (when the user opens Settings → Team or
    accepts an invite). The owner is identified by ``owner_user_id`` and is
    *not* stored as a row in ``organization_members``.
    """
    __tablename__ = "organizations"

    id = Column(String, primary_key=True)
    owner_user_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_organizations_owner_user_id", "owner_user_id"),
    )


class OrganizationMemberDB(Base):
    """Org member rows (active + pending invites). All members are equal at
    the project layer; only the owner manages billing & invites."""
    __tablename__ = "organization_members"

    id = Column(String, primary_key=True)
    org_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, nullable=True)         # null until invite accepted
    email = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending|active
    invite_token = Column(String, unique=True, nullable=True)
    invited_by = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_om_org_id", "org_id"),
        Index("idx_om_user_id", "user_id"),
        Index("idx_om_invite_token", "invite_token", unique=True),
        Index("idx_om_org_email", "org_id", "email", unique=True),
    )


# Workspace and WorkspaceMemberDB classes removed — tables dropped by migration 0067.
# Members are now tracked in project_members + organization_members.


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


class DatasetMetaDB(Base):
    __tablename__ = "dataset_meta"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=True)
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
    # Project scoping — added by migration 0057. Nullable so legacy datasets
    # uploaded before projects existed stay visible at the workspace level
    # (filter treats NULL as "no project" / visible from "All" view).
    project_id = Column(
        String,
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    version_number = Column(Integer, nullable=False, default=1)
    version_note = Column(Text, nullable=True)
    uploaded_by = Column(String, nullable=True)
    # Query-folding / write-back / live federation
    connector_credential_id = Column(String, nullable=True)  # FK to connector_credentials.id
    import_mode = Column(String, nullable=False, server_default="cached")  # 'cached' | 'live'
    connector_config = Column(JSONB, nullable=True)  # stores original import config for fold/live
    # pipeline_steps_json is NOT in the ORM — accessed via raw SQL in datasets.py
    # to avoid crashing every SELECT while migration 0050 is pending on prod.
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    # Soft-delete (Trash with retention): NULL = active, NOT NULL = in trash since this timestamp.
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    # Cross-pipeline fork lineage: ID of the pipeline_steps row this dataset was
    # created from.  NULL = not a fork.  Set by the fork-to-dataset endpoint.
    forked_from_step_id = Column(String, nullable=True)

    __table_args__ = (
        Index("idx_datasets_user", "user_id"),
        Index("idx_datasets_status", "status"),
        Index("idx_datasets_access_tier", "access_tier"),
        Index("idx_datasets_last_queried", "last_queried_at"),
    )


class DatasetDataDB(Base):
    __tablename__ = "dataset_data"
    id = Column(String, primary_key=True)
    rows = Column(JSONB, nullable=False, default=list)


class DatasetSessionDB(Base):
    """Server-side binding between a dataset and its AI chat session.

    Holds only the durable link (``chat_session_id``) needed by the agent
    to find prior pipeline steps for this dataset.  Live preview state
    (table name, row count, etc.) is no longer tracked server-side --
    the frontend derives it from the latest ``pipeline_steps`` row.
    """
    __tablename__ = "dataset_sessions"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    dataset_id = Column(String, nullable=False, index=True)
    chat_session_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    __table_args__ = (
        Index("ux_dataset_sessions_user_dataset", "user_id", "dataset_id", unique=True),
    )


class DatasetLineageEdgeDB(Base):
    """One row per (child_id, parent_id) lineage relationship.

    Replaces the legacy ``dataset_meta.parent_id`` column as the source of
    truth for lineage. ``parent_id`` is still set on writes as a deprecated
    mirror so any reader I haven't migrated yet keeps working, but every
    read site that walks lineage should query this table instead.

    A child can have multiple parents (joins, unions). A parent can have
    multiple children (forks, branches). The ``(child_id, parent_id)``
    pair is unique to keep edge insertion idempotent.

    ``transform_id`` is reserved for a future link to the pipeline step /
    run that produced the edge; for now it is ``NULL`` for backfilled rows
    and ``NULL`` for new rows until the producer is wired up.
    """
    __tablename__ = "dataset_lineage_edges"
    id = Column(String, primary_key=True)
    child_id = Column(String, nullable=False, index=True)
    parent_id = Column(String, nullable=False, index=True)
    transform_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        Index("ux_dataset_lineage_edges_child_parent", "child_id", "parent_id", unique=True),
    )


class ConnectorCredentialDB(Base):
    """Encrypted connector credentials for query folding, write-back, and live federation."""
    __tablename__ = "connector_credentials"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    connector_type = Column(String, nullable=False)  # e.g. 'postgresql', 'mysql'
    label = Column(String, nullable=True)            # human-readable name
    encrypted_config = Column(Text, nullable=False)  # Fernet-encrypted JSON
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_connector_credentials_user", "user_id"),
    )


class DatasetChunkDB(Base):
    __tablename__ = "dataset_chunks"
    id = Column(String, primary_key=True)
    dataset_id = Column(String, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    rows = Column(JSONB, nullable=False, default=list)

    __table_args__ = (
        Index("idx_dataset_chunks_dataset_id", "dataset_id"),
    )


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
    user_id = Column(String, nullable=True)
    source_type = Column(String, nullable=False)
    source_name = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ImportConnectionDB(Base):
    __tablename__ = "import_connections"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    user_id = Column(String, nullable=True)
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

    __table_args__ = (
        Index("idx_audit_logs_actor", "actor"),
        Index("idx_audit_logs_created_at", "created_at"),
    )


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


class SupportChatSessionDB(Base):
    __tablename__ = "support_chat_sessions"

    id = Column(UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    visitor_id = Column(Text, nullable=False, index=True)
    email = Column(Text, nullable=True)
    first_page = Column(Text, nullable=False, default="/")
    message_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_active = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SupportChatMessageDB(Base):
    __tablename__ = "support_chat_messages"

    id = Column(UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    session_id = Column(UUID(as_uuid=False), ForeignKey("support_chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(Text, nullable=False)          # "user" | "assistant"
    content = Column(Text, nullable=False)
    intent = Column(Text, nullable=True)         # classified intent label
    is_capability_request = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ReviewDB(Base):
    __tablename__ = "reviews"

    id = Column(String, primary_key=True, server_default=text("gen_random_uuid()::text"))
    name = Column(Text, nullable=False)
    role = Column(Text, nullable=True)
    rating = Column(Integer, nullable=False)
    body = Column(Text, nullable=False)
    approved = Column(Boolean, nullable=False, server_default=text("false"))
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
    user_id = Column(String, nullable=True, index=True)
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
    user_id = Column(String, nullable=True)
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
    dataset_id = Column(Integer, nullable=True)
    theme_id = Column(Integer, nullable=True)
    layout = Column(JSONB, nullable=True)
    refresh_interval = Column(Integer, nullable=True)
    is_public = Column(Boolean, default=False)
    share_token = Column(String, nullable=True, unique=True)
    share_expires_at = Column(DateTime(timezone=True), nullable=True)
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
    dataset_id = Column(String, nullable=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    layout = Column(JSONB, nullable=False, default=dict)
    # Viz extension columns
    theme = Column(JSONB, nullable=True, default=dict)
    is_published = Column(Boolean, nullable=False, default=False)
    share_token = Column(Text, nullable=True, unique=True)
    share_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
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
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
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
    # Write-back destination: populated when the user wants the pipeline's
    # output automatically pushed to a connector after each run.
    # Shape: {"connector_type": str, "credential_id": str|null,
    #         "connector_config": dict|null, "table_name": str, "mode": str}
    write_back_config = Column(JSONB, nullable=True)
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
        Index("idx_chat_sessions_dataset", "dataset_id"),
        Index("idx_chat_sessions_status", "status"),
        Index("idx_chat_sessions_created", "created_at"),
    )


class PipelineV2DB(Base):
    """Reproducible pipelines - reusable sequences of transformation steps"""
    __tablename__ = "pipelines_v2"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)

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


class ArtifactDB(Base):
    """S3-persisted Parquet snapshots produced by pipeline write-ops."""
    __tablename__ = "artifacts"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    session_id = Column(String, nullable=True)
    pipeline_run_id = Column(String, ForeignKey("pipeline_runs_v2.id", ondelete="SET NULL"), nullable=True)
    # step_id is nullable TEXT (FK populated after PipelineStepDB insert)
    step_id = Column(String, nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    s3_key = Column(Text, nullable=False)
    row_count = Column(Integer, nullable=True)
    column_schema = Column(JSONB, nullable=True, default=list)
    type = Column(String, nullable=False, default="auto")   # 'auto' | 'export'
    format = Column(String, nullable=True, default="parquet")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_artifacts_user_id", "user_id"),
        Index("idx_artifacts_session_id", "session_id"),
        Index("idx_artifacts_pipeline_run_id", "pipeline_run_id"),
    )


class PipelineStepDB(Base):
    """Per-step record for every pipeline write-op; links to ArtifactDB."""
    __tablename__ = "pipeline_steps"

    id = Column(String, primary_key=True)
    pipeline_run_id = Column(String, ForeignKey("pipeline_runs_v2.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(String, nullable=False)
    session_id = Column(String, nullable=True)
    step_number = Column(Integer, nullable=False)
    intent = Column(String, nullable=True)
    operation = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    input_tables = Column(JSONB, nullable=False, default=list)
    input_table = Column(String, nullable=True)   # legacy column — stop writing new values
    output_table = Column(String, nullable=True)
    duckdb_sql = Column(Text, nullable=True)
    parameters = Column(JSONB, nullable=True)
    status = Column(String, nullable=False, default="completed")
    error_message = Column(Text, nullable=True)
    execution_time_ms = Column(Integer, nullable=True)
    row_count_before = Column(Integer, nullable=True)
    row_count_after = Column(Integer, nullable=True)
    artifact_id = Column(String, ForeignKey("artifacts.id", ondelete="SET NULL"), nullable=True)
    # Object-storage path of a Parquet snapshot of this step's output.
    # Populated by ``StepEngine.snapshot_to_parquet`` immediately after a
    # successful step. ``_replay_session_views`` prefers this over re-executing
    # ``duckdb_sql`` because it is deterministic and O(1) per step.
    snapshot_path = Column(Text, nullable=True)
    # Phase 2 forking: ID of the pipeline_steps row this step branched off.
    # null = linear trunk step.  Enables the frontend to render sibling branches
    # in the DAG view and group steps by branch in the linear list.
    parent_step_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_pipeline_steps_run_id", "pipeline_run_id"),
        Index("idx_pipeline_steps_user_id", "user_id"),
        Index("idx_pipeline_steps_session_id", "session_id"),
    )


class CrossPipelineInputDB(Base):
    """Links a consumer dataset to a specific pipeline-step snapshot from any
    dataset owned by the same user.  At session start the agent loads each
    linked snapshot as a named DuckDB VIEW (``alias``) so the LLM can JOIN /
    reconcile across datasets without the user manually wiring anything."""

    __tablename__ = "cross_pipeline_inputs"

    id = Column(String, primary_key=True)
    consumer_dataset_id = Column(
        String,
        ForeignKey("dataset_meta.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_step_id = Column(
        String,
        ForeignKey("pipeline_steps.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Denormalised for cheap lookups — avoids joining pipeline_steps.
    source_dataset_id = Column(String, nullable=False)
    # DuckDB alias the agent uses to reference this table in SQL, e.g.
    # ``trial_balance_q1``.
    alias = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_cross_pipeline_consumer", "consumer_dataset_id"),
        Index("idx_cross_pipeline_source_step", "source_step_id"),
    )


class PendingStorageDeleteDB(Base):
    """Queue of object-storage paths whose immediate delete failed.

    When a dataset / artifact row is deleted from Postgres but the matching
    S3 / R2 / Azure object delete fails (network blip, transient permission
    issue, etc.), we enqueue the storage_path here so a background drainer
    can retry it without the row staying half-deleted.  This prevents
    orphaned objects from silently inflating storage cost.
    """
    __tablename__ = "pending_storage_deletes"

    id = Column(String, primary_key=True)
    storage_path = Column(Text, nullable=False)
    source = Column(String(64), nullable=False, default="dataset")  # 'dataset' | 'artifact' | 'child'
    attempts = Column(Integer, nullable=False, default=0)
    last_error = Column(Text, nullable=True)
    next_attempt_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_attempt_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_pending_storage_deletes_next_attempt", "next_attempt_at"),
    )


class PipelineEventDB(Base):
    """Append-only event log for pipeline + persistence lifecycle.

    Every materialization (dataset / artifact) and every deletion writes a row
    here.  The table is INSERT-only \u2014 we never update or delete rows so the log
    can answer "who created this artifact?" / "when was this dataset deleted?"
    questions in production.

    Event types emitted today:
      * dataset_materialized   payload={triggered_by, dataset_id, name, parent_id}
      * artifact_materialized  payload={triggered_by, artifact_id, name}
      * dataset_deleted        payload={dataset_id, name, child_count, storage_paths}
      * artifact_deleted       payload={artifact_id, name, s3_key}

    Future producers (pipeline run lifecycle, scheduler jobs, etc.) can add
    new event_type strings without a schema change.
    """
    __tablename__ = "pipeline_events"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=True, index=True)
    session_id = Column(String, nullable=True, index=True)
    run_id = Column(String, nullable=True)
    step_id = Column(String, nullable=True)
    event_type = Column(String(64), nullable=False, index=True)
    payload = Column(
        JSONB().with_variant(JSON, "sqlite"),
        nullable=False,
        default=dict,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    __table_args__ = (
        Index("idx_pipeline_events_user_created", "user_id", "created_at"),
        Index("idx_pipeline_events_session_created", "session_id", "created_at"),
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


class DashboardCommentDB(Base):
    """User comments on a dashboard (threaded or flat)."""
    __tablename__ = "dashboard_comments"

    id = Column(String, primary_key=True)
    dashboard_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False)
    author_name = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class VisualizationDB(Base):
    """User-saved chart configurations from the AI agent visualization flow."""
    __tablename__ = "visualizations"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    name = Column(String, nullable=False)
    chart_type = Column(String, nullable=False, default="bar")
    echarts_config = Column(JSONB, nullable=False, default=dict)   # full ECharts option object
    thumbnail_s3_key = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_visualizations_user", "user_id"),
    )


class WaitlistEntryDB(Base):
    __tablename__ = "waitlist_entries"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, nullable=False, unique=True)
    plan = Column(String, nullable=False)
    region = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UsageLogDB(Base):
    """Per-call AI token log for fair-usage instrumentation.

    Populated by token_tracking_service.log_call() after every Groq API call.
    The cost_score formula is:  input_tokens + (output_tokens * 2) + (dataset_rows / 1000 * 10).
    This table is append-only; rows are never updated or deleted.
    """
    __tablename__ = "usage_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=False, default="", index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    model_used = Column(String, nullable=False, default="")
    # One of: classify / plan / execute / fix / insights / chat / suggest
    query_type = Column(String, nullable=False, default="unknown")
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    cost_score = Column(Integer, nullable=False, default=0)
    dataset_rows = Column(BigInteger, nullable=False, default=0)

    __table_args__ = (
        Index("idx_usage_logs_user_ts", "user_id", "timestamp"),
    )


class EmailLogDB(Base):
    """Tracks every transactional / lifecycle email sent to a user.

    Used for idempotency (prevents duplicate sends) and open/click tracking
    via the Resend webhook (POST /api/webhooks/resend).
    Append-only; rows are never deleted.
    """
    __tablename__ = "email_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    email = Column(String, nullable=False)
    template = Column(String, nullable=False)       # e.g. "welcome", "day1_stalled_upload"
    sent_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    opened_at = Column(DateTime(timezone=True), nullable=True)
    clicked_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_email_log_user_template", "user_id", "template"),
    )


class EmailPreferencesDB(Base):
    """Per-user email opt-out preferences.  One row per user, upserted on signup.

    When ``lifecycle_emails`` is False the activation-nudge cron skips
    the user entirely.  The unsubscribe token is a random 32-byte hex
    string embedded in the unsubscribe link of every email.
    """
    __tablename__ = "email_preferences"

    user_id = Column(String, primary_key=True)
    email = Column(String, nullable=False)
    lifecycle_emails = Column(Boolean, nullable=False, default=True)
    weekly_digest = Column(Boolean, nullable=False, default=True)
    unsubscribe_token = Column(String, nullable=False, default="")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)