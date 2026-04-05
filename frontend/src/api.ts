import axios from "axios";
import { getAuthToken } from "./utils/auth";

const ANALYTICS_CACHE_TTL_MS = 60_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const analyticsCache = new Map<string, CacheEntry<unknown>>();
const analyticsPending = new Map<string, Promise<unknown>>();

const toStableParams = (params?: Record<string, unknown>) => {
  if (!params) return "";
  const keys = Object.keys(params).sort();
  return keys
    .map((key) => `${key}:${String(params[key])}`)
    .join("|");
};

const analyticsKey = (scope: string, datasetId: string, params?: Record<string, unknown>) => {
  const suffix = toStableParams(params);
  return suffix ? `${scope}:${datasetId}:${suffix}` : `${scope}:${datasetId}`;
};

const readAnalyticsCache = <T>(key: string): T | null => {
  const cached = analyticsCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    analyticsCache.delete(key);
    return null;
  }
  return cached.value as T;
};

const writeAnalyticsCache = <T>(key: string, value: T) => {
  analyticsCache.set(key, {
    value,
    expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
  });
};

const getCachedAnalytics = async <T>(key: string, loader: () => Promise<T>): Promise<T> => {
  const cached = readAnalyticsCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  const pending = analyticsPending.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const request = loader()
    .then((value) => {
      writeAnalyticsCache(key, value);
      return value;
    })
    .finally(() => {
      analyticsPending.delete(key);
    });

  analyticsPending.set(key, request as Promise<unknown>);
  return request;
};

export function invalidateAnalyticsCache(options?: { datasetId?: string; workspaceId?: string }) {
  if (!options?.datasetId && !options?.workspaceId) {
    analyticsCache.clear();
    analyticsPending.clear();
    return;
  }

  const datasetId = options.datasetId;
  const workspaceId = options.workspaceId;

  const shouldDrop = (key: string) => {
    if (datasetId && !key.includes(`:${datasetId}`)) {
      return false;
    }
    if (workspaceId && !key.includes(`workspace_id:${workspaceId}`)) {
      return false;
    }
    return true;
  };

  for (const key of analyticsCache.keys()) {
    if (shouldDrop(key)) {
      analyticsCache.delete(key);
    }
  }
  for (const key of analyticsPending.keys()) {
    if (shouldDrop(key)) {
      analyticsPending.delete(key);
    }
  }
}

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const defaultApiBaseUrl = "/api";

const api = axios.create({
  baseURL: configuredApiBaseUrl || defaultApiBaseUrl
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const detail = String(error?.response?.data?.detail ?? "");
    const lower = detail.toLowerCase();
    const isPlanError = status === 403 && (
      lower.includes("requires") ||
      lower.includes("plan") ||
      lower.includes("limit") ||
      lower.includes("storage")
    );

    if (isPlanError && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("datahub:plan-upgrade-required", {
        detail: {
          message: detail || "Your current plan does not include this feature.",
        },
      }));
    }

    if (status === 429 && typeof window !== "undefined") {
      const retryAfter =
        (error?.response?.data as { retry_after_seconds?: number })?.retry_after_seconds ?? 60;
      window.dispatchEvent(
        new CustomEvent("datahub:rate-limited", { detail: { retryAfter } })
      );
    }

    return Promise.reject(error);
  }
);

// Export the api instance for direct use in components
export { api };

export async function validateFile(file: File): Promise<{
  valid: boolean;
  filename: string;
  file_size_mb: number;
  row_count: number;
  column_count: number;
  columns: { name: string; type: string }[];
  encoding_converted: boolean;
  warnings: string[];
}> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/datasets/validate", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function uploadDataset(file: File, datasetName?: string, sheet?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (datasetName?.trim()) {
    formData.append("dataset_name", datasetName.trim());
  }
  if (sheet?.trim()) {
    formData.append("sheet", sheet.trim());
  }
  const response = await api.post("/datasets/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  invalidateAnalyticsCache();
  return response.data;
}

export async function listExcelSheets(file: File): Promise<{ sheets: string[] }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/import/excel-sheets", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function fetchSchemaComparison(
  datasetIdA: string,
  datasetIdB: string
): Promise<{
  datasets: { id: string; name: string; columns: string[] }[];
  exact_matches: string[];
  only_in_a: string[];
  only_in_b: string[];
  fuzzy_suggestions: { column_a: string; column_b: string; confidence: string }[];
  alignment_score: number;
}> {
  const response = await api.get("/datasets/compare-schemas", {
    params: { ids: `${datasetIdA},${datasetIdB}` },
  });
  return response.data;
}

