# API

## Rate Limiting
All endpoints are protected by rate limiting keyed per authenticated user (JWT `sub` claim) with IP fallback for unauthenticated routes.
- Returns `429 Too Many Requests` with a `Retry-After` header when exceeded

## Auth
- POST /auth/login?username=USER&role=viewer|editor|admin
- GET /auth/oidc/login
- GET /auth/oidc/callback?code=AUTH_CODE

### SAML 2.0 SSO (Enterprise)
- GET /auth/saml/metadata?org_id= — SP metadata XML; give this URL to your IdP admin
- GET /auth/saml/login?org_id= — redirect user to IdP SSO URL
- POST /auth/saml/acs — Assertion Consumer Service (IdP POST-binding callback); parses + verifies SAML Response, provisions user, returns redirect with app token in fragment
- GET /auth/saml/config — fetch current IdP config for caller's org (Enterprise plan required)
- POST /auth/saml/config — create or update IdP config; body: `{ entity_id, sso_url, slo_url?, certificate, sp_entity_id?, attribute_email, attribute_name?, name_id_format, is_active }` (Enterprise plan required)
- DELETE /auth/saml/config — remove IdP config (Enterprise plan required)

## Datasets
- POST /datasets/upload (multipart; validates format, size, and content)
- GET /datasets
- GET /datasets/compare-schemas?ids=id1,id2 — compare column schemas between two datasets (exact matches, column-only-in-A, column-only-in-B, fuzzy column suggestions, alignment score 0-1)
- GET /datasets/{dataset_id}/lineage
- GET /datasets/{dataset_id}/suggest-columns?query=...&limit=...
- DELETE /datasets/{dataset_id} (requires editor)
- GET /datasets/{dataset_id}/export (requires viewer) — [sort_by, sort_dir, filter_col, filter_op, filter_val]
- GET /datasets/{dataset_id}/preview?offset=0&limit=50 — returns total_rows; supports sort/filter params
- GET /datasets/{dataset_id}/versions — list all version records for a dataset
- POST /datasets/{dataset_id}/upload-version — upload a new version of an existing dataset (bumps version_number)
- GET /datasets/{dataset_id}/presigned-url — returns `{ url, expires_at, row_count, columns }` for DuckDB-WASM client-side queries; rate-limited 60 req/min; requires `storage_path` to be an S3 path

## Profiling & Insights
- GET /profiling/{dataset_id}?columns=col1,col2
- GET /profiling/{dataset_id}/summary?column=colName&bins=10&top_n=10
- GET /profiling/{dataset_id}/correlations
- GET /insights/{dataset_id}?project_id=...
- GET /insights/{dataset_id}/actions

## AI Chat (Streaming)
- `POST /cleaning/datasets/{dataset_id}/chat` — SSE streaming endpoint; rate-limited 20/min per user

Request body (`CommandRequest`):
```json
{
  "message": "Remove duplicate rows",
  "session_id": "uuid",
  "project_id": "uuid",
  "pipeline_steps": [],
  "plan_approved": false,
  "plan_pending_modification": false,
  "pending_plan": [],
  "conversation_history": [
    {"role": "user", "content": "Previous question"},
    {"role": "assistant", "content": "Previous answer"}
  ],
  "secondary_dataset_ids": []
}
```

`plan_pending_modification` — set to `true` when the user clicks **Modify** on an existing plan card. The `pending_plan` field must carry the existing plan steps. The planner node will revise the plan rather than generate a new one.

