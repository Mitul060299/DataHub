# DataHub

Modern, AI-assisted data analytics and transformation platform.

## MVP Scope (Phase 1)
- FastAPI backend with dataset import, profiling, and transformation recipe endpoints.
- React frontend shell with table preview and basic insights placeholders.
- Docker Compose for backend + Postgres + Redis + optional Chroma.
- Sample dataset for onboarding.

## Quick Start (Local)
1. Copy environment file:
   - Create .env from .env.example and fill values.
2. Start services:
   - Use Docker Compose to bring up Postgres, Redis, Chroma, backend, and frontend.
3. Open API docs:
   - Backend exposes OpenAPI at /docs.

## Production Setup
- Use .env.production.example as a template for production secrets and CORS.
- Build and run production stack:
   - docker compose -f docker-compose.prod.yml up -d --build
- Shared dashboards can be accessed via /shared/{token} when enabled
- Shared workspaces can be accessed via /shared-workspace/{token}

## Repository Layout
- backend/ FastAPI app and services
- frontend/ React app (Vite + Ant Design)
- infra/ deployment artifacts
- docs/ architecture, roadmap, onboarding, API notes
- samples/ sample datasets

## Notes
- AI integrations are stubbed for MVP and will be expanded in Phase 2.
- Replace placeholder secrets and tokens before production.

## Platform Overview
See docs/PLATFORM_OVERVIEW.md for capabilities, workflow, and deployment overview.

## Compliance
See docs/COMPLIANCE.md for GDPR/SOC2 readiness notes.

## Database
See docs/DB.md for Postgres persistence and migrations.
