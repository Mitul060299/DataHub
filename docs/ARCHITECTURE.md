# Architecture

## Overview
DataHub is a modular analytics platform with a React frontend and FastAPI backend.

Current production-oriented stack:
- Frontend: React + Vite, deployed on Vercel
- Backend API: FastAPI, deployed on Render
- Identity + primary relational DB: Supabase Auth + Supabase Postgres
- Cache: Redis (Upstash in managed deployments via REDIS_URL)
- SQL analytics engine: in-process DuckDB
- Object storage: Amazon S3 (default storage provider)
- Optional context memory: Chroma (when configured)

## Core Services
- Frontend (Vercel)
	- Handles auth UX, dataset/workspace UI, dashboards, and API orchestration.
	- Uses Supabase client SDK for session lifecycle and token refresh.
- Backend (Render)
	- FastAPI service for ingestion, profiling, transformations, dashboards, sharing, governance, and billing-related APIs.
	- Validates JWTs and enforces role-based access.
- Supabase
	- Auth provider (email/password + OAuth providers in app flow).
	- Postgres for users, workspaces, datasets metadata, dashboards, contexts, audit logs, caches, and workflow state.
- Upstash Redis (Redis-compatible)
	- Query/result caching and transient job/cache acceleration.
- DuckDB (embedded in backend)
	- Executes analytical SQL against dataset parquet files.
	- Uses `httpfs` and storage credentials to query object storage-backed data.
- S3 object storage
	- Stores uploaded dataset parquet artifacts and serves signed URLs for query/read operations.

## Data Storage Model
- Transactional/metadata layer: Supabase Postgres
	- User/workspace records, dataset metadata, recipes, dashboards, approvals, shares, audit logs.
- File/object layer: S3
	- Dataset binaries/parquet and storage-tiered objects.
- Compute/query layer: DuckDB
	- Reads parquet from object storage and runs SQL transformations/previews.
- Cache layer: Redis + Postgres fallback
	- Hot query responses in Redis, with persisted query cache metadata/results in Postgres.

## Request and Data Flow
1. User authenticates in frontend via Supabase Auth.
2. Frontend sends bearer token to backend APIs.
3. Backend validates token/claims and applies RBAC checks.
4. Dataset imports are normalized and written to object storage (S3), while dataset metadata is stored in Supabase Postgres.
5. DuckDB executes profiling/query/transformation SQL over stored parquet data.
6. Query responses are cached in Redis; cache records and usage metadata are persisted in Postgres.
7. Dashboards, shares, approvals, and audit events are served from backend APIs and persisted in Postgres.

## Security and Operations
- Authentication: Supabase JWT-based auth (plus configurable OIDC settings).
- Authorization: backend-enforced RBAC (viewer/editor/admin style roles).
- Auditability: API mutation events captured in audit logs.
- Observability: backend exposes `/metrics`; Prometheus/Grafana stack can be enabled for monitoring.

## Environment Variants
- Managed cloud (current): Vercel + Render + Supabase + Upstash + S3.
- Local/self-hosted: Docker Compose with local Postgres/Redis/Chroma and configurable storage providers.
- Storage provider abstraction supports S3 by default, with optional R2/GCS/Azure/local modes.
