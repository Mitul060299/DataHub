from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Literal


class DatasetPreview(BaseModel):
    dataset_id: str
    name: Optional[str] = None
    file_format: Optional[str] = None
    columns: List[str]
    row_count: int
    sample_rows: List[Dict[str, Any]]
    parent_id: Optional[str] = None


class DatasetMeta(BaseModel):
    dataset_id: str
    name: Optional[str] = None
    file_format: Optional[str] = None
    columns: List[str]
    row_count: int
    parent_id: Optional[str] = None


class DatasetLineageNode(BaseModel):
    dataset_id: str
    name: Optional[str] = None
    file_format: Optional[str] = None
    source_type: Optional[str] = None
    row_count: int
    created_at: Optional[str] = None


class DatasetLineageEdge(BaseModel):
    from_dataset_id: str
    to_dataset_id: str
    relationship: str


class DatasetLineageGraph(BaseModel):
    nodes: List[DatasetLineageNode] = Field(default_factory=list)
    edges: List[DatasetLineageEdge] = Field(default_factory=list)


class DatasetPage(BaseModel):
    dataset_id: str
    columns: List[str]
    offset: int
    limit: int
    rows: List[Dict[str, Any]]
    total_rows: int


class DatasetQueryRequest(BaseModel):
    query: str


class DatasetQueryResponse(BaseModel):
    results: List[Dict[str, Any]]
    row_count: int
    cached: bool


class DatasetRenameRequest(BaseModel):
    name: str


class CrossDatasetQueryRequest(BaseModel):
    """Run a DuckDB SQL query that spans multiple datasets.

    ``dataset_ids`` is a mapping of SQL alias -> dataset_id.
    The SQL query must reference tables by the aliases provided here.

    Example::

        {
            "dataset_ids": {"orders": "<uuid>", "customers": "<uuid>"},
            "query": "SELECT c.name, SUM(o.amount) FROM orders o JOIN customers c ON o.customer_id = c.id GROUP BY 1"
        }
    """
    dataset_ids: Dict[str, str]
    query: str


class CrossDatasetQueryResponse(BaseModel):
    results: List[Dict[str, Any]]
    row_count: int
    aliases: List[str]


class JoinableDataset(BaseModel):
    dataset_id: str
    name: Optional[str]
    shared_columns: List[str]
    total_columns: int
    row_count: int


class JoinableResponse(BaseModel):
    dataset_id: str
    joinable: List[JoinableDataset]


class CalculatedColumnCreate(BaseModel):
    name: str
    formula: str
    column_type: str = "dynamic"
    display_name: str | None = None


class CalculatedColumnDB(BaseModel):
    id: str
    dataset_id: str
    name: str
    formula: str
    column_type: str
    cached_value: str | None
    display_name: str | None
    created_at: str


class DashboardTileCreate(BaseModel):
    dataset_id: str | None = None
    title: str
    chart_type: str = "bar"
    query_spec: dict[str, Any] = Field(default_factory=dict)
    layout: dict[str, Any] = Field(default_factory=dict)
    # Viz engine fields
    tile_type: str = "chart"           # chart | table | text | metric
    echarts_config: dict[str, Any] | None = None
    table_data: dict[str, Any] | None = None
    metric_value: str | None = None
    metric_label: str | None = None
    metric_trend: str | None = None    # up | down | neutral
    metric_threshold: dict[str, Any] | None = None
    source_table: str | None = None    # session table logical name
    saveable: bool = True


class DashboardTileOut(BaseModel):
    id: str
    dashboard_id: str
    dataset_id: str | None = None
    title: str
    chart_type: str
    query_spec: dict[str, Any] = Field(default_factory=dict)
    layout: dict[str, Any] = Field(default_factory=dict)
    # Viz engine fields
    tile_type: str = "chart"
    echarts_config: dict[str, Any] | None = None
    table_data: dict[str, Any] | None = None
    metric_value: str | None = None
    metric_label: str | None = None
    metric_trend: str | None = None
    metric_threshold: dict[str, Any] | None = None
    snapshot_id: str | None = None
    created_at: str


