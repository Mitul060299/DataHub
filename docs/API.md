# API

- OpenAPI schema is available at /openapi.json
- Swagger UI is available at /docs

## Rate Limiting
All endpoints are protected by slowapi rate limiting.
- Default: 60 requests/minute per IP for authenticated endpoints
- File upload: 10 uploads/minute per IP
- NL pipeline edit: 15 requests/minute per IP
- Returns `429 Too Many Requests` with a `Retry-After` header when exceeded

## Auth
- POST /auth/login?username=USER&role=viewer|editor|admin
- GET /auth/oidc/login
- GET /auth/oidc/callback?code=AUTH_CODE

## Datasets
- POST /datasets/upload (multipart; validates format, size, and content)
- GET /datasets
- GET /datasets/compare-schemas?ids=id1,id2 — compare column schemas between two datasets (exact matches, column-only-in-A, column-only-in-B, fuzzy suggestions via rapidfuzz, alignment score 0-1)
- GET /datasets/{dataset_id}/lineage
- GET /datasets/{dataset_id}/suggest-columns?query=...&limit=...
- DELETE /datasets/{dataset_id} (requires editor)
- GET /datasets/{dataset_id}/export (requires viewer) — [sort_by, sort_dir, filter_col, filter_op, filter_val]
- GET /datasets/{dataset_id}/preview?offset=0&limit=50 — returns total_rows; supports sort/filter params
- GET /datasets/{dataset_id}/versions — list all version records for a dataset
- POST /datasets/{dataset_id}/upload-version — upload a new version of an existing dataset (bumps version_number)

## Profiling & Insights
- GET /profiling/{dataset_id}?columns=col1,col2
- GET /profiling/{dataset_id}/summary?column=colName&bins=10&top_n=10
- GET /profiling/{dataset_id}/correlations
- GET /insights/{dataset_id}?workspace_id=...
- GET /insights/{dataset_id}/actions

## AI Agents
- GET /agents/suggest/{dataset_id}?workspace_id=...
- POST /agents/chat/{dataset_id}?workspace_id=...
- POST /agents/feedback

## Transformations
- POST /transformations/recipes
- GET /transformations/recipes/{dataset_id}
- GET /transformations/recipes/{dataset_id}/versions
- POST /transformations/recipes/{dataset_id}/revert/{version_id}
- POST /transformations/apply/{dataset_id}

## Context
- GET /context/{workspace_id}
- POST /context
- GET /context/{workspace_id}/versions
- POST /context/{workspace_id}/revert/{version_id}

## Governance
- GET /governance/audit?action=...&actor=...&target=...&since_minutes=...&limit=...
- GET /governance/usage
- GET /governance/share-settings (requires admin)
- GET /governance/cache-stats (requires admin)
- POST /governance/audit

## Approvals
- POST /approvals
- GET /approvals?status=...&requester=...&resource_type=...&resource_id=...&limit=...
- POST /approvals/{request_id}/approve
- POST /approvals/{request_id}/reject

## Users & Preferences
- POST /users
- GET /users
- GET /users/me/audit-log?limit=50&offset=0&action=...&resource_type=... — paginated per-user audit trail
- GET /users/me/notification-preferences — return current notification preference flags
- PUT /users/me/notification-preferences — update notification preference flags
- GET /users/me/usage — monthly usage stats vs plan limits

Notification preference payload:
```json
{
  "pipeline_complete": true,
  "usage_warning": true,
  "weekly_digest": true
}
```

## Usage Limits
Hard limits enforced per plan on every upload, pipeline run, and AI call.

| Plan | AI calls/mo | Pipeline runs/mo | Datasets/mo | Storage |
|---|---|---|---|---|
| Free | 100 | 10 | 3 | 100 MB |
| Professional | 2,000 | 200 | 50 | 10 GB |
| Team | 10,000 | 1,000 | unlimited | 100 GB |
| Business | unlimited | unlimited | unlimited | unlimited |
| Enterprise | unlimited | unlimited | unlimited | unlimited |

