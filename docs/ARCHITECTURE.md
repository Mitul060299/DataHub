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
- **LLM provider:** Groq — two models in use:
  - `llama-3.3-70b-versatile` (default, `GROQ_MODEL`) — planner, executor, responder, reflect
  - `llama-3.1-8b-instant` (default, `GROQ_INTENT_MODEL`) — intent classifier (single-token output, cost-optimised)
- **Fuzzy string matching:** rapidfuzz ≥ 3.5.0 — used by `fuzzy_deduplicate` pipeline operation
- **CSV parsing:** Python stdlib `csv.Sniffer` — auto-detects delimiter (`,` / `\t` / `;` / `|` / `:`) and chardet for encoding conversion
- **Transactional email:** Resend — pipeline complete, usage warnings, weekly digest, feedback notifications
- **Rate limiting:** slowapi (Redis-backed) — per-IP, per-endpoint limits
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
- Startup safety-net DDL in `main.py` applies `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements for every migration, bypassing stalled Alembic runs on Render free-tier.

### Supabase
- Auth provider (email/password + OIDC).
- Postgres for all transactional data: users, workspaces, projects, datasets, pipelines, dashboards, comments, reviews, audit logs, billing, feedback.

### Upstash Redis
- Rate limit counters (slowapi).
- Query/result caching and transient job acceleration.

### DuckDB (embedded in backend)
- Executes analytical SQL against dataset Parquet files.
- Uses `httpfs` and storage credentials to query S3-backed data.
- **QueryFoldOptimizer** (`backend/app/services/pipeline_engine.py`) collapses adjacent compatible pipeline steps (filter, select, sort, etc.) into a single DuckDB SQL query, reducing round-trips.
- **Write-back** (`POST /api/pipelines/{id}/write-back`): pipeline output is issued as DML against the source connector using encrypted credentials stored in Postgres.

### S3 Object Storage
- Stores uploaded dataset Parquet artifacts.
- Serves signed URLs for query/read operations.

### Groq LLM (via httpx)
- Powers the AI chat agent (`POST /cleaning/datasets/{dataset_id}/chat` — streaming SSE).
- Powers NL pipeline editing (`POST /api/pipelines/{id}/nl-edit`): accepts a plain-English prompt and returns rewritten pipeline steps (JSON-mode, rate-limited 15/min).
- Main model: `llama-3.3-70b-versatile` (env: `GROQ_MODEL`).
- Intent classifier model: `llama-3.1-8b-instant` (env: `GROQ_INTENT_MODEL`) — cheaper single-token classification.

### AI Agent — LangGraph State Machine
The agent is a compiled LangGraph `StateGraph` defined in `backend/app/services/agent/graph.py`.

**8 nodes** (in execution order for a planning-path request):

| Node | File | Role |
|---|---|---|
| `context_loader` | `nodes/context_loader.py` | Entry point — loads dataset schema, glossary, and workspace context into state |
| `intent_classifier` | `nodes/intent_classifier.py` | Classifies the user turn into one of 14 intents using `llama-3.1-8b-instant` |
| `planner` | `nodes/planner.py` | Generates an ordered plan of execution steps from the intent + context |
| `plan_presenter` | `nodes/plan_presenter.py` | Presents the plan to the user and awaits approval (gate) |
| `execute_step` | `nodes/execute_step.py` | Executes one step of the plan via DuckDB / pandas; emits `agent.step.start` SSE before each step |
| `reflect` | `nodes/reflect.py` | On SQL failure: receives schema, column stats, operation name, and error to rewrite the SQL |
| `pipeline_recorder` | `nodes/pipeline_recorder.py` | Persists the completed pipeline steps to `pipelines_v2` |
| `responder` | `nodes/responder.py` | Formats the final response; `converse` intent includes active dataset schema so column questions get accurate answers |

**Conversation memory:** `conversation_history` (list of `{role, content}` turns) is sent by the frontend, threaded through `CleaningController` and `AgentGraphService`, and prepended to the LangGraph `messages` state as `HumanMessage`/`AIMessage` objects before each request.

**Conditional edge routers** (in `edges.py`):

| Router | Source node | Branches to |
|---|---|---|
| `route_intent` | `intent_classifier` | `planner` (planning intents) · `execute_step` (auto-execute: validate/summarise) · `responder` (conversational) |
| `route_after_present` | `plan_presenter` | `execute_step` (approved) · `END` (rejected/no approval) |
| `route_after_execute` | `execute_step` | `reflect` (step done) · `execute_step` (loop to next step) · `pipeline_recorder` (all steps done) |
| `route_after_reflect` | `reflect` | `execute_step` (retry) · `pipeline_recorder` (accept result) |

Entry point: `context_loader`. Terminal: `responder → END`.

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
| Cache | Redis + Postgres fallback | Hot query responses; rate limit counters |

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
- **Rate limiting:** slowapi — per-user (JWT sub) or per-IP fallback; stricter limits on upload, LLM, and AI chat routes.
  - Default: 60/min
  - Upload: 10/min
  - NL pipeline edit: 15/min
  - AI chat SSE (`/cleaning/datasets/{id}/chat`): 20/min
- **File validation:** format allowlist, MIME check, content sniff on every upload; `csv.Sniffer` for delimiter detection; chardet for encoding detection and UTF-8 conversion.
- **Audit trail:** all POST/PUT/DELETE events captured; per-user audit log API + settings UI.
- **Observability:** `/metrics` (Prometheus); optional Grafana stack.

## Environment Variants
- **Managed cloud (current):** Vercel + Render + Supabase + Upstash + S3.
- **Local/self-hosted:** Docker Compose with local Postgres/Redis/Chroma and configurable storage providers.
- **Kubernetes:** Helm chart in `infra/helm/datahub`.