SSE event types emitted:
- `agent.thinking` — node began processing
- `agent.plan` — plan ready for user approval; contains `plan[]` and `plan_type` (`"linear"` or `"dag"`)
- `agent.step.start` — step about to execute; contains `step_number`, `operation`, `description`, `total_steps`
- `agent.step.done` — step completed; contains `step`, `operation`, `row_count_before`, `row_count_after`, `execution_time_ms`
- `agent.step.retry` — reflect node rewrote the SQL; contains `attempt` count
- `agent.step.error` — step failed after reflect/retry
- `agent.query_results` — read-only SQL results; contains `results[]` and `operation`
- `column_added` — calculated column created; contains `column` object
- `tile_created` — chart tile created on a dashboard; contains `tile` object
- `agent.artifact` — CSV/Parquet/Excel export ready; contains `artifact_url` or `artifact_s3_key`
- `agent.done` — run complete; contains `response`, `intent`, `run_id`, `output_dataset_id`, `run_steps[]`, `pipeline_steps[]`. When `intent` is `"clarify"` the response is a clarifying question and no execution steps were run.
- `agent.error` — unrecoverable error; contains `error` string

## AI Agents (legacy non-streaming)
- GET /agents/suggest/{dataset_id}?project_id=...
- POST /agents/chat/{dataset_id}?project_id=... *(non-streaming; prefer `/cleaning/datasets/{id}/chat`)*
- POST /agents/feedback

## Transformations
- POST /transformations/recipes
- GET /transformations/recipes/{dataset_id}
- GET /transformations/recipes/{dataset_id}/versions
- POST /transformations/recipes/{dataset_id}/revert/{version_id}
- POST /transformations/apply/{dataset_id}

## Context
- GET /context/{project_id}
- POST /context
- GET /context/{project_id}/versions
- POST /context/{project_id}/revert/{version_id}

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
- GET /users/me/gdpr-export — GDPR Article 20 data portability; returns JSON with profile, projects, datasets, pipelines, dashboards, audit log, feedback, usage history
- DELETE /users/me/gdpr-erase — GDPR Article 17 right to erasure; cascades delete across all user-owned tables, queues S3 objects for async deletion, anonymises audit log actor to `[deleted]`

## Organization Branding (Business / Enterprise)
- GET /organization/branding — fetch white-label branding for caller's org
- PUT /organization/branding — create or update branding; body: `{ product_name?, logo_url?, favicon_url?, primary_color?, support_email?, hide_datahub_branding?, custom_css? }`; `hide_datahub_branding` requires Business plan; `custom_css` requires Enterprise plan
- DELETE /organization/branding — remove branding row, reverts to DataHub defaults

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

## Projects
- POST /projects
- GET /projects
- POST /projects/{project_id}/share
- POST /projects/{project_id}/unshare
- POST /projects/unshare-all
- POST /projects/purge-expired
- GET /projects/shared/{share_token}
- 429 returned if shared rate limit exceeded
- 403 returned if signature is invalid when SHARE_SIGNING_SECRET is set (sig query param)
- 403 returned if share scope does not match (scope query param)

## Projects
- POST /api/projects — create project (name, colour, icon, description, project_id)
- GET /api/projects — list current user's projects
- GET /api/projects/{project_id} — project detail with linked pipelines, dashboards, data sources
- PUT /api/projects/{project_id} — update project name, colour, icon, description
- DELETE /api/projects/{project_id} — delete project
- GET /api/project/recent — recent pipelines and dashboards across all projects

## Project Members
Project-level collaboration. Billing flows through the project owner's plan.
- GET /projects/{project_id}/members — list members (owner or any active member)
- POST /projects/{project_id}/members — invite by email + role (`editor`|`viewer`); owner-only. Enforces `max_project_members`, `max_collaborative_projects`, and seat limits per the owner's plan. Returns inline error code `member_limit_reached` or `collaborative_project_limit_reached` when caps hit.
- PUT /projects/{project_id}/members/{member_id} — change role; owner-only.
- DELETE /projects/{project_id}/members/{member_id} — remove member; owner or self.
- GET /projects/{project_id}/member-usage — owner-id, plan, member count, owner usage snapshot.
- GET /invites/projects/{token}/accept — invite acceptance landing; redirects to `/projects/{project_id}?joined=1`.

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
  "project_id": "default",
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
{ "name": "My Workflow (copy)", "project_id": "default" }
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
- WS /realtime/presence?project_id=default&user=alice

