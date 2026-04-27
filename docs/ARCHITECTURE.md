# Architecture

## Overview
DataHub is a modular analytics platform with a React frontend and FastAPI backend.

Current production stack:
- **Frontend:** React + Vite, deployed on Vercel
- **Backend API:** FastAPI (Python 3.11), deployed on Render
- **Identity + primary relational DB:** Supabase Auth + Supabase Postgres
- **Cache:** Redis (Upstash in managed deployments via `REDIS_URL`)
- **SQL analytics engine:** in-process DuckDB
- **Object storage:** Amazon S3 (default storage provider)
- **LLM provider:** Groq — two models are used: a large planning/execution model and a lightweight intent classifier
- **Fuzzy string matching:** similarity library — used by `fuzzy_deduplicate` pipeline operation
- **CSV parsing:** delimiter auto-detection — detects `,` / `\t` / `;` / `|` / `:` and handles encoding conversion automatically
- **Transactional email:** Resend — pipeline complete, usage warnings, weekly digest, feedback notifications
- **Rate limiting:** per-IP, per-endpoint rate limiting on all API routes
- **Billing:** Razorpay — subscription plans, HMAC-verified webhooks
- **Optional context memory:** Chroma

## Core Services

### Frontend (Vercel)
- Handles auth UX, dataset/workspace UI, dashboards, pipeline builder, settings, and API orchestration.
- Uses Supabase client SDK for session lifecycle and token refresh.
- Key pages: workspace explorer, pipeline editor (with AI edit panel), dashboard builder, settings (notification prefs, audit log, usage meter, billing).

### Backend (Render)
- FastAPI service for ingestion, profiling, transformations, dashboards, sharing, governance, billing, and email.
- Validates Supabase JWTs and enforces role-based access (viewer / editor / admin).
- Startup DDL guard applies schema changes idempotently on every deploy to handle migration edge cases.

### Supabase
- Auth provider (email/password + OIDC).
- Postgres for all transactional data: users, workspaces, projects, project_members, datasets, pipelines, dashboards, comments, reviews, audit logs, billing, feedback.

### Collaboration Model
DataHub is migrating from workspace-level to **project-level** collaboration:
- `project_members` (added in alembic 0063) carries email, role (`editor`/`viewer`), status, invite_token. Owner is implicit via `projects.user_id`.
- Billing flows through the **project owner's** plan — invitees do not consume their own seats; the project owner does.
- Plan caps: `max_project_members` (members per project) and `max_collaborative_projects` (projects with ≥1 member).
- Seat limit is the union of `workspace_members` + `project_members` emails per owner (during the migration window).
- `workspace_members` retained alongside `project_members` until Phase 6 dual-read closes; both code paths run in parallel with no functional regression.

### Upstash Redis
- Rate limit counters.
- Query/result caching and transient job acceleration.

### DuckDB (embedded in backend)
- Executes analytical SQL against dataset Parquet files.
- Queries S3-backed data using storage credentials.
- A query optimization layer collapses adjacent compatible pipeline steps into a single SQL query, reducing round-trips.
- **Write-back**: pipeline output can be written back to the source connector using encrypted credentials stored in Postgres.
- **Thread safety**: the global singleton (`DuckDBService._db`) is initialised with a double-checked lock (`_db_lock: threading.Lock`) so concurrent startup requests cannot race and produce a dead connection handle.
- **503 safety**: if DuckDB preview fails, the dataset endpoint returns HTTP 503 immediately instead of falling back to a full `pd.read_parquet()` load that would OOM-kill the process.

### S3 Object Storage
- Stores uploaded dataset Parquet artifacts and user-saved checkpoints.
- Serves signed URLs for query/read operations.
- All CSV uploads are immediately converted to Parquet and stored here; `DatasetMetaDB.storage_path` is set so previews take the fast DuckDB path instead of the DB-chunk fallback.

### Groq LLM
- Powers the AI chat agent (streaming SSE).
- Powers NL pipeline editing: accepts a plain-English prompt and returns rewritten pipeline steps.
- Two models in use: a large model for planning, execution, and responses; a lightweight model for intent classification.

### AI Agent — State Machine
The agent is a 9-node state machine pipeline.

**Nodes** (in execution order for a planning-path request):

| Node | Role |
|---|---|
| `context_loader` | Entry point — loads dataset schema, glossary, and workspace context into state |
| `intent_classifier` | Classifies the user turn into one of 15 intents (including `clarify`) |
| `clarify_step` | Asks exactly one focused clarifying question with concrete examples; sets `needs_clarification: True` and streams the question via SSE; graph ends at `__end__` waiting for the user's reply |
| `planner` | Generates an ordered plan of execution steps from the intent + context; if `plan_pending_modification=True`, incorporates the existing plan JSON and user modification instruction |
| `plan_presenter` | Presents the plan to the user and awaits approval (gate) |
| `execute_step` | Executes one step of the plan; emits a live progress event before each step |
| `reflect` | On SQL failure: rewrites the SQL using schema, column stats, and error context |
| `pipeline_recorder` | Persists the completed pipeline steps |
| `responder` | Formats the final response; includes one proactive insight and a contextual follow-up; `converse` intent answers column questions using the active dataset schema |

