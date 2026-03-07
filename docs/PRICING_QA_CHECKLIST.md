# Pricing Tier QA Checklist

Use this checklist to validate the five-tier pricing model end to end.

## Scope

This checklist covers:
- Backend entitlement and limits enforcement
- Frontend upgrade prompts and pricing flow
- Upgrade/downgrade behavior for non-enterprise plans

## Preconditions

- Backend running with current migrations.
- Frontend running against the same backend.
- Test users exist with plans: `Free`, `Professional`, `Team`, `Business`, `Enterprise`.
- Each test user can authenticate and send `Authorization: Bearer <token>`.

## Tier Expectations (Quick Matrix)

| Capability | Free | Professional | Team | Business | Enterprise |
|---|---|---|---|---|---|
| CSV/Excel upload | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON/Parquet upload | ❌ | ✅ | ✅ | ✅ | ✅ |
| DB connectors (Postgres/MySQL/MongoDB/MSSQL) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Enterprise connectors (Snowflake/BigQuery/Redshift/etc.) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Scheduling (jobs/pipelines) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Dashboard publish/share | ❌ | ✅ | ✅ | ✅ | ✅ |
| Workspace sharing | ❌ | ❌ | ✅ | ✅ | ✅ |
| SSO/OIDC login | ❌ | ❌ | ❌ | ✅ | ✅ |
| Webhooks | ❌ | ❌ | ❌ | ✅ | ✅ |
| Lineage graph endpoint | ❌ | ❌ | ❌ | ✅ | ✅ |

## Backend API Checks

Run each check once per plan user and confirm expected status.

1) File upload constraints
- Endpoint: `POST /import/upload`
- Verify:
  - Free rejects JSON/Parquet (`403`)
  - Free allows CSV/Excel within 50 MB
  - Professional allows JSON/Parquet within 1 GB
  - Team allows up to 5 GB
  - Business allows up to 10 GB

2) Connector access
- Endpoint: `POST /import/test-connection`, `POST /import/connector-import`, `POST /import/connect`, `POST /connectors/import`, `POST /connectors/sync`
- Verify:
  - Free rejects all connectors (`403`)
  - Professional accepts core DB connectors, rejects enterprise warehouse connectors
  - Team+ accepts warehouse connectors

3) Scheduling
- Endpoints: `POST /jobs/`, `POST /pipelines/`, `PUT /pipelines/{id}`, `POST /pipelines/{id}/run`
- Verify Free gets `403`; Professional+ succeeds.

4) Dashboard sharing
- Endpoint: `POST /api/dashboards/{id}/publish`
- Verify Free gets `403`; Professional+ succeeds.

5) Workspace controls
- Endpoints: `POST /workspaces/`, `POST /workspaces/{id}/share`
- Verify:
  - Workspace create enforces plan limits (`Free=1`, `Professional=3`)
  - Workspace share requires Team+ (`403` for Free/Professional)

6) SSO and webhooks
- Endpoints: `GET /auth/oidc/login`, `GET /auth/sso/status`, `POST /webhooks/`, `GET /webhooks/`
- Verify:
  - SSO and webhooks blocked for Free/Professional/Team
  - Enabled for Business/Enterprise

7) Lineage graph
- Endpoint: `GET /datasets/{dataset_id}/lineage/graph`
- Verify Business+ only.

8) Plan update flow
- Endpoint: `POST /users/me/plan`
- Verify:
  - All plans receive `403` with guidance to use billing checkout
  - Endpoint does not mutate `users.plan` directly in API flow

## Frontend UX Checks

1) Pricing page
- Route: `/pricing`
- Verify five cards shown: Free, Professional, Team, Business, Enterprise.

2) Global upgrade banner
- Trigger any gated action as a lower-tier user.
- Verify banner appears with server detail and `View Plans` button.

3) Settings usage panel
- Route: `/settings`
- Verify usage bars render and `Upgrade Plan` navigates to `/pricing`.

4) Import modal sources
- Verify source options include: File Upload, Snowflake, BigQuery, Redshift.

## Regression Checks

- Build backend: `python -m compileall app`
- Build frontend: `node node_modules/vite/bin/vite.js build`
- Run offline matrix report: `python backend/scripts/pricing_matrix_check.py`
- Run live matrix report (minimal harness):
  1. `python backend/scripts/setup_live_matrix_sqlite.py`
  2. `cd backend && python -m uvicorn scripts.live_matrix_server:app --host 127.0.0.1 --port 8000`
  3. `python backend/scripts/run_live_pricing_matrix.py`
- Confirm no new diagnostics in modified files.

## CI Automation

- Workflow: `.github/workflows/pricing-matrix.yml`
- Trigger: pull requests to `main` that modify pricing/entitlement-related backend files.
- Steps:
  - Run offline matrix (`docs/PRICING_MATRIX_REPORT.md`)
  - Seed SQLite and run live HTTP matrix (`docs/PRICING_LIVE_MATRIX_REPORT.md`)
  - Upload both reports (plus server log) as workflow artifacts.