## Billing
- GET /api/billing/plans — list available Razorpay subscription plans
- POST /api/billing/subscribe — create a Razorpay subscription for the current user
- POST /api/billing/webhook — Razorpay webhook receiver (HMAC-verified)

## Cron Jobs
- POST /api/cron/weekly-digest — trigger weekly digest emails for all opted-in users
  - Requires a pre-shared authorization header (value configured via `CRON_SECRET` environment variable)
  - Intended for external schedulers
  - Respects each user's `weekly_digest` notification preference

## Reviews (homepage)
- POST /api/reviews — submit a review `{name, role?, rating (1-5), body}`; pending moderation
- GET /api/reviews — return all approved reviews

To publish a review in Supabase:
```sql
UPDATE reviews SET approved = true WHERE id = '<id>';
```

## Feedback (homepage)
- POST /feedback — submit contact/feedback form `{name, email, subject?, message}`
  - Saved to the `feedback` table in Postgres

## Cross-Pipeline Inputs & Branching

### Step Snapshots
- `GET /users/me/pipeline-steps/snapshots` — list every pipeline step (for the current user) that has a saved Parquet snapshot, grouped by dataset. Used to populate the "⊕ Cross input" selector.
  - Returns: `[{ step_id, step_number, operation, description, row_count_after, snapshot_path, dataset_id, dataset_name, created_at }]`

### Cross-Pipeline Inputs
Link a snapshot from another pipeline into the current dataset so the AI agent can JOIN/reconcile against it.

- `POST /datasets/{dataset_id}/cross-inputs` — add a cross-pipeline input
  - Body: `{ source_step_id: string, alias: string }`
  - `alias` is the SQL alias the agent will use (e.g. `customers_step2`)
  - Returns: `CrossPipelineInputOut`

- `GET /datasets/{dataset_id}/cross-inputs` — list all linked cross-pipeline inputs for this dataset
  - Returns: `CrossPipelineInputOut[]` (enriched with source dataset name, step number, description)

- `DELETE /datasets/{dataset_id}/cross-inputs/{input_id}` — remove a linked cross-pipeline input

### Pipeline Branching (Fork)
Create a new branch dataset from any step in an existing pipeline.

- `POST /pipeline-steps/{step_id}/fork-to-dataset` — fork pipeline at the given step
  - Body: `{ name?: string, project_id?: string }`
  - Creates a new `DatasetMetaDB` pointing at the step's Parquet snapshot (no file copy)
  - Copies all pipeline steps up to (and including) the chosen step to the new dataset
  - Returns: `{ dataset_id, dataset_name, forked_from_step_id, steps: [...] }`

- `GET /pipeline-steps/{step_id}/forks` — list datasets previously forked from this step
  - Returns: `[{ dataset_id, dataset_name, forked_at }]`

### AI Agent Intents
Two new intents are available in the AI chat:
- `cross_join` — triggered when the user says "join with {alias}", "merge with {alias}", "combine with {alias}"; the alias must match a linked cross-pipeline input
- `branch` — triggered when the user says "branch from step N", "fork at step 3", "create a parallel pipeline"; the agent calls `branch_handler` and returns a `branch_result` with the new dataset info
  - Triggers a notification email to `mitul.srivastava000@gmail.com` via Resend

## Webhooks & Jobs
- POST /webhooks?target_url=...&event=... (requires editor)
- GET /webhooks
- POST /jobs?name=...&cron=...&action=... (requires editor)
- GET /jobs

## File Import
- POST /import/upload — upload a file to create a new dataset
  - Form fields: `file` (required), `dataset_name` (optional), `sheet` (optional, Excel only)
  - CSV: delimiter and encoding are auto-detected; non-UTF-8 encodings are auto-converted
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
- GET /metrics — Prometheus metrics endpoint (token-protected)

## Deprecated Endpoints (removed in v0.2.0)
- ~~POST /dashboards~~ → use `POST /visualizations/dashboards`
- ~~GET /dashboards~~ → use `GET /visualizations/dashboards`
- ~~POST /widgets~~ → use `POST /visualizations/widgets`