class DashboardV2Create(BaseModel):
    workspace_id: str = "default"
    dataset_id: str | None = None
    name: str
    description: str | None = None
    layout: dict[str, Any] = Field(default_factory=dict)
    theme: dict[str, Any] = Field(default_factory=dict)


class DashboardV2Update(BaseModel):
    name: str | None = None
    description: str | None = None
    layout: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    is_published: bool | None = None


class DashboardV2Out(BaseModel):
    id: str
    workspace_id: str
    dataset_id: str | None = None
    name: str
    description: str | None = None
    layout: dict[str, Any] = Field(default_factory=dict)
    theme: dict[str, Any] = Field(default_factory=dict)
    is_published: bool = False
    share_token: str | None = None
    tiles: list[DashboardTileOut] = Field(default_factory=list)
    created_at: str
    updated_at: str | None = None


class DashboardTheme(BaseModel):
    primary_color: str = "#5B6AF0"
    background: str = "transparent"
    logo_url: str | None = None
    font: str = "Inter"
    show_branding: bool = True


class DashboardAccessCreate(BaseModel):
    granted_to_user_id: str | None = None
    granted_to_email: str | None = None
    access_level: str = "view"         # view | comment | edit
    expires_at: str | None = None      # ISO timestamp


class DashboardAccessOut(BaseModel):
    id: str
    dashboard_id: str
    granted_to_user_id: str | None = None
    granted_to_email: str | None = None
    access_level: str
    granted_by: str
    expires_at: str | None = None
    token: str | None = None
    created_at: str


class KpiCandidate(BaseModel):
    label: str
    value: str
    trend: str | None = None           # up | down | neutral


class DashboardTileUpdate(BaseModel):
    title: str | None = None
    position: dict[str, Any] | None = None
    echarts_config: dict[str, Any] | None = None
    metric_value: str | None = None
    metric_label: str | None = None
    metric_trend: str | None = None
    metric_threshold: dict[str, Any] | None = None


class ChartSeriesPoint(BaseModel):
    label: str
    value: int


class ChartSummary(BaseModel):
    dataset_id: str
    column: str
    kind: str
    series: List[ChartSeriesPoint] = Field(default_factory=list)


class ProfileSummary(BaseModel):
    dataset_id: str
    column_profiles: Dict[str, Dict[str, Any]]
    issues: List[str] = Field(default_factory=list)


class TransformationStep(BaseModel):
    name: str
    params: Dict[str, Any] = Field(default_factory=dict)


class TransformationRecipe(BaseModel):
    dataset_id: str
    steps: List[TransformationStep] = Field(default_factory=list)
    notes: Optional[str] = None


class RecipeVersionOut(BaseModel):
    version_id: str
    dataset_id: str
    steps: List[TransformationStep] = Field(default_factory=list)
    notes: Optional[str] = None
    created_at: str


class RecipeRetentionPolicyOut(BaseModel):
    max_versions: int
    max_age_days: int


class RecipeRetentionPolicyUpdate(BaseModel):
    max_versions: Optional[int] = Field(default=None, ge=1, le=1000)
    max_age_days: Optional[int] = Field(default=None, ge=1, le=3650)


class StorageTierPolicyOut(BaseModel):
    hot_max_size_bytes: int
    warm_max_size_bytes: int
    warm_after_days: int
    archive_after_days: int
    storage_classes: Dict[str, str] = Field(default_factory=dict)


class StorageTierPolicyUpdate(BaseModel):
    hot_max_size_bytes: Optional[int] = Field(default=None, ge=1)
    warm_max_size_bytes: Optional[int] = Field(default=None, ge=1)
    warm_after_days: Optional[int] = Field(default=None, ge=1, le=3650)
    archive_after_days: Optional[int] = Field(default=None, ge=1, le=3650)


class AutomationGuardrailPolicyOut(BaseModel):
    enabled: bool
    max_rows: int
    max_columns: int
    max_request_chars: int
    max_steps: int
    allow_ml_training: bool


