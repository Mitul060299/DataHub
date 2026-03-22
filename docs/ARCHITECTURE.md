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
- **LLM provider:** Groq (`llama-3.3-70b-versatile`) via httpx — AI agent, NL pipeline editing
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

### S3 Object Storage
- Stores uploaded dataset Parquet artifacts.
- Serves signed URLs for query/read operations.

### Groq LLM (via httpx)
- Powers the AI chat agent (`POST /agents/chat/{dataset_id}`).
- Powers NL pipeline editing (`POST /api/pipelines/{id}/nl-edit`): accepts a plain-English prompt and returns rewritten pipeline steps (JSON-mode, rate-limited 15/min).
- Model: `llama-3.3-70b-versatile`.

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
- **Rate limiting:** slowapi — per-IP limits on all endpoints; stricter limits on upload and LLM routes.
- **File validation:** format allowlist, MIME check, content sniff on every upload.
- **Audit trail:** all POST/PUT/DELETE events captured; per-user audit log API + settings UI.
- **Observability:** `/metrics` (Prometheus); optional Grafana stack.

## Environment Variants
- **Managed cloud (current):** Vercel + Render + Supabase + Upstash + S3.
- **Local/self-hosted:** Docker Compose with local Postgres/Redis/Chroma and configurable storage providers.
- **Kubernetes:** Helm chart in `infra/helm/datahub`.
