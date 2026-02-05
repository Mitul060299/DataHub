# Architecture

## Overview
DataHub is a modular platform with a FastAPI backend and a React frontend. Storage uses PostgreSQL for transactional data and Redis for caching. Vector storage for business context is provided via Chroma (Phase 2+).

## Services
- Backend API: ingestion, profiling, transformations, auth, plugins
- Frontend UI: data table, insights, dashboards
- Postgres: metadata, recipes, user/workspace records
- Redis: cache, sessions
- Chroma: semantic memory storage

## Data Flow
1. User uploads dataset or connects to source.
2. Backend profiles and stores metadata.
3. AI assistants suggest transformations (Phase 2).
4. User approves and applies recipes.
5. Insights and dashboards are generated.

## Security
- JWT auth and RBAC scaffolding (Phase 3)
- Audit logs and compliance modules planned (Phase 5)
