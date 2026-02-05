import axios from "axios";
import { getAuthToken } from "./utils/auth";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function uploadDataset(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/datasets/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}

export async function fetchProfile(datasetId: string) {
  const response = await api.get(`/profiling/${datasetId}`);
  return response.data;
}

export async function fetchInsights(datasetId: string, workspaceId?: string) {
  const response = await api.get(`/insights/${datasetId}`, {
    params: workspaceId ? { workspace_id: workspaceId } : undefined
  });
  return response.data;
}

export async function fetchInsightActions(datasetId: string) {
  const response = await api.get(`/insights/${datasetId}/actions`);
  return response.data;
}

export async function fetchAgentSuggestions(datasetId: string, workspaceId?: string) {
  const response = await api.get(`/agents/suggest/${datasetId}`, {
    params: workspaceId ? { workspace_id: workspaceId } : undefined
  });
  return response.data;
}

export async function getOidcLoginUrl() {
  const response = await api.get("/auth/oidc/login");
  return response.data as { auth_url: string; state: string };
}

export async function exchangeOidcCode(code: string) {
  const response = await api.get("/auth/oidc/callback", { params: { code } });
  return response.data as { access_token: string; token_type: string };
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

export async function listDashboards() {
  const response = await api.get("/dashboards");
  return response.data;
}

export async function createDashboard(name: string) {
  const response = await api.post(`/dashboards?name=${encodeURIComponent(name)}`);
  return response.data;
}

export async function shareDashboard(dashboardId: string, expiresInHours?: number, scope?: string) {
  const params: Record<string, unknown> = {};
  if (expiresInHours) params.expires_in_hours = expiresInHours;
  if (scope) params.scope = scope;
  const response = await api.post(`/dashboards/${dashboardId}/share`, null, {
    params: Object.keys(params).length ? params : undefined
  });
  return response.data as { share_token: string; share_url?: string };
}

export async function unshareDashboard(dashboardId: string) {
  const response = await api.post(`/dashboards/${dashboardId}/unshare`);
  return response.data;
}

export async function unshareAllDashboards() {
  const response = await api.post("/dashboards/unshare-all");
  return response.data;
}

export async function purgeExpiredDashboards() {
  const response = await api.post("/dashboards/purge-expired");
  return response.data;
}

export async function fetchSharedDashboard(shareToken: string, scope?: string) {
  const response = await api.get(`/dashboards/shared/${shareToken}`, {
    params: scope ? { scope } : undefined
  });
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
  return response.data;
}

export async function exportDatasetCsv(datasetId: string, params?: Record<string, unknown>) {
  const response = await api.get(`/datasets/${datasetId}/export`, {
    responseType: "blob",
    params
  });
  return response.data;
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