**Conversation memory:** Prior conversation turns are carried by the frontend and prepended to the agent state before each request.

**Conditional routing** handles branching between intent classification, clarification, plan approval, step execution, error reflection, and response generation.

**Plan modification:** The `plan_pending_modification` flag threads from the frontend request body through the router → controller → agent graph service → initial state → planner node, enabling the planner to revise an existing plan rather than generate a new one.

### Resend (transactional email)
- `send_pipeline_complete(user, pipeline)` — sent when a pipeline run finishes (respects `pipeline_complete` user pref).
- `send_usage_warning(user, field, pct)` — sent at 80% of any plan limit (respects `usage_warning` pref).
- `weekly_digest_service.send_weekly_digests(db)` — per-user 7-day activity summary, triggered by cron endpoint.
- Feedback notification — sent to owner on homepage form submission.

### Razorpay (billing)
- `GET /api/billing/plans` lists available plans.
- `POST /api/billing/subscribe` creates a subscription.
- `POST /api/billing/webhook` receives plan-change events (HMAC-verified).

## Data Storage Model
| Layer | Technology | What's stored |
|---|---|---|
| Transactional/metadata | Supabase Postgres | Users, workspaces, projects, dataset metadata, recipes, pipelines, dashboards, comments, reviews, audit logs, billing, feedback |
| File/object | S3 | Uploaded datasets (Parquet) + user-saved checkpoints |
| Compute/query | DuckDB | In-process session tables for pipeline step outputs; previews against S3 Parquet |
| Cache | Redis | Hot query responses; rate limit counters |

## Parquet-First Ingest (Phase 1)

Every CSV upload is immediately converted to Parquet and uploaded to S3 as a best-effort step inside `upload_dataset()`. If the S3 upload succeeds, `DatasetMetaDB.storage_path` is set and `preview_dataset` takes the fast DuckDB streaming path (no full file load). If conversion fails (e.g. no S3 credentials in local dev), the endpoint falls back gracefully to the existing DB-chunk path — no error is surfaced to the user.

This makes every uploaded CSV a first-class dataset: DuckDB can page through it with bounded memory, and the query cache can use it as a base for NL agent operations.

## Explicit Checkpoint Pattern (Phase 2)

Pipeline steps executed by the AI agent no longer auto-upload results to S3 or auto-create `DatasetMetaDB` rows. Instead:

- Each step's output is registered as an in-memory DuckDB table inside the user's session (identified by `session_table_name` in the execution result).
- `PipelineStepDB` rows are still written (audit trail), but `ArtifactDB` rows are **not** created automatically.
- When a user explicitly clicks **Save Checkpoint** on a step result, the frontend calls `POST /api/artifacts/save-checkpoint` with `{ session_id, table_name, artifact_name }`. The backend materialises the DuckDB table to Parquet, uploads it to S3, and creates both an `ArtifactDB` row and a `DatasetMetaDB` row.
- Only checkpointed outputs appear in the datasets list and artifact panel — no ephemeral step outputs pollute the dataset catalogue.

This eliminates the per-step S3 write spike (memory + latency) and gives users full control over which intermediate results become permanent.

## Request and Data Flow
1. User authenticates via Supabase Auth (browser).
2. Frontend sends Bearer token to backend APIs.
3. Backend validates JWT claims and applies RBAC checks.
4. CSV uploads are parsed, converted to Parquet (best-effort), and stored in S3; `DatasetMetaDB` is written with the resulting `storage_path`.
5. DuckDB streams pages from S3 Parquet for previews; DB-chunk fallback applies if `storage_path` is absent.
6. AI agent pipeline steps materialise results as named DuckDB session tables; no automatic S3 upload occurs per step.
7. User clicks **Save Checkpoint** → `POST /api/artifacts/save-checkpoint` → DuckDB table serialised to Parquet → S3 upload → `ArtifactDB` + `DatasetMetaDB` created.
8. Query responses cached in Redis; cache metadata persisted in Postgres.
9. Dashboards, shares, approvals, and audit events served from backend and persisted in Postgres.
10. Email notifications dispatched asynchronously via Resend (`fire-and-forget` asyncio tasks).
11. Usage is tracked per-user per-month in `user_usage`; limits enforced on every relevant API call.

## Security and Operations
- **Authentication:** Supabase JWT (configurable OIDC).
- **Authorisation:** backend-enforced RBAC (viewer/editor/admin).
- **Rate limiting:** per-user (JWT sub) or per-IP fallback; stricter limits on upload, LLM, and AI chat routes.
- **File validation:** format allowlist, MIME check, and content sniff on every upload; delimiter and encoding auto-detection applied before parse.
- **Audit trail:** all POST/PUT/DELETE events captured; per-user audit log API + settings UI.
- **Observability:** Prometheus metrics endpoint (token-protected); optional Grafana stack.

## Environment Variants
- **Managed cloud (current):** Vercel + Render + Supabase + Upstash + S3.
- **Local/self-hosted:** Docker Compose with local Postgres/Redis/Chroma and configurable storage providers.
- **Kubernetes:** Helm chart in `infra/helm/datahub`.
