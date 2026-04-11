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
- Postgres for all transactional data: users, workspaces, projects, datasets, pipelines, dashboards, comments, reviews, audit logs, billing, feedback.

### Upstash Redis
- Rate limit counters.
- Query/result caching and transient job acceleration.

### DuckDB (embedded in backend)
- Executes analytical SQL against dataset Parquet files.
- Queries S3-backed data using storage credentials.
- A query optimization layer collapses adjacent compatible pipeline steps into a single SQL query, reducing round-trips.
- **Write-back**: pipeline output can be written back to the source connector using encrypted credentials stored in Postgres.

### S3 Object Storage
- Stores uploaded dataset Parquet artifacts.
- Serves signed URLs for query/read operations.

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
| File/object | S3 | Dataset binaries / Parquet |
| Compute/query | DuckDB | Executes SQL over Parquet; profiling, transformations, previews |
| Cache | Redis | Hot query responses; rate limit counters |

## Request and Data Flow
1. User authenticates via Supabase Auth (browser).
2. Frontend sends Bearer token to backend APIs.
3. Backend validates JWT claims and applies RBAC checks.
4. Dataset imports are normalised and written to S3 (Parquet); metadata stored in Postgres.
5. DuckDB executes profiling/query/transformation SQL over stored Parquet.
6. Query responses cached in Redis; cache metadata persisted in Postgres.
7. Dashboards, shares, approvals, and audit events served from backend and persisted in Postgres.
8. Email notifications dispatched asynchronously via Resend (`fire-and-forget` asyncio tasks).
9. Usage is tracked per-user per-month in `user_usage`; limits enforced on every relevant API call.

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