export async function fetchProfile(datasetId: string) {
  const key = analyticsKey("profile", datasetId);
  return getCachedAnalytics(key, async () => {
    const response = await api.get(`/profiling/${datasetId}`);
    return response.data;
  });
}

export async function fetchInsights(datasetId: string, workspaceId?: string) {
  const params = workspaceId ? { workspace_id: workspaceId } : undefined;
  const key = analyticsKey("insights", datasetId, params);
  return getCachedAnalytics(key, async () => {
    const response = await api.get(`/insights/${datasetId}`, {
      params
    });
    return response.data;
  });
}

export async function fetchInsightActions(datasetId: string) {
  const key = analyticsKey("insight-actions", datasetId);
  return getCachedAnalytics(key, async () => {
    const response = await api.get(`/insights/${datasetId}/actions`);
    return response.data;
  });
}

export async function fetchAgentSuggestions(datasetId: string, workspaceId?: string) {
  const params = workspaceId ? { workspace_id: workspaceId } : undefined;
  const key = analyticsKey("agent-suggestions", datasetId, params);
  return getCachedAnalytics(key, async () => {
    const response = await api.get(`/agents/suggest/${datasetId}`, {
      params
    });
    return response.data;
  });
}

export async function getOidcLoginUrl() {
  const response = await api.get("/auth/oidc/login");
  return response.data as { auth_url: string; state: string };
}

export async function exchangeOidcCode(code: string) {
  const response = await api.get("/auth/oidc/callback", { params: { code } });
  return response.data as { access_token: string; token_type: string };
}

export async function fetchCurrentUser(workspaceId?: string) {
  const response = await api.get("/users/me", {
    headers: workspaceId ? { "X-Workspace-Id": workspaceId } : undefined,
  });
  return response.data as {
    id: string;
    username: string;
    role: string;
    plan: "Free" | "Professional" | "Team" | "Business" | "Enterprise";
    has_completed_onboarding: boolean;
    has_uploaded_first_file: boolean;
    usage: {
      datasetsUsed: number;
      storageUsed: number;
      aiMessagesUsed: number;
    };
  };
}

export async function updateOnboardingState(opts: {
  completed?: boolean;
  uploadedFirstFile?: boolean;
}): Promise<void> {
  await api.patch("/users/me/onboarding", {
    completed: opts.completed,
    uploaded_first_file: opts.uploadedFirstFile,
  });
}

export async function chatWithAgent(
  datasetId: string,
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
  workspaceId?: string
) {
  const response = await api.post(`/agents/chat/${datasetId}`, {
    message,
    history
  }, {
    params: workspaceId ? { workspace_id: workspaceId } : undefined
  });
  return response.data;
}

export type ChatSessionStreamEvent = {
  type: string;
  content: string;
  data?: Record<string, unknown>;
  timestamp: number;
};

export async function createChatSession(datasetId: string, initialRequest?: string) {
  const response = await api.post("/chat/sessions", null, {
    params: {
      dataset_id: datasetId,
      initial_request: initialRequest,
    },
  });
  return response.data as {
    success: boolean;
    data?: {
      id: string;
      title: string;
      dataset_id: string;
      status: string;
      created_at: string;
    };
  };
}

export async function streamChatSessionMessage(sessionId: string, content: string) {
  const token = getAuthToken();
  const baseUrl = (api.defaults.baseURL || "").replace(/\/$/, "");
  const streamPath = `/chat/sessions/${encodeURIComponent(sessionId)}/messages?content=${encodeURIComponent(content)}`;
  const streamUrl = `${baseUrl}${streamPath}`;

  const response = await fetch(streamUrl, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to send message");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const events: ChatSessionStreamEvent[] = [];
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as ChatSessionStreamEvent;
        events.push(event);
      } catch {
      }
    }
  }

  return events;
}

export async function fetchContext(workspaceId: string) {
  const response = await api.get(`/context/${workspaceId}`);
  return response.data;
}

export async function saveContext(payload: {
  workspace_id: string;
  glossary: Record<string, string>;
  rules: Array<{ key: string; description: string; applies_to?: string[]; severity?: string }>;
}) {
  const response = await api.post("/context", payload);
  return response.data;
}

export async function listContextVersions(workspaceId: string) {
  const response = await api.get(`/context/${workspaceId}/versions`);
  return response.data;
}

export async function revertContext(workspaceId: string, versionId: string) {
  const response = await api.post(`/context/${workspaceId}/revert/${versionId}`);
  return response.data;
}

export async function submitAgentFeedback(
  datasetId: string,
  rating: "up" | "down",
  source: string,
  notes?: string
) {
  const response = await api.post("/agents/feedback", {
    dataset_id: datasetId,
    rating,
    source,
    notes
  });
  return response.data;
}

