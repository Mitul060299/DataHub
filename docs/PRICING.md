# DataHub Pricing

> All limits are **per account** (not per user, not per device). Personal workspaces always draw from the account owner's quota. Collab workspaces draw from the workspace owner's quota.

---

## Tier Overview

| Feature | Free | Professional | Team | Business | Enterprise |
|---|---|---|---|---|---|
| **Price** | $0 forever | $79/mo per account | $149/mo per account | $399/mo per account | Custom |
| **Personal workspace** | 1 | 1 | 1 | 1 | Unlimited |
| **Collab workspaces** | 0 | 0 | 2 | 9 | Unlimited |
| **Projects per workspace** | 2 | 20 | Unlimited | Unlimited | Unlimited |
| **AI messages / month** | 100 | 2,000 | 5,000 | Unlimited | Unlimited |
| **Max file size** | 50 MB | 1 GB | 5 GB | 10 GB | Unlimited |
| **Storage** | 100 MB | 20 GB | 100 GB | 1 TB | Unlimited |
| **Data scan / month** | 5 GB | 50 GB | 200 GB | Unlimited | Unlimited |
| **Members per workspace** | 1 | 1 | 10 | 50 | Unlimited |
| **DB connectors** | CSV, Excel | + PostgreSQL, MySQL, SQLite, MSSQL, Oracle | + Snowflake, Redshift, BigQuery | + Custom connectors | All |
| **Scheduling** | — | ✓ | ✓ | ✓ | ✓ |
| **Dashboard sharing** | — | ✓ | ✓ | ✓ | ✓ |
| **Webhooks** | — | — | — | ✓ | ✓ |
| **SSO / SAML** | — | — | — | ✓ | ✓ |
| **Audit log** | — | — | ✓ | ✓ | ✓ |

---

## Workspace Model

### Personal Workspace
Every account gets exactly **one personal workspace** at sign-up, regardless of plan. This workspace is private to the owner. Usage (AI calls, storage, scan) is billed to the account owner.

### Collab Workspaces
Collab workspaces allow multiple members to collaborate. They are gated by plan:

- **Free / Professional** — cannot create collab workspaces. These tiers are designed for individual use.
- **Team** — up to 2 collab workspaces (3 total including personal).
- **Business** — up to 9 collab workspaces (10 total including personal).
- **Enterprise** — unlimited.

All usage inside a collab workspace (AI calls, pipeline runs, data scans) is billed to the **workspace owner's** account, not the calling member's.

---

## Billing Attribution Rules

| Workspace type | Billing account |
|---|---|
| Personal | Calling user |
| Collab | Workspace owner |

This means a Free-tier user invited into a Team collab workspace can run AI queries against the Team owner's quota — they do not need a paid plan themselves.

---

## Data Scan Limits

Data scan measures the bytes read by DuckDB when executing SQL queries. It acts as a compute cost protection layer. Limits reset monthly.

| Plan | Monthly scan cap |
|---|---|
| Free | 5 GB |
| Professional | 50 GB |
| Team | 200 GB |
| Business | Unlimited |
| Enterprise | Unlimited |

When a user reaches 80%, a warning is logged. At 100%, queries return HTTP 403 with `"error": "scan_limit_exceeded"`.

---

## Project Limits

Projects are scoped to a workspace. The limit applies per workspace.

| Plan | Max projects per workspace |
|---|---|
| Free | 2 |
| Professional | 20 |
| Team | Unlimited |
| Business | Unlimited |
| Enterprise | Unlimited |

---

## AI Message Limits

AI messages include: chat queries, pipeline runs triggered via AI, and agent-generated SQL steps.

| Plan | Messages / month |
|---|---|
| Free | 100 |
| Professional | 2,000 |
| Team | 5,000 |
| Business | Unlimited |
| Enterprise | Unlimited |

---

## Storage Limits

| Plan | Max file size | Total storage |
|---|---|---|
| Free | 50 MB | 100 MB |
| Professional | 1 GB | 20 GB |
| Team | 5 GB | 100 GB |
| Business | 10 GB | 1 TB |
| Enterprise | Unlimited | Unlimited |

---

## Enforcement Details

All limits are enforced server-side in `plan_guard.py` and `usage_service.py`.

- **Hard limits** raise `HTTP 403` with a structured error payload.
- **File too large** raises `HTTP 413`.
- DuckDB query timeout: 60 seconds (env `DUCKDB_QUERY_TIMEOUT_S`).
- DML write operations are blocked in agent-executed queries.

---

## FAQ

**Q: Can two Free users share a workspace?**
Free users cannot create collab workspaces. They each work in their own personal workspace.

**Q: If I'm on Team and invite a Free user to my collab workspace, do I pay for their usage?**
Yes. All usage inside a collab workspace bills to the workspace owner (Team account).

**Q: Do limits reset monthly?**
Yes. AI messages, pipeline runs, data scan, and dataset upload counts reset monthly (UTC). Storage is cumulative.

**Q: What happens when I hit the scan limit?**
Queries return HTTP 403. Upgrade to the next tier or wait for the monthly reset.
