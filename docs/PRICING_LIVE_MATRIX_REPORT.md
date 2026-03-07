# Live Pricing Matrix Report

- Base URL: `http://127.0.0.1:8000`
- Auth mode: app JWT tokens (`APP_SECRET_KEY`) with seeded users/plans

| Capability | Plan | Expected | Actual Status | Result | Detail |
|---|---|---|---|---|---|
| Webhooks | Free | 403 | 403 | PASS | Webhooks requires Business plan or higher. Current plan: Free. |
| Scheduling (Jobs) | Free | 403 | 403 | PASS | Scheduling requires Professional plan or higher. Current plan: Free. |
| Workspace Sharing | Free | 403 | 403 | PASS | Workspace sharing requires Team plan or higher. Current plan: Free. |
| Dashboard Sharing | Free | 403 | 403 | PASS | Dashboard sharing requires Professional plan or higher. Current plan: Free. |
| Core Connectors | Free | 403 | 403 | PASS | postgresql connector requires Professional plan or higher. Current plan: Free. |
| Enterprise Connectors | Free | 403 | 403 | PASS | snowflake connector requires Team plan or higher. Current plan: Free. |
| SSO Status | Free | disabled | 200 | PASS |  |
| Lineage Graph | Free | 403 | 403 | PASS | SSO requires Business plan or higher. Current plan: Free. |
| Webhooks | Professional | 403 | 403 | PASS | Webhooks requires Business plan or higher. Current plan: Professional. |
| Scheduling (Jobs) | Professional | non-403 | 200 | PASS |  |
| Workspace Sharing | Professional | 403 | 403 | PASS | Workspace sharing requires Team plan or higher. Current plan: Professional. |
| Dashboard Sharing | Professional | non-403 | 404 | PASS | Dashboard not found |
| Core Connectors | Professional | non-403 | 200 | PASS |  |
| Enterprise Connectors | Professional | 403 | 403 | PASS | snowflake connector requires Team plan or higher. Current plan: Professional. |
| SSO Status | Professional | disabled | 200 | PASS |  |
| Lineage Graph | Professional | 403 | 403 | PASS | SSO requires Business plan or higher. Current plan: Professional. |
| Webhooks | Team | 403 | 403 | PASS | Webhooks requires Business plan or higher. Current plan: Team. |
| Scheduling (Jobs) | Team | non-403 | 200 | PASS |  |
| Workspace Sharing | Team | non-403 | 200 | PASS |  |
| Dashboard Sharing | Team | non-403 | 404 | PASS | Dashboard not found |
| Core Connectors | Team | non-403 | 200 | PASS |  |
| Enterprise Connectors | Team | non-403 | 200 | PASS |  |
| SSO Status | Team | disabled | 200 | PASS |  |
| Lineage Graph | Team | 403 | 403 | PASS | SSO requires Business plan or higher. Current plan: Team. |
| Webhooks | Business | non-403 | 200 | PASS | [] |
| Scheduling (Jobs) | Business | non-403 | 200 | PASS |  |
| Workspace Sharing | Business | non-403 | 200 | PASS |  |
| Dashboard Sharing | Business | non-403 | 404 | PASS | Dashboard not found |
| Core Connectors | Business | non-403 | 200 | PASS |  |
| Enterprise Connectors | Business | non-403 | 200 | PASS |  |
| SSO Status | Business | enabled | 200 | PASS |  |
| Lineage Graph | Business | non-403 | 200 | PASS |  |
| Webhooks | Enterprise | non-403 | 200 | PASS | [] |
| Scheduling (Jobs) | Enterprise | non-403 | 200 | PASS |  |
| Workspace Sharing | Enterprise | non-403 | 200 | PASS |  |
| Dashboard Sharing | Enterprise | non-403 | 404 | PASS | Dashboard not found |
| Core Connectors | Enterprise | non-403 | 200 | PASS |  |
| Enterprise Connectors | Enterprise | non-403 | 200 | PASS |  |
| SSO Status | Enterprise | enabled | 200 | PASS |  |
| Lineage Graph | Enterprise | non-403 | 200 | PASS |  |

- Passed: 40/40
- Final: PASS