export async function submitFeedbackForm(payload: {
  name: string;
  email: string;
  subject?: string;
  message: string;
}) {
  const response = await api.post("/feedback", payload);
  return response.data as { success: boolean; id?: string; message?: string };
}

export async function saveRecipe(datasetId: string, steps: any[]) {
  const response = await api.post("/transformations/recipes", {
    dataset_id: datasetId,
    steps
  });
  return response.data;
}

export async function fetchRecipe(datasetId: string) {
  const response = await api.get(`/transformations/recipes/${datasetId}`);
  return response.data;
}

export async function applyRecipe(datasetId: string) {
  const response = await api.post(`/transformations/apply/${datasetId}`);
  return response.data;
}

export async function listRecipeVersions(datasetId: string) {
  const response = await api.get(`/transformations/recipes/${datasetId}/versions`);
  return response.data;
}

export async function revertRecipe(datasetId: string, versionId: string) {
  const response = await api.post(`/transformations/recipes/${datasetId}/revert/${versionId}`);
  return response.data;
}

export async function listDatasets() {
  const response = await api.get("/datasets");
  return response.data;
}

export async function listConnectors() {
  const response = await api.get("/connectors");
  return response.data as { connectors: string[] };
}

export async function syncConnector(payload: {
  connector: string;
  config: Record<string, unknown>;
  mode: "pull" | "push";
  dataset_id?: string;
}) {
  const response = await api.post("/connectors/sync", payload);
  return response.data;
}

export async function fetchSyncStatus() {
  const response = await api.get("/connectors/sync-status");
  return response.data as { status: Array<{ key: string; last_synced_at: string; mode: string; dataset_id?: string | null }> };
}

// ── DB Connector management ───────────────────────────────────────────────────

export interface SavedConnection {
  id: string;
  name: string;
  type: string;
  host: string | null;
  database: string | null;
  status: string;
  last_sync_at: string | null;
  created_at: string;
}

export interface ConnectionTable {
  schema: string;
  table: string;
  row_count: number;
}

export async function testConnector(connector: string, config: Record<string, unknown>) {
  const response = await api.post("/connectors/test", { connector, config });
  return response.data as { success: boolean; message?: string; error?: string };
}

export async function saveConnection(name: string, connector: string, config: Record<string, unknown>) {
  const response = await api.post("/connectors/connections", { name, connector, config });
  return response.data as SavedConnection;
}

export async function listConnections() {
  const response = await api.get("/connectors/connections");
  return response.data as { connections: SavedConnection[] };
}

export async function deleteConnection(connectionId: string) {
  const response = await api.delete(`/connectors/connections/${connectionId}`);
  return response.data as { ok: boolean };
}

export async function listConnectionTables(connectionId: string) {
  const response = await api.get(`/connectors/connections/${connectionId}/tables`);
  return response.data as { connection_id: string; tables: ConnectionTable[] };
}

export async function importFromConnection(
  connectionId: string,
  connector: string,
  config: Record<string, unknown>,
  tableName?: string,
) {
  const importConfig = tableName ? { ...config, table: tableName } : config;
  const response = await api.post("/connectors/import", { connector, config: importConfig });
  return response.data;
}

export async function fetchDatasetLineage(datasetId: string) {
  const response = await api.get(`/datasets/${datasetId}/lineage`);
  return response.data;
}

export async function fetchColumnSuggestions(datasetId: string, query: string, limit = 5) {
  const response = await api.get(`/datasets/${datasetId}/suggest-columns`, {
    params: { query, limit }
  });
  return response.data as { query: string; suggestions: string[] };
}

export async function deleteDataset(datasetId: string) {
  const response = await api.delete(`/datasets/${datasetId}`);
  invalidateAnalyticsCache({ datasetId });
  return response.data;
}

export async function renameDataset(datasetId: string, name: string) {
  const response = await api.patch(`/datasets/${datasetId}`, { name });
  invalidateAnalyticsCache({ datasetId });
  return response.data;
}

export async function exportDatasetCsv(datasetId: string, params?: Record<string, unknown>) {
  const response = await api.get(`/datasets/${datasetId}/export`, {
    responseType: "blob",
    params
  });
  return response.data;
}

export async function exportDatasetPowerBI(datasetId: string): Promise<Blob> {
  const response = await api.get(`/datasets/${datasetId}/export/powerbi`, {
    responseType: "blob",
  });
  return response.data as Blob;
}

export async function exportDatasetTableau(datasetId: string): Promise<Blob> {
  const response = await api.get(`/datasets/${datasetId}/export/tableau`, {
    responseType: "blob",
  });
  return response.data as Blob;
}