class AutomationGuardrailPolicyUpdate(BaseModel):
    enabled: Optional[bool] = None
    max_rows: Optional[int] = Field(default=None, ge=1)
    max_columns: Optional[int] = Field(default=None, ge=1)
    max_request_chars: Optional[int] = Field(default=None, ge=10, le=20000)
    max_steps: Optional[int] = Field(default=None, ge=1, le=100)
    allow_ml_training: Optional[bool] = None


class AIOperatingControlsOut(BaseModel):
    enable_durable_memory: bool
    max_message_chars: int
    max_stream_events: int
    allowed_intents: List[str] = Field(default_factory=list)
    prompt_starters: Dict[str, List[str]] = Field(default_factory=dict)


class AIOperatingControlsUpdate(BaseModel):
    enable_durable_memory: Optional[bool] = None
    max_message_chars: Optional[int] = Field(default=None, ge=10, le=20000)
    max_stream_events: Optional[int] = Field(default=None, ge=1, le=5000)
    allowed_intents: Optional[List[str]] = None
    prompt_starters: Optional[Dict[str, List[str]]] = None


class AuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"


UserRole = Literal["admin", "editor", "viewer"]
UserPlan = Literal["Free", "Professional", "Team", "Business", "Enterprise"]


class DashboardWidget(BaseModel):
    widget_id: str
    title: str
    chart_type: str
    config: Dict[str, Any] = Field(default_factory=dict)


class Dashboard(BaseModel):
    dashboard_id: str
    name: str
    widgets: List[DashboardWidget] = Field(default_factory=list)
    is_shared: bool = False
    share_token: Optional[str] = None
    share_expires_at: Optional[str] = None
    share_scope: Optional[str] = None


class WebhookRegistration(BaseModel):
    hook_id: str
    target_url: str
    event: str


class ScheduledJob(BaseModel):
    job_id: str
    name: str
    cron: str
    action: str
    status: str


PipelineCadence = Literal["daily", "weekly", "monthly"]


class PipelineCreate(BaseModel):
    name: str
    cadence: PipelineCadence = "daily"
    time_of_day: Optional[str] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    dataset_id: Optional[str] = None
    connector: Optional[str] = None
    connector_config: Dict[str, Any] = Field(default_factory=dict)
    apply_recipe: bool = False
    run_profile: bool = True
    run_insights: bool = True
    enabled: bool = True


class PipelineUpdate(BaseModel):
    name: Optional[str] = None
    cadence: Optional[PipelineCadence] = None
    time_of_day: Optional[str] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    dataset_id: Optional[str] = None
    connector: Optional[str] = None
    connector_config: Optional[Dict[str, Any]] = None
    apply_recipe: Optional[bool] = None
    run_profile: Optional[bool] = None
    run_insights: Optional[bool] = None
    enabled: Optional[bool] = None


class PipelineSchedule(BaseModel):
    pipeline_id: str
    name: str
    cadence: PipelineCadence
    time_of_day: Optional[str] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    dataset_id: Optional[str] = None
    connector: Optional[str] = None
    connector_config: Dict[str, Any] = Field(default_factory=dict)
    apply_recipe: bool = False
    run_profile: bool = True
    run_insights: bool = True
    enabled: bool = True
    last_run_at: Optional[str] = None
    next_run_at: Optional[str] = None
    last_run_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None


class PipelineRun(BaseModel):
    run_id: str
    pipeline_id: str
    status: str
    dataset_id: Optional[str] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    started_at: str
    finished_at: Optional[str] = None


class ConnectorImportRequest(BaseModel):
    connector: str
    config: Dict[str, Any] = Field(default_factory=dict)
    # Optional: persist credentials for future fold/write-back/live operations
    credential_id: Optional[str] = None   # use a previously saved credential
    save_credential: bool = False         # encrypt + save config as a new credential
    credential_label: Optional[str] = None
    import_mode: str = "cached"           # 'cached' (default) | 'live'


class ConnectorCredentialCreate(BaseModel):
    connector_type: str
    config: Dict[str, Any]
    label: Optional[str] = None


class ConnectorCredentialOut(BaseModel):
    id: str
    connector_type: str
    label: Optional[str]
    created_at: str