Returns `429` with `{"error": "usage_limit_exceeded", "message": "..."}` when a limit is hit.
An email warning is sent when any metric crosses 80% of its limit (requires `RESEND_API_KEY`; respects user's `usage_warning` preference).

## Workspaces
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

## Projects
- POST /api/projects — create project (name, colour, icon, description, workspace_id)
- GET /api/projects — list current user's projects
- GET /api/projects/{project_id} — project detail with linked pipelines, dashboards, data sources
- PUT /api/projects/{project_id} — update project name, colour, icon, description
- DELETE /api/projects/{project_id} — delete project
- GET /api/workspace/recent — recent pipelines and dashboards across all projects

## Pipeline Workflows
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
- POST /api/pipelines/{pipeline_id}/nl-edit — rewrite pipeline steps from a plain-English prompt (Groq LLM, rate-limited 15/min)

NL edit request body:
```json
{ "prompt": "add a step that removes rows where revenue is null" }
```
The endpoint bumps the pipeline version_number and writes an audit log entry on success.

Supported NL-addressable operations (30+):
`fill_nulls`, `filter_nulls`, `drop_null_columns`, `cast_column_type`, `add_calculated_column`, `generate_id`, `drop_duplicates`, `deduplicate_by_column`, `fuzzy_deduplicate`, `trim_string_columns`, `rename_snake_case`, `filter_rows`, `filter_outliers`, `normalize_column`, `round_numeric`, `encode_categorical`, `parse_dates`, `sort_by_column`, `group_by_sum`, `group_by_count`, `group_by_mean`, `pivot_table`, `resample_timeseries`, `detect_date_gaps`, `normalize_timezone`, `validate_rules`, `sentiment`, `keywords`, `anomaly_detection`, `custom`

### Create Pipeline (Example)
```json
{
  "name": "Generic Multi-Dataset Workflow",
  "workspace_id": "default",
  "is_public": false,
  "execution_config": {
    "default_parameters": { "period": "2026-02", "variance_threshold": 0.01 }
  },
  "steps": [
    {
      "id": "step-1",
      "action_type": "transform",
      "description": "Join source relations and compute variance",
      "sql": "SELECT a.key, a.amount - b.amount AS variance FROM dataset a LEFT JOIN ref_data b ON a.key = b.key",
      "parameters": { "dataset_bindings": { "ref_data": "{{reference_dataset_id}}" } }
    }
  ]
}
```

### Run Pipeline (Example)
```json
{
  "input_dataset_id": "primary-dataset-id",
  "triggered_by": "manual",
  "runtime_parameters": {
    "period": "2026-03",
    "dataset_bindings": { "ref_data": "secondary-dataset-id" }
  }
}
```

### Clone Pipeline (Example)
```json
{ "name": "My Workflow (copy)", "workspace_id": "default" }
```

### Run Artifact Package
`GET /api/pipelines/runs/{run_id}/artifact` returns:
- Run metadata
- Immutable pipeline snapshot
- Resolved runtime parameters
- Step results + execution log
- Output preview rows and columns

## Dashboards (v2)
- POST /api/dashboards
- GET /api/dashboards
- GET /api/dashboards/{dashboard_id}
- PUT /api/dashboards/{dashboard_id}
- DELETE /api/dashboards/{dashboard_id}
- POST /api/dashboards/{dashboard_id}/share
- GET /api/dashboards/public/{share_token} — public read-only view
- GET /api/dashboards/{dashboard_id}/comments — list comments
- POST /api/dashboards/{dashboard_id}/comments — add a comment
- DELETE /api/dashboards/{dashboard_id}/comments/{comment_id} — delete own comment (returns 204)

## Visualizations (widget system)
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

## Templates
- GET /templates/dashboards
- POST /templates/dashboards/{template_id}/instantiate

## Real-time
- WS /realtime/presence?workspace_id=default&user=alice

## Billing
- GET /api/billing/plans — list available Razorpay subscription plans
- POST /api/billing/subscribe — create a Razorpay subscription for the current user
- POST /api/billing/webhook — Razorpay webhook receiver (HMAC-verified)

## Cron Jobs
- POST /api/cron/weekly-digest — trigger weekly digest emails for all opted-in users
  - Requires header `X-Cron-Secret: <CRON_SECRET>` (set in Render environment)
  - Intended for Render Cron Jobs or external schedulers (e.g. cron-job.org)
  - Respects each user's `weekly_digest` notification preference

## Reviews (homepage)
- POST /api/reviews — submit a review `{name, role?, rating (1-5), body}`; saved as `approved=false`
- GET /api/reviews — return all approved reviews

To publish a review in Supabase:
```sql
UPDATE reviews SET approved = true WHERE id = '<id>';
```

## Feedback (homepage)
- POST /feedback — submit contact/feedback form `{name, email, subject?, message}`
  - Saved to the `feedback` table in Postgres
  - Triggers a notification email to `mitul.srivastava000@gmail.com` via Resend

## Webhooks & Jobs
- POST /webhooks?target_url=...&event=... (requires editor)
- GET /webhooks
- POST /jobs?name=...&cron=...&action=... (requires editor)
- GET /jobs

## File Import
- POST /import/upload — upload a file to create a new dataset
  - Form fields: `file` (required), `dataset_name` (optional), `sheet` (optional, Excel only)
  - CSV: delimiter is auto-detected via `csv.Sniffer`; non-UTF-8 encodings are auto-converted
  - Excel: if `sheet` is omitted the first sheet is used
- POST /import/excel-sheets — list sheet names in an Excel file
  - Form field: `file` (required)
  - Returns: `{ "sheets": ["Sheet1", "Summary", ...] }`

## Connectors
- GET /connectors
- POST /connectors/import
  - supabase: `{url, key, table, columns?, limit?}`
  - inline_csv: `{csv_text}`
  - http_csv: `{url}`
  - sql_query: `{connection_url, query|table, where?, updated_at_column?, updated_at_since?}`
  - excel: `{file_path|url, sheet_name?}`
  - google_sheets: `{sheet_id, gid?}`
- POST /connectors/sync — `{connector, config, mode: pull|push, dataset_id?}`
- GET /connectors/sync-status

## Plugins
- GET /plugins
- POST /plugins/load
- POST /plugins/enable
- POST /plugins/disable

## Metrics & Health
- GET /health — health check
- GET /metrics — Prometheus metrics (requires `METRICS_BEARER_TOKEN` if set)

## Deprecated Endpoints (removed in v0.2.0)
- ~~POST /dashboards~~ → use `POST /visualizations/dashboards`
- ~~GET /dashboards~~ → use `GET /visualizations/dashboards`
- ~~POST /widgets~~ → use `POST /visualizations/widgets`