export async function exportDatasetToSheets(
  datasetId: string,
  payload: { spreadsheet_url: string; sheet_name: string; mode: "replace" | "append" }
): Promise<{ rows_written: number; spreadsheet_url: string; sheet_name: string }> {
  const response = await api.post(`/datasets/${datasetId}/export/sheets`, payload);
  return response.data as { rows_written: number; spreadsheet_url: string; sheet_name: string };
}

export async function getSheetsExportConfig(): Promise<{ service_account_email: string }> {
  const response = await api.get("/datasets/export/sheets-config");
  return response.data as { service_account_email: string };
}

export async function fetchDatasetPage(
  datasetId: string,
  offset: number,
  limit: number,
  params?: Record<string, unknown>
) {
  const response = await api.get(`/datasets/${datasetId}/preview`, {
    params: { offset, limit, ...params }
  });
  return response.data;
}

export async function listCalculatedColumns(datasetId: string) {
  const response = await api.get(`/datasets/${datasetId}/columns`);
  return response.data as Array<{
    id: string;
    dataset_id: string;
    name: string;
    formula: string;
    column_type: string;
    cached_value?: string | null;
    display_name?: string | null;
    created_at: string;
  }>;
}

export async function createCalculatedColumn(
  datasetId: string,
  payload: {
    name: string;
    formula: string;
    column_type?: "dynamic" | "static";
    display_name?: string;
  }
) {
  const response = await api.post(`/datasets/${datasetId}/columns`, payload);
  return response.data as {
    id: string;
    dataset_id: string;
    name: string;
    formula: string;
    column_type: string;
    cached_value?: string | null;
    display_name?: string | null;
    created_at: string;
  };
}

export async function deleteCalculatedColumn(datasetId: string, columnId: string) {
  const response = await api.delete(`/datasets/${datasetId}/columns/${columnId}`);
  return response.data as { success: boolean; column_id: string };
}

export async function listDashboardsV2(workspaceId?: string) {
  const response = await api.get("/dashboards", {
    params: workspaceId ? { workspace_id: workspaceId } : undefined,
  });
  return response.data as Array<{
    id: string;
    workspace_id: string;
    dataset_id?: string | null;
    name: string;
    description?: string | null;
    layout: Record<string, unknown>;
    tiles: Array<{
      id: string;
      dashboard_id: string;
      dataset_id?: string | null;
      title: string;
      chart_type: string;
      query_spec: Record<string, unknown>;
      layout: Record<string, unknown>;
      created_at: string;
    }>;
    created_at: string;
  }>;
}

export async function createDashboardV2(payload: {
  workspace_id: string;
  dataset_id?: string;
  name: string;
  description?: string;
  layout?: Record<string, unknown>;
}) {
  const response = await api.post("/dashboards", payload);
  return response.data as {
    id: string;
    workspace_id: string;
    dataset_id?: string | null;
    name: string;
    description?: string | null;
    layout: Record<string, unknown>;
    tiles: Array<{
      id: string;
      dashboard_id: string;
      dataset_id?: string | null;
      title: string;
      chart_type: string;
      query_spec: Record<string, unknown>;
      layout: Record<string, unknown>;
      created_at: string;
    }>;
    created_at: string;
  };
}

export async function addDashboardTile(payload: {
  dashboard_id: string;
  dataset_id?: string;
  title: string;
  chart_type: string;
  query_spec?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}) {
  const response = await api.post(`/dashboards/${payload.dashboard_id}/tiles`, {
    dataset_id: payload.dataset_id,
    title: payload.title,
    chart_type: payload.chart_type,
    query_spec: payload.query_spec ?? {},
    layout: payload.layout ?? {},
  });
  return response.data as {
    id: string;
    dashboard_id: string;
    dataset_id?: string | null;
    title: string;
    chart_type: string;
    query_spec: Record<string, unknown>;
    layout: Record<string, unknown>;
    created_at: string;
  };
}

export async function publishDashboardV2(dashboardId: string, expiresInHours?: number) {
  const response = await api.post(`/dashboards/${dashboardId}/publish`, null, {
    params: expiresInHours ? { expires_in_hours: expiresInHours } : undefined,
  });
  return response.data as {
    dashboard_id: string;
    publish_token: string;
    public_url?: string;
    expires_at?: string | null;
  };
}

export async function unpublishDashboardV2(dashboardId: string) {
  const response = await api.delete(`/dashboards/${dashboardId}/publish`);
  return response.data as { success: boolean; dashboard_id: string };
}

export async function fetchDashboardById(dashboardId: string) {
  const response = await api.get(`/dashboards/${dashboardId}`);
  return response.data as import("./types").DashboardV2;
}

