# API

- OpenAPI schema is available at /openapi.json
- Swagger UI is available at /docs

## MVP Endpoints
- POST /auth/login?username=USER&role=viewer|editor|admin
- GET /auth/oidc/login
- GET /auth/oidc/callback?code=AUTH_CODE
- POST /datasets/upload
- GET /datasets
- GET /datasets/{dataset_id}/lineage
- GET /datasets/{dataset_id}/suggest-columns?query=...&limit=...
- DELETE /datasets/{dataset_id} (requires editor)
- GET /datasets/{dataset_id}/export (requires viewer) [sort_by, sort_dir, filter_col, filter_op, filter_val]
- GET /datasets/{dataset_id}/preview?offset=0&limit=50 (returns total_rows; supports sort/filter params)
- GET /profiling/{dataset_id}?columns=col1,col2
- GET /profiling/{dataset_id}/summary?column=colName&bins=10&top_n=10
- GET /profiling/{dataset_id}/correlations
- GET /insights/{dataset_id}?workspace_id=...
- GET /insights/{dataset_id}/actions
- GET /agents/suggest/{dataset_id}?workspace_id=...
- POST /agents/chat/{dataset_id}?workspace_id=...
- POST /agents/feedback
- POST /transformations/recipes
- GET /transformations/recipes/{dataset_id}
- GET /transformations/recipes/{dataset_id}/versions
- POST /transformations/recipes/{dataset_id}/revert/{version_id}
- POST /transformations/apply/{dataset_id}
- GET /context/{workspace_id}
- POST /context
- GET /context/{workspace_id}/versions
- POST /context/{workspace_id}/revert/{version_id}
- GET /governance/audit?action=...&actor=...&target=...&since_minutes=...&limit=...
- GET /governance/usage
- GET /governance/share-settings (requires admin)
- GET /governance/cache-stats (requires admin)
- POST /approvals
- GET /approvals?status=...&requester=...&resource_type=...&resource_id=...&limit=...
- POST /approvals/{request_id}/approve
- POST /approvals/{request_id}/reject
- WS /realtime/presence?workspace_id=default&user=alice
- GET /templates/dashboards
- POST /templates/dashboards/{template_id}/instantiate
- POST /governance/audit

## Pipeline Workflows (Generic Reusable Workflows)
- POST /api/pipelines
- GET /api/pipelines
- GET /api/pipelines/{pipeline_id}
- PATCH /api/pipelines/{pipeline_id}
- POST /api/pipelines/{pipeline_id}/publish
- POST /api/pipelines/{pipeline_id}/clone
- POST /api/pipelines/{pipeline_id}/run
- GET /api/pipelines/{pipeline_id}/runs
- GET /api/pipelines/runs/{run_id}
- GET /api/pipelines/runs/{run_id}/artifact?preview_limit=100

### Create Pipeline Workflow (Example)
```json
{
	"name": "Generic Multi-Dataset Workflow",
	"description": "Reusable configurable transformation flow",
	"workspace_id": "default",
	"is_public": false,
	"execution_config": {
		"default_parameters": {
			"period": "2026-02",
			"variance_threshold": 0.01
		}
	},
	"steps": [
		{
			"id": "step-1",
			"action_type": "transform",
			"description": "Join source relations and compute variance",
			"sql": "SELECT a.key, a.amount - b.amount AS variance FROM dataset a LEFT JOIN ref_data b ON a.key = b.key",
			"parameters": {
				"dataset_bindings": {
					"ref_data": "{{reference_dataset_id}}"
				}
			}
		}
	]
}
```

### Run Pipeline Workflow with Runtime Parameters (Example)
```json
{
	"input_dataset_id": "primary-dataset-id",
	"session_id": "optional-session-id",
	"triggered_by": "manual",
	"runtime_parameters": {
		"period": "2026-03",
		"reference_dataset_id": "secondary-dataset-id",
		"dataset_bindings": {
			"ref_data": "secondary-dataset-id",
			"coa_data": "third-dataset-id"
		}
	}
}
```

### Runtime Parameter Notes
- `execution_config.default_parameters` are pipeline defaults.
- `runtime_parameters` override defaults per run.
- `dataset_bindings` maps SQL relation aliases (for example `ref_data`) to dataset IDs.
- String tokens like `"{{some_param}}"` in step bindings resolve from `runtime_parameters`.

### Clone Pipeline Workflow (Example)
```json
{
	"name": "Generic Multi-Dataset Workflow (copy)",
	"description": "Optional cloned variant",
	"workspace_id": "default"
}
```

### Run Artifact Package
- `GET /api/pipelines/runs/{run_id}/artifact` returns a standardized package:
	- run metadata
	- immutable pipeline snapshot
	- resolved runtime parameters
	- step results + execution log
	- output preview rows and columns

## 🗑️ Deprecated Endpoints (Removed in v0.2.0)
- ~~POST /dashboards~~ → Use `POST /visualizations/dashboards` instead
- ~~GET /dashboards~~ → Use `GET /visualizations/dashboards` instead
- ~~POST /widgets~~ → Use `POST /visualizations/widgets` instead

## Active Visualization Endpoints
- POST /visualizations/dashboards (requires editor)
- GET /visualizations/dashboards
- GET /visualizations/dashboards/{dashboard_id}
- POST /visualizations/dashboards/{dashboard_id}/share
- POST /visualizations/widgets (requires editor)
- PUT /visualizations/widgets/{widget_id} (requires editor)
- DELETE /visualizations/widgets/{widget_id} (requires editor)
- POST /visualizations/chart-data/{dataset_id}
- GET /visualizations/suggest-columns/{dataset_id}
- POST /visualizations/kpi/{dataset_id}
- POST /visualizations/themes
- GET /visualizations/themes

## Webhooks & Jobs
- POST /webhooks?target_url=...&event=... (requires editor)
- GET /webhooks
- POST /jobs?name=...&cron=...&action=... (requires editor)
- GET /jobs
- GET /connectors
- POST /connectors/import
	- supabase: {url, key, table, columns?, limit?}
	- inline_csv: {csv_text}
	- http_csv: {url}
	- sql_query: {connection_url, query|table, where?, updated_at_column?, updated_at_since?}
	- excel: {file_path|url, sheet_name?}
	- google_sheets: {sheet_id, gid?}
- POST /connectors/sync
	- payload: {connector, config, mode: pull|push, dataset_id?}
- GET /connectors/sync-status
- POST /users
- GET /users
- GET /plugins
- POST /plugins/load
- POST /plugins/enable
- POST /plugins/disable
- POST /workspaces
- GET /workspaces
- POST /workspaces/{workspace_id}/share
- POST /workspaces/{workspace_id}/unshare
- POST /workspaces/unshare-all
- POST /workspaces/purge-expired
- GET /workspaces/shared/{share_token}
- 429 returned if shared rate limit exceeded
- 403 returned if signature is invalid when SHARE_SIGNING_SECRET is set (sig query param)
- 403 returned if share scope does not match (scope query param)
