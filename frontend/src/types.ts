export interface DatasetPreview {
  dataset_id: string;
  columns: string[];
  row_count: number;
  sample_rows: Record<string, unknown>[];
  parent_id?: string | null;
}

export interface DatasetMeta {
  dataset_id: string;
  name?: string | null;
  columns: string[];
  row_count: number;
  file_format?: string | null;
  parent_id?: string | null;
}

export interface DatasetPage {
  dataset_id: string;
  columns: string[];
  offset: number;
  limit: number;
  rows: Record<string, unknown>[];
  total_rows: number;
}

export interface CalculatedColumn {
  id: string;
  dataset_id: string;
  name: string;
  formula: string;
  column_type: string;
  cached_value?: string | null;
  display_name?: string | null;
  created_at: string;
}

export interface ChartSeriesPoint {
  label: string;
  value: number;
}

export interface ChartSummary {
  dataset_id: string;
  column: string;
  kind: string;
  series: ChartSeriesPoint[];
}

export interface CorrelationPair {
  column_a: string;
  column_b: string;
  value: number;
}

export interface CorrelationSummary {
  dataset_id: string;
  pairs: CorrelationPair[];
}

export interface DashboardWidget {
  widget_id: string;
  title: string;
  chart_type: string;
  config: Record<string, unknown>;
}

export interface DashboardV2Tile {
  id: string;
  dashboard_id: string;
  dataset_id?: string | null;
  title: string;
  chart_type: string;
  tile_type?: string | null;
  echarts_config?: Record<string, unknown> | null;
  table_data?: Record<string, unknown> | null;
  metric_value?: string | null;
  metric_label?: string | null;
  metric_trend?: string | null;
  metric_threshold?: Record<string, unknown> | null;
  sparkline_data?: number[] | null;
  delta_pct?: number | null;
  query_spec: Record<string, unknown>;
  layout: Record<string, unknown>;
  created_at: string;
}

export interface DashboardV2 {
  id: string;
  dataset_id?: string | null;
  name: string;
  description?: string | null;
  layout: Record<string, unknown>;
  theme?: Record<string, unknown> | null;
  is_published?: boolean;
  share_token?: string | null;
  tiles: DashboardV2Tile[];
  created_at: string;
  updated_at?: string | null;
}

export interface BusinessRule {
  key: string;
  description: string;
  applies_to?: string[];
  severity?: string;
}

export interface ContextPayload {
  glossary: Record<string, string>;
  rules: BusinessRule[];
}

export interface ContextVersion {
  version_id: string;
  glossary: Record<string, string>;
  rules: BusinessRule[];
  created_at: string;
}

export interface ProfileSummary {
  dataset_id: string;
  column_profiles: Record<string, Record<string, unknown>>;
  issues: string[];
}

export interface InsightSummary {
  dataset_id: string;
  highlights: string[];
  anomalies: string[];
  recommendations: string[];
  explanations: string[];
  narrative?: string | null;
}

export interface InsightAction {
  name: string;
  params: Record<string, unknown>;
  reason: string;
}

export interface InsightActionSummary {
  dataset_id: string;
  actions: InsightAction[];
}

export interface TransformationStep {
  name: string;
  params: Record<string, unknown>;
}

export interface TransformationRecipe {
  dataset_id: string;
  steps: TransformationStep[];
  notes?: string | null;
}

export interface RecipeVersion {
  version_id: string;
  dataset_id: string;
  steps: TransformationStep[];
  notes?: string | null;
  created_at: string;
}

export interface AgentSuggestion {
  dataset_id: string;
  recommended_steps: TransformationStep[];
  notes: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  dataset_id: string;
  reply: string;
  notes: string[];
}

export interface WebhookRegistration {
  hook_id: string;
  target_url: string;
  event: string;
}

export interface ScheduledJob {
  job_id: string;
  name: string;
  cron: string;
  action: string;
  status: string;
}

export interface PipelineSchedule {
  pipeline_id: string;
  name: string;
  cadence: "daily" | "weekly" | "monthly";
  time_of_day?: string | null;
  day_of_week?: number | null;
  day_of_month?: number | null;
  dataset_id?: string | null;
  connector?: string | null;
  connector_config?: Record<string, unknown>;
  apply_recipe: boolean;
  run_profile: boolean;
  run_insights: boolean;
  enabled: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
  last_run_metadata?: Record<string, unknown>;
  created_at?: string | null;
}

export interface PipelineRun {
  run_id: string;
  pipeline_id: string;
  status: string;
  dataset_id?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
  started_at: string;
  finished_at?: string | null;
}

export interface AuditEntry {
  action: string;
  actor: string;
  target: string;
  metadata: Record<string, unknown>;
  created_at?: string | null;
}

export interface ActionCount {
  action: string;
  count: number;
}

export interface TargetCount {
  target: string;
  count: number;
}

export interface UsageSummary {
  total_events: number;
  unique_actors: number;
  actions: ActionCount[];
  targets: TargetCount[];
}

export interface ShareSettings {
  public_base_url: string;
  shared_rate_limit_per_minute: number;
  share_signing_required: boolean;
  share_scope_allowlist: string[];
  share_scope_policy: Record<string, string>;
}

export interface ApprovalRequest {
  request_id: string;
  requester: string;
  resource_type: string;
  resource_id: string;
  summary: string;
  status: string;
  created_at: string;
}

export interface WorkspaceOut {
  id: string;
  name: string;
  is_shared?: boolean;
  share_token?: string | null;
  share_expires_at?: string | null;
  share_scope?: string | null;
}