export async function updateDashboard(dashboardId: string, payload: {
  name?: string;
  description?: string;
  layout?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  is_published?: boolean;
}) {
  const response = await api.patch(`/dashboards/${dashboardId}`, payload);
  return response.data as import("./types").DashboardV2;
}

export async function deleteDashboardTile(dashboardId: string, tileId: string) {
  const response = await api.delete(`/dashboards/${dashboardId}/tiles/${tileId}`);
  return response.data as { success: boolean; tile_id: string };
}

export async function updateDashboardTile(dashboardId: string, tileId: string, payload: {
  title?: string;
  layout?: Record<string, unknown>;
  echarts_config?: Record<string, unknown> | null;
}) {
  const response = await api.patch(`/dashboards/${dashboardId}/tiles/${tileId}`, payload);
  return response.data as import("./types").DashboardV2Tile;
}

export async function postDashboardView(dashboardId: string) {
  const response = await api.post(`/dashboards/${dashboardId}/views`);
  return response.data;
}

export async function getDashboardAccessList(dashboardId: string) {
  const response = await api.get(`/dashboards/${dashboardId}/access`);
  return response.data as Array<{
    id: string;
    dashboard_id: string;
    granted_to_user_id?: string | null;
    granted_to_email?: string | null;
    access_level: string;
    granted_by: string;
    expires_at?: string | null;
    token?: string | null;
    created_at: string;
  }>;
}

export async function inviteDashboardAccess(dashboardId: string, payload: {
  granted_to_user_id?: string;
  granted_to_email?: string;
  access_level?: string;
  expires_at?: string;
}) {
  const response = await api.post(`/dashboards/${dashboardId}/access/invite`, payload);
  return response.data;
}

export async function revokeDashboardAccess(dashboardId: string, grantId: string) {
  const response = await api.delete(`/dashboards/${dashboardId}/access/${grantId}`);
  return response.data as { success: boolean };
}

export async function generateShareToken(dashboardId: string) {
  const response = await api.post(`/dashboards/${dashboardId}/access/share-token`);
  return response.data as { share_token: string; share_url: string };
}

export async function deleteShareToken(dashboardId: string) {
  const response = await api.delete(`/dashboards/${dashboardId}/access/share-token`);
  return response.data as { success: boolean };
}

export async function getDashboardViews(dashboardId: string) {
  const response = await api.get(`/dashboards/${dashboardId}/access/views`);
  return response.data as Array<{
    id: string;
    dashboard_id: string;
    viewed_by_user_id?: string | null;
    viewed_by_email?: string | null;
    viewed_at: string;
    ip_address?: string | null;
  }>;
}

export async function fetchPublicDashboard(publishToken: string) {
  const response = await api.get(`/public/dashboards/${publishToken}`);
  return response.data as import("./types").DashboardV2;
}

export async function fetchPublicDashboardTiles(publishToken: string) {
  const response = await api.get(`/public/dashboards/${publishToken}/tiles`);
  return response.data as import("./types").DashboardV2Tile[];
}

/** Fetch a dashboard shared via the new share_token field (not publish_token). */
export async function fetchSharedDashboard(shareToken: string) {
  const response = await api.get(`/public/dashboards/share/${shareToken}`);
  return response.data as import("./types").DashboardV2;
}

export async function fetchSharedDashboardTiles(shareToken: string) {
  const response = await api.get(`/public/dashboards/share/${shareToken}/tiles`);
  return response.data as import("./types").DashboardV2Tile[];
}

export async function fetchChartSummary(
  datasetId: string,
  column: string,
  params?: { bins?: number; top_n?: number }
) {
  const response = await api.get(`/profiling/${datasetId}/summary`, {
    params: { column, ...params }
  });
  return response.data;
}

export async function fetchCorrelationSummary(datasetId: string) {
  const response = await api.get(`/profiling/${datasetId}/correlations`);
  return response.data;
}

export async function addWidget(payload: {
  dashboard_id: string;
  title: string;
  chart_type: string;
  dataset_id: string;
  column?: string;
  bins?: number;
  top_n?: number;
}) {
  const response = await api.post("/widgets", null, { params: payload });
  return response.data;
}

export async function listWidgets(dashboardId: string) {
  const response = await api.get(`/widgets/${dashboardId}`);
  return response.data;
}

export async function deleteWidget(dashboardId: string, widgetId: string) {
  const response = await api.delete(`/widgets/${dashboardId}/${widgetId}`);
  return response.data;
}

export async function updateWidget(
  dashboardId: string,
  widgetId: string,
  params: {
    title?: string;
    column?: string;
    chart_type?: string;
    dataset_id?: string;
    bins?: number;
    top_n?: number;
  }
) {
  const response = await api.put(`/widgets/${dashboardId}/${widgetId}`, null, {
    params
  });
  return response.data;
}

