# Database & Migrations

## Overview
DataHub persists users, workspaces, dashboards, contexts, dataset metadata, dataset rows, dataset chunks, and audit logs in PostgreSQL.

## Migrations
Alembic is configured in backend/alembic.ini.

Typical workflow:
- Set DATABASE_URL
- Run alembic revision --autogenerate -m "init"
- Run alembic upgrade head