class DatasetExportConnectorRequest(BaseModel):
    """Request body for POST /datasets/{id}/export/connector (write-back)."""
    connector_type: str
    table_name: str
    mode: str = "append"           # 'append' | 'replace' | 'fail'
    credential_id: Optional[str] = None   # use saved credential
    connector_config: Optional[Dict[str, Any]] = None  # inline creds (if no credential_id)


class UserCreate(BaseModel):
    username: str
    role: UserRole = "viewer"
    plan: UserPlan = "Free"


class UserOut(BaseModel):
    id: str
    username: str
    role: UserRole
    plan: UserPlan


class UserUsage(BaseModel):
    datasetsUsed: int
    storageUsed: int
    aiMessagesUsed: int


class UserProfileOut(BaseModel):
    id: str
    username: str
    role: UserRole
    plan: UserPlan
    usage: UserUsage
    has_completed_onboarding: bool = False
    has_uploaded_first_file: bool = False


class WorkspaceCreate(BaseModel):
    name: str


class WorkspaceOut(BaseModel):
    id: str
    name: str
    is_shared: bool = False
    share_token: Optional[str] = None
    share_expires_at: Optional[str] = None
    share_scope: Optional[str] = None


class BusinessRule(BaseModel):
    key: str
    description: str
    applies_to: Optional[List[str]] = None
    severity: str = "info"


class ContextPayload(BaseModel):
    workspace_id: str
    glossary: Dict[str, str] = Field(default_factory=dict)
    rules: List[BusinessRule] = Field(default_factory=list)


class ContextVersionOut(BaseModel):
    version_id: str
    workspace_id: str
    glossary: Dict[str, str] = Field(default_factory=dict)
    rules: List[BusinessRule] = Field(default_factory=list)
    created_at: str


class InsightSummary(BaseModel):
    dataset_id: str
    highlights: List[str] = Field(default_factory=list)
    anomalies: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    explanations: List[str] = Field(default_factory=list)
    narrative: Optional[str] = None


class InsightAction(BaseModel):
    name: str
    params: Dict[str, Any] = Field(default_factory=dict)
    reason: str


class InsightActionSummary(BaseModel):
    dataset_id: str
    actions: List[InsightAction] = Field(default_factory=list)


class AuditEntry(BaseModel):
    action: str
    actor: str
    target: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None


class AgentSuggestion(BaseModel):
    dataset_id: str
    recommended_steps: List[TransformationStep] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


class AgentFeedbackIn(BaseModel):
    dataset_id: str
    rating: Literal["up", "down"]
    source: str = "suggestion"
    notes: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AgentFeedbackOut(BaseModel):
    feedback_id: str
    dataset_id: str
    rating: str
    source: str
    notes: Optional[str] = None
    created_at: str


class ActionCount(BaseModel):
    action: str
    count: int


class TargetCount(BaseModel):
    target: str
    count: int


class UsageSummary(BaseModel):
    total_events: int
    unique_actors: int
    actions: List[ActionCount] = Field(default_factory=list)
    targets: List[TargetCount] = Field(default_factory=list)


class TenantIsolationViolation(BaseModel):
    category: str
    severity: Literal["high", "medium", "low"] = "medium"
    table: str
    record_id: str
    workspace_id: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class TenantIsolationReport(BaseModel):
    checked_at: str
    scope_workspace_id: Optional[str] = None
    total_records_scanned: int = 0
    total_violations: int = 0
    violations_by_category: Dict[str, int] = Field(default_factory=dict)
    violations: List[TenantIsolationViolation] = Field(default_factory=list)


class CorrelationPair(BaseModel):
    column_a: str
    column_b: str
    value: float


class CorrelationSummary(BaseModel):
    dataset_id: str
    pairs: List[CorrelationPair] = Field(default_factory=list)


class ApprovalRequestIn(BaseModel):
    requester: str
    resource_type: str
    resource_id: str
    summary: str


class ApprovalRequestOut(BaseModel):
    request_id: str
    requester: str
    resource_type: str
    resource_id: str
    summary: str
    status: str
    created_at: str