export async function reorderWidgets(dashboardId: string, widgetIds: string[]) {
  const response = await api.post(`/widgets/${dashboardId}/reorder`, null, {
    params: { widget_ids: widgetIds.join(",") }
  });
  return response.data;
}

export async function importInlineCsv(csvText: string) {
  const response = await api.post("/connectors/import", {
    connector: "inline_csv",
    config: { csv_text: csvText }
  });
  return response.data;
}

export async function listWebhooks() {
  const response = await api.get("/webhooks");
  return response.data;
}

export async function registerWebhook(target_url: string, event: string) {
  const response = await api.post("/webhooks", null, {
    params: { target_url, event }
  });
  return response.data;
}

export async function listJobs() {
  const response = await api.get("/jobs");
  return response.data;
}

export async function createJob(name: string, cron: string, action: string) {
  const response = await api.post("/jobs", null, {
    params: { name, cron, action }
  });
  return response.data;
}

export async function listPipelines() {
  const response = await api.get("/pipelines");
  return response.data;
}

export async function createPipeline(payload: {
  name: string;
  cadence: "daily" | "weekly" | "monthly";
  time_of_day?: string;
  day_of_week?: number;
  day_of_month?: number;
  dataset_id?: string | null;
  connector?: string | null;
  connector_config?: Record<string, unknown>;
  apply_recipe?: boolean;
  run_profile?: boolean;
  run_insights?: boolean;
  enabled?: boolean;
}) {
  const response = await api.post("/pipelines", payload);
  return response.data;
}

export async function updatePipeline(pipelineId: string, payload: Record<string, unknown>) {
  const response = await api.put(`/pipelines/${pipelineId}`, payload);
  return response.data;
}

export async function deletePipeline(pipelineId: string) {
  const response = await api.delete(`/pipelines/${pipelineId}`);
  return response.data;
}

export async function runPipeline(pipelineId: string) {
  const response = await api.post(`/pipelines/${pipelineId}/run`);
  return response.data;
}

export async function listPipelineRuns(pipelineId: string) {
  const response = await api.get(`/pipelines/${pipelineId}/runs`);
  return response.data;
}

export async function listDashboardTemplates() {
  const response = await api.get("/templates/dashboards");
  return response.data;
}

export async function listWorkspaces() {
  const response = await api.get("/workspaces");
  return response.data;
}

export async function createWorkspace(name: string) {
  const response = await api.post("/workspaces", { name });
  return response.data;
}

export async function shareWorkspace(workspaceId: string, expiresInHours?: number, scope?: string) {
  const params: Record<string, unknown> = {};
  if (expiresInHours) params.expires_in_hours = expiresInHours;
  if (scope) params.scope = scope;
  const response = await api.post(`/workspaces/${workspaceId}/share`, null, {
    params: Object.keys(params).length ? params : undefined
  });
  return response.data as { share_token: string; share_url?: string };
}

export async function unshareWorkspace(workspaceId: string) {
  const response = await api.post(`/workspaces/${workspaceId}/unshare`);
  return response.data;
}

export async function unshareAllWorkspaces() {
  const response = await api.post("/workspaces/unshare-all");
  return response.data;
}

export async function purgeExpiredWorkspaces() {
  const response = await api.post("/workspaces/purge-expired");
  return response.data;
}

export async function fetchSharedWorkspace(shareToken: string, scope?: string) {
  const response = await api.get(`/workspaces/shared/${shareToken}`, {
    params: scope ? { scope } : undefined
  });
  return response.data;
}

export async function listAuditLogs(filters?: {
  action?: string;
  actor?: string;
  target?: string;
  since_minutes?: number;
  limit?: number;
}) {
  const response = await api.get("/governance/audit", { params: filters });
  return response.data;
}

export async function fetchUsageSummary() {
  const response = await api.get("/governance/usage");
  return response.data;
}

export async function fetchShareSettings() {
  const response = await api.get("/governance/share-settings");
  return response.data as {
    public_base_url: string;
    shared_rate_limit_per_minute: number;
    share_signing_required: boolean;
    share_scope_allowlist: string[];
    share_scope_policy: Record<string, string>;
  };
}

export async function fetchCacheStats() {
  const response = await api.get("/governance/cache-stats");
  return response.data as {
    profile_cache: { size: number; ttl_seconds: number; max_items: number };
    dataset_cache: {
      cached_datasets: number;
      max_cached: number;
      ttl_seconds: number;
      oldest_access: number | null;
      newest_access: number | null;
    };
  };
}

export async function listApprovalRequests(filters?: {
  status?: string;
  requester?: string;
  resource_type?: string;
  resource_id?: string;
  limit?: number;
}) {
  const response = await api.get("/approvals", { params: filters });
  return response.data;
}

