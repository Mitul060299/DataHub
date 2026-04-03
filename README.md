# DataHub

Modern, AI-assisted data analytics and transformation platform.

## Current Production Stack
- Frontend: React + Vite on Vercel
- Backend: FastAPI on Render
- Auth + primary relational database: Supabase Auth + Supabase Postgres
- Cache: Redis (typically Upstash in managed deployments)
- SQL analytics engine: DuckDB (embedded in backend)
- Object storage: Amazon S3 (default storage provider)
- LLM provider: Groq — `llama-3.3-70b-versatile` (planning/execution, `GROQ_MODEL`) + `llama-3.1-8b-instant` (intent classification, `GROQ_INTENT_MODEL`)
- Fuzzy matching: rapidfuzz ≥ 3.5.0
- Optional context memory: Chroma

## Current Scope
- FastAPI backend with dataset import (CSV auto-delimiter-sniff, multi-sheet Excel, encoding auto-fix), profiling, 30+ transformation operations, pipeline NL editing (Groq), dashboards (Canvas v2.1 with KPI/slicer tiles), sharing, governance, billing (Razorpay), and 308-test suite.
- React frontend for auth, dataset exploration, pipeline builder, AI chat panel (streaming SSE, Markdown, multi-turn memory, live step progress, secondary dataset picker, expand/copy results), insights, dashboard canvas, and settings (usage meter, audit log, billing).
- DB connectors live: PostgreSQL, MySQL, SQLite, MSSQL, Oracle (Professional); Snowflake, Redshift, BigQuery (Team).
- Schema comparison API (`GET /datasets/compare-schemas`) for exact/fuzzy column alignment.
- Query folding optimiser and write-back capability.
- Docker Compose support for local development with Postgres + Redis + optional Chroma.
- Sample dataset for onboarding.

## Quick Start (Local)
1. Copy environment file:
   - Create .env from .env.example and fill values.
2. Start services:
   - Use Docker Compose to bring up Postgres, Redis, optional Chroma, backend, and frontend.
3. Open API docs:
   - Backend exposes OpenAPI at /docs.

## Production Setup
- Use .env.production.example as a template for production secrets and CORS.
- Build and run production stack:
   - docker compose -f docker-compose.prod.yml up -d --build
- Managed deployment reference:
   - Frontend on Vercel, backend on Render, Supabase for auth/Postgres, Redis via Upstash, and S3 for dataset objects.
- Shared dashboards can be accessed via /shared/{token} when enabled
- Shared workspaces can be accessed via /shared-workspace/{token}

## Repository Layout
- backend/ FastAPI app and services
- frontend/ React app (Vite + Ant Design)
- infra/ deployment artifacts
- docs/ architecture, roadmap, onboarding, API notes
- samples/ sample datasets

## Notes
- Some ML/AutoML service modules are still stubbed and intended for further implementation.
- Replace placeholder secrets and tokens before production.

## Pricing QA Automation
- Pull requests to `main` that change pricing/entitlement paths run the pricing matrix workflow in `.github/workflows/pricing-matrix.yml`.
- CI generates and uploads these artifacts:
   - `docs/PRICING_MATRIX_REPORT.md` (offline capability + guard wiring checks)
   - `docs/PRICING_LIVE_MATRIX_REPORT.md` (live HTTP entitlement matrix)
- For local reproduction, follow `docs/PRICING_QA_CHECKLIST.md`.

## Platform Overview
See docs/PLATFORM_OVERVIEW.md for capabilities, workflow, and deployment overview.

## Compliance
See docs/COMPLIANCE.md for GDPR/SOC2 readiness notes.

## Database
See docs/DB.md for Postgres persistence and migrations.
