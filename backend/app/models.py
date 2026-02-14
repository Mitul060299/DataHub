from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Literal


class DatasetPreview(BaseModel):
    dataset_id: str
    columns: List[str]
    row_count: int
    sample_rows: List[Dict[str, Any]]
    parent_id: Optional[str] = None


class DatasetMeta(BaseModel):
    dataset_id: str
    columns: List[str]
    row_count: int
    parent_id: Optional[str] = None


class DatasetPage(BaseModel):
    dataset_id: str
    columns: List[str]
    offset: int
    limit: int
    rows: List[Dict[str, Any]]
    total_rows: int


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


class AuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"


UserRole = Literal["admin", "editor", "viewer"]
UserPlan = Literal["Free", "Professional", "Team", "Enterprise"]


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