export async function listPlugins() {
  const response = await api.get("/plugins");
  return response.data as { plugins: Array<{ name: string; kind: string; description: string; enabled: boolean; source?: string | null }>; connectors: string[] };
}

export async function loadPlugin(payload: {
  module: string;
  class_name: string;
  kind: string;
  name?: string;
  description?: string;
  source?: string;
}) {
  const response = await api.post("/plugins/load", payload);
  return response.data;
}

export async function enablePlugin(name: string) {
  const response = await api.post("/plugins/enable", { name });
  return response.data;
}

export async function disablePlugin(name: string) {
  const response = await api.post("/plugins/disable", { name });
  return response.data;
}

export async function createApprovalRequest(payload: {
  requester: string;
  resource_type: string;
  resource_id: string;
  summary: string;
}) {
  const response = await api.post("/approvals", payload);
  return response.data;
}

export async function approveRequest(requestId: string) {
  const response = await api.post(`/approvals/${requestId}/approve`);
  return response.data;
}

export async function rejectRequest(requestId: string) {
  const response = await api.post(`/approvals/${requestId}/reject`);
  return response.data;
}

// ── Projects ──────────────────────────────────────────────────────────────────

export interface ProjectOut {
  id: string;
  name: string;
  description?: string | null;
  colour: string;
  icon: string;
  workspace_id: string;
  pipeline_count: number;
  dashboard_count: number;
  source_count: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RecentPipelineRow {
  id: string;
  name: string;
  project_id?: string | null;
  project_name?: string | null;
  last_run_at?: string | null;
  status?: string | null;
  step_count: number;
}

export interface RecentDashboardRow {
  id: string;
  name: string;
  project_id?: string | null;
  tile_count: number;
  is_published: boolean;
  updated_at?: string | null;
}

export interface WorkspaceRecentOut {
  recent_projects: ProjectOut[];
  recent_pipelines: RecentPipelineRow[];
  recent_dashboards: RecentDashboardRow[];
}

export interface ProjectPipelineOut {
  id: string;
  name: string;
  status?: string | null;
  step_count: number;
  last_run_at?: string | null;
  last_run_status?: string | null;
  cron_expression?: string | null;
  updated_at?: string | null;
}

export interface ProjectDashboardOut {
  id: string;
  name: string;
  tile_count: number;
  is_published: boolean;
  share_token?: string | null;
  updated_at?: string | null;
}

export interface ProjectSourceOut {
  id: string;
  name: string;
  source_type?: string | null;
  is_active: boolean;
  last_pulled_at?: string | null;
  created_at?: string | null;
}

export interface ProjectDetailOut {
  project: ProjectOut;
  pipelines: ProjectPipelineOut[];
  dashboards: ProjectDashboardOut[];
  sources: ProjectSourceOut[];
}

export async function fetchProjects(): Promise<ProjectOut[]> {
  const response = await api.get("/projects");
  return response.data;
}

export async function createProject(payload: {
  name: string;
  description?: string;
  colour?: string;
  icon?: string;
}): Promise<ProjectOut> {
  const response = await api.post("/projects", payload);
  return response.data;
}

export async function updateProject(
  id: string,
  payload: { name?: string; description?: string; colour?: string; icon?: string },
): Promise<ProjectOut> {
  const response = await api.patch(`/projects/${id}`, payload);
  return response.data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}

export async function fetchProjectDetail(id: string): Promise<ProjectDetailOut> {
  const response = await api.get(`/projects/${id}`);
  return response.data;
}

export async function fetchWorkspaceRecent(): Promise<WorkspaceRecentOut> {
  const response = await api.get("/workspace/recent");
  return response.data;
}

// ── Workspace Members ────────────────────────────────────────────────────────

export interface WorkspaceMemberOut {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email: string;
  role: "admin" | "editor" | "viewer";
  status: "pending" | "active";
  invited_by: string;
  created_at: string;
  accepted_at: string | null;
}

export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberOut[]> {
  const response = await api.get(`/workspaces/${workspaceId}/members`);
  return response.data;
}

export async function inviteMember(
  workspaceId: string,
  email: string,
  role: "admin" | "editor" | "viewer",
): Promise<WorkspaceMemberOut> {
  const response = await api.post(`/workspaces/${workspaceId}/members`, { email, role });
  return response.data;
}

export async function updateMemberRole(
  workspaceId: string,
  memberId: string,
  role: "admin" | "editor" | "viewer",
): Promise<WorkspaceMemberOut> {
  const response = await api.put(`/workspaces/${workspaceId}/members/${memberId}`, { role });
  return response.data;
}

export async function removeMember(workspaceId: string, memberId: string): Promise<void> {
  await api.delete(`/workspaces/${workspaceId}/members/${memberId}`);
}

// ── Reviews ─────────────────────────────────────────────────────────────────

export interface ReviewOut {
  id: string;
  name: string;
  role: string | null;
  rating: number;
  body: string;
}

export async function submitReview(payload: {
  name: string;
  role?: string;
  rating: number;
  body: string;
}): Promise<{ ok: boolean; id: string }> {
  const response = await api.post("/reviews", payload);
  return response.data;
}

export async function getApprovedReviews(): Promise<ReviewOut[]> {
  const response = await api.get("/reviews");
  return response.data;
}

// ── Saved Visualizations ──────────────────────────────────────────────────────

export interface SavedVisualization {
  id: string;
  name: string;
  chart_type: string;
  echarts_config: Record<string, unknown>;
  project_id: string | null;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export async function listVisualizations(): Promise<SavedVisualization[]> {
  const response = await api.get("/api/visualizations/saved");
  return response.data;
}

export async function saveVisualization(payload: {
  name: string;
  chart_type: string;
  echarts_config: Record<string, unknown>;
  project_id?: string;
  workspace_id?: string;
}): Promise<SavedVisualization> {
  const response = await api.post("/api/visualizations/saved", payload);
  return response.data;
}

export async function getVisualization(id: string): Promise<SavedVisualization> {
  const response = await api.get(`/api/visualizations/saved/${id}`);
  return response.data;
}

export async function renameVisualization(id: string, name: string): Promise<SavedVisualization> {
  const response = await api.patch(`/api/visualizations/saved/${id}`, { name });
  return response.data;
}

export async function deleteVisualization(id: string): Promise<void> {
  await api.delete(`/api/visualizations/saved/${id}`);
}

// ── Canvas Layouts ────────────────────────────────────────────────────────────

export interface CanvasLimitStatus {
  count: number;
  limit: number | null;
  can_create: boolean;
  plan: string;
}

export interface CanvasLayout {
  id: string;
  name: string;
  layout: CanvasTileItem[];
  is_public: boolean;
  public_token: string | null;
  project_id: string | null;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export interface CanvasTileItem {
  id: string;
  viz_id?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  type: "chart" | "text" | "kpi" | "slicer";
  title?: string;
  chart_type?: string;
  echarts_config?: Record<string, unknown>;
  text_content?: string;
  // Text formatting fields
  text_size?: string;
  text_bold?: boolean;
  text_italic?: boolean;
  text_color?: string;
  // KPI tile fields
  kpi_value?: string;
  kpi_label?: string;
  kpi_delta?: number;
  // KPI data binding
  kpi_dataset_id?: string;
  kpi_column?: string;
  kpi_aggregation?: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX";
  // Slicer tile fields
  slicer_field?: string;
  slicer_label?: string;
  slicer_options?: string[];
  // Slicer data binding
  slicer_dataset_id?: string;
  slicer_column?: string;
}

export async function getCanvasLimitStatus(): Promise<CanvasLimitStatus> {
  const response = await api.get("/api/canvas/limit-status");
  return response.data;
}

export async function listCanvasLayouts(projectId?: string): Promise<CanvasLayout[]> {
  const response = await api.get("/api/canvas", { params: projectId ? { project_id: projectId } : {} });
  return response.data;
}

export async function createCanvasLayout(payload: {
  name?: string;
  project_id?: string;
  workspace_id?: string;
}): Promise<CanvasLayout> {
  const response = await api.post("/api/canvas", payload);
  return response.data;
}

export async function getCanvasLayout(id: string): Promise<CanvasLayout> {
  const response = await api.get(`/api/canvas/${id}`);
  return response.data;
}

export async function saveCanvasLayout(
  id: string,
  payload: { name?: string; layout?: CanvasTileItem[]; is_public?: boolean },
): Promise<CanvasLayout> {
  const response = await api.patch(`/api/canvas/${id}`, payload);
  return response.data;
}

export async function deleteCanvasLayout(id: string): Promise<void> {
  await api.delete(`/api/canvas/${id}`);
}

export type TileDataResult =
  | { type: "aggregate"; value: string; raw: number | null }
  | { type: "distinct"; values: string[] };

export async function fetchTileData(
  datasetId: string,
  column: string,
  aggregation: string,
): Promise<TileDataResult> {
  const res = await api.get("/api/canvas/tile-data", {
    params: { dataset_id: datasetId, column, aggregation },
  });
  return res.data as TileDataResult;
}

export async function joinWaitlist(data: {
  email: string;
  plan: string;
  region?: string;
}): Promise<void> {
  await api.post("/waitlist", data);
}
