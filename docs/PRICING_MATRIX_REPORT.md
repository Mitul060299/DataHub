# Pricing Matrix Execution Report

## Execution Mode

- Live API matrix: skipped (backend not reachable at `http://127.0.0.1:8000`)
- Offline verification: enabled (plan logic + endpoint guard wiring + hardcoded plan scan)

## Plan Capability Matrix

| Capability | Free | Professional | Team | Business | Enterprise | Status |
|---|---|---|---|---|---|---|
| JSON+Parquet Upload | ❌ | ✅ | ✅ | ✅ | ✅ | PASS |
| Core DB Connectors | ❌ | ✅ | ✅ | ✅ | ✅ | PASS |
| Enterprise Connectors | ❌ | ❌ | ✅ | ✅ | ✅ | PASS |
| Scheduling | ❌ | ✅ | ✅ | ✅ | ✅ | PASS |
| Dashboard Sharing | ❌ | ✅ | ✅ | ✅ | ✅ | PASS |
| Workspace Sharing | ❌ | ❌ | ✅ | ✅ | ✅ | PASS |
| SSO | ❌ | ❌ | ❌ | ✅ | ✅ | PASS |
| Webhooks | ❌ | ❌ | ❌ | ✅ | ✅ | PASS |
| Lineage Graph | ❌ | ❌ | ❌ | ✅ | ✅ | PASS |

## Endpoint Guard Wiring

| Endpoint Function | File | Required Guards | Result |
|---|---|---|---|
| `upload_file` | `backend/app/routers/imports.py` | `enforce_file_constraints` | PASS (OK) |
| `test_connection` | `backend/app/routers/imports.py` | `enforce_connector_access` | PASS (OK) |
| `connector_import` | `backend/app/routers/imports.py` | `enforce_connector_access`, `enforce_file_constraints` | PASS (OK) |
| `connect_database` | `backend/app/routers/imports.py` | `enforce_connector_access` | PASS (OK) |
| `import_from_connector` | `backend/app/routers/connectors.py` | `enforce_connector_access`, `enforce_file_constraints` | PASS (OK) |
| `sync_connector` | `backend/app/routers/connectors.py` | `enforce_connector_access`, `enforce_file_constraints` | PASS (OK) |
| `create_job` | `backend/app/routers/jobs.py` | `enforce_scheduling` | PASS (OK) |
| `create_pipeline` | `backend/app/routers/pipelines.py` | `enforce_scheduling` | PASS (OK) |
| `update_pipeline` | `backend/app/routers/pipelines.py` | `enforce_scheduling` | PASS (OK) |
| `run_pipeline` | `backend/app/routers/pipelines.py` | `enforce_scheduling` | PASS (OK) |
| `publish_dashboard` | `backend/app/routers/dashboards_v2.py` | `enforce_dashboard_sharing` | PASS (OK) |
| `create_workspace` | `backend/app/routers/workspaces.py` | `enforce_workspace_limit` | PASS (OK) |
| `share_workspace` | `backend/app/routers/workspaces.py` | `enforce_min_plan`, `"Team"` | PASS (OK) |
| `oidc_login` | `backend/app/routers/auth.py` | `enforce_sso` | PASS (OK) |
| `register_hook` | `backend/app/routers/webhooks.py` | `enforce_webhooks` | PASS (OK) |
| `list_hooks` | `backend/app/routers/webhooks.py` | `enforce_webhooks` | PASS (OK) |
| `dataset_lineage_graph` | `backend/app/routers/datasets.py` | `enforce_sso` | PASS (OK) |

## Hardcoded Plan Override Scan

- Result: PASS
- No `user_plan = "free"` assignments found in `backend/app`.

## Overall

- Capability matrix: PASS
- Endpoint guard checks: PASS
- Hardcoded override scan: PASS
- Final status: PASS