class DashboardTemplate(BaseModel):
    template_id: str
    name: str
    description: str
    widgets: List[DashboardWidget] = Field(default_factory=list)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    dataset_id: str
    reply: str
    notes: List[str] = Field(default_factory=list)


# ==================== LIVE DATA PLATFORM MODELS ====================

class DataSourceCreate(BaseModel):
    name: str
    source_type: str  # manual_upload | s3_folder | google_sheets | sftp | url
    config: dict = Field(default_factory=dict)


class DataSourceResponse(BaseModel):
    id: str
    name: str
    user_id: str
    source_type: str
    config: dict
    last_tested_at: Optional[str] = None
    last_pulled_at: Optional[str] = None
    is_active: bool
    created_at: str
    pipeline_count: int = 0


class DataSourceTest(BaseModel):
    preview: List[dict] = Field(default_factory=list)
    ok: bool
    message: str = ""


class PipelineScheduleCreate(BaseModel):
    pipeline_id: str
    cron_expression: str = "0 9 * * 1"
    timezone: str = "Asia/Kolkata"
    is_active: bool = False
    auto_refresh_on_upload: bool = False


class PipelineScheduleResponse(BaseModel):
    id: str
    pipeline_id: str
    user_id: str
    cron_expression: str
    timezone: str
    is_active: bool
    last_run_at: Optional[str] = None
    next_run_at: Optional[str] = None
    auto_refresh_on_upload: bool
    created_at: str


class PipelineRunStatus(BaseModel):
    run_id: str
    pipeline_id: str
    status: str
    triggered_by: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    steps_completed: int = 0
    total_steps: int = 0
    output_snapshot_url: Optional[str] = None


class TableSnapshotResponse(BaseModel):
    model_config = {"populate_by_name": True}

    id: str
    pipeline_run_id: str
    table_name: str
    snapshot_url: str
    row_count: Optional[int] = None
    table_schema: dict = Field(alias="schema")
    created_at: str


class PipelineRunOut(BaseModel):
    run_id: str
    message: str = "Pipeline run triggered"


# ─────────────────────────────────────────────────────────────────────────────
# Projects
# ─────────────────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(..., max_length=50)
    description: Optional[str] = Field(default=None, max_length=200)
    colour: str = Field(default="#5B6AF0")
    icon: str = Field(default="📁")


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=200)
    colour: Optional[str] = None
    icon: Optional[str] = None


class ProjectOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    colour: str
    icon: str
    workspace_id: str
    pipeline_count: int = 0
    dashboard_count: int = 0
    source_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class RecentPipelineRow(BaseModel):
    id: str
    name: str
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    last_run_at: Optional[str] = None
    status: str = "draft"
    step_count: int = 0


class RecentDashboardRow(BaseModel):
    id: str
    name: str
    project_id: Optional[str] = None
    tile_count: int = 0
    is_published: bool = False
    updated_at: Optional[str] = None


class WorkspaceRecentOut(BaseModel):
    recent_projects: List[ProjectOut] = Field(default_factory=list)
    recent_pipelines: List[RecentPipelineRow] = Field(default_factory=list)
    recent_dashboards: List[RecentDashboardRow] = Field(default_factory=list)


class ProjectPipelineOut(BaseModel):
    id: str
    name: str
    status: str
    step_count: int = 0
    last_run_at: Optional[str] = None
    last_run_status: Optional[str] = None
    cron_expression: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectDashboardOut(BaseModel):
    id: str
    name: str
    tile_count: int = 0
    is_published: bool = False
    share_token: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectSourceOut(BaseModel):
    id: str
    name: str
    source_type: str
    is_active: bool
    last_pulled_at: Optional[str] = None
    created_at: Optional[str] = None


class ProjectDetailOut(BaseModel):
    project: ProjectOut
    pipelines: List[ProjectPipelineOut] = Field(default_factory=list)
    dashboards: List[ProjectDashboardOut] = Field(default_factory=list)
    sources: List[ProjectSourceOut] = Field(default_factory=list)
