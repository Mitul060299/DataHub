# DataHub Pricing

> DataHub has three self-serve tiers — **Starter (free)**, **Professional**, and **Expert** — plus **Enterprise** for large teams. All tiers are per-account (single seat); collaboration is unlocked at Professional and above. Indian customers are billed in **INR** via Razorpay; international customers in **USD** via Razorpay International. Currency is auto-detected from browser timezone and locked at subscription creation.

> **Positioning:** DataHub aims to be a **fraction of the cost of Alteryx Designer** (~$433/seat/month) while covering the same prep + automation surface. Professional at $49/mo is 91% cheaper than a single Alteryx seat.

---

## Beta Grace Period

When `BILLING_ENABLED=true` is set for the first time, users who signed up during open beta and have no paid subscription remain on the **Starter (free)** plan. No features are silently removed — Starter covers all solo workflows. Billing enforcement is controlled by `BILLING_ENABLED` (backend env var) and `VITE_ENABLE_BILLING` (frontend build env var).

The plan fallback is enforced in `plan_guard.py` → `default_user_plan()`.

---

## Tier Overview

| Feature | Starter (Free) | Professional | Expert | Enterprise |
|---|---|---|---|---|
| **Price (INR/mo)** | ₹0 | ₹1,999 | ₹3,999 | Custom |
| **Price (USD/mo)** | $0 | $49 | $99 | Custom (from $1,500/mo) |
| **Included seats** | 1 | 1 | 1 | Custom |
| **Max collaborators** | 0 | 5 | 20 | Unlimited |
| **AI messages / month** | 50 | 500 | 2,000 | Negotiated (fair-use) |
| **Pipeline runs / month** | 20 | 100 | 500 | Negotiated (fair-use) |
| **Storage** | 2 GB | 20 GB | 100 GB | Negotiated |
| **Max file size** | 50 MB | 1 GB | 5 GB | Unlimited |
| **File formats** | CSV, Excel | All (CSV, Excel, JSON, Parquet, …) | All formats | All + any format on request |
| **Database connectors** | — | PostgreSQL, MySQL, SQLite | All (cloud DBs + warehouses) | All + bespoke connectors |
| **Warehouses** | — | — | Snowflake, Redshift, BigQuery | All |
| **Object storage** | — | — | S3, GCS, Azure Blob | All |
| **Scheduling** | — | Daily | Full (hourly, daily, cron) | Full |
| **Dashboard sharing** | — | ✓ | ✓ | ✓ |
| **Webhooks** | — | — | ✓ | ✓ |
| **Audit log** | — | — | ✓ | ✓ |
| **SSO / SAML** | — | — | — | ✓ |

### Razorpay Plan IDs (live)

| Tier | Currency | Plan ID |
|---|---|---|
| Professional | INR | `plan_SugB0jUThUjLYj` |
| Expert | INR | `plan_SugB0xDaPeYumH` |
| Professional | USD | `plan_SugB1ANN7YOqf7` |
| Expert | USD | `plan_SugB1Tg6LsbnpM` |

Plan IDs are set as fallbacks in `backend/app/razorpay_plans.py` and can be overridden with env vars `RAZORPAY_PRO_INR_PLAN`, `RAZORPAY_EXPERT_INR_PLAN`, `RAZORPAY_PRO_USD_PLAN`, `RAZORPAY_EXPERT_USD_PLAN`.

---

## Why these limits (and why no "unlimited" below Enterprise)

AI messages, pipeline runs, and storage all map to **real per-call cost** (LLM tokens, container CPU, storage egress). Limits are generous but bounded — most solo and small-team users will never hit them. Enterprise is "negotiated fair-use" with throttling clauses for abuse.

---

## How DataHub compares (at launch)

| Tool | Entry price | Per-seat | Notes |
|---|---|---|---|
| Alteryx Designer | — | ~$433/mo (~$5,195/yr) | Desktop-first, no built-in AI agent |
| Tableau Prep + Creator | — | $75/mo | Prep only, no automation |
| Power BI Pro | $10/mo | $10/mo | BI-only, no data prep automation |
| Sigma | ~$600/yr/seat | ~$50/mo | Cloud BI, limited prep |
| **DataHub Professional** | **$49/mo** | **$49/mo** | Prep + pipelines + AI agent |
| **DataHub Expert** | **$99/mo** | **$99/mo** | + cloud connectors, webhooks, audit log |

### Alteryx vs DataHub

| Seats | Alteryx Designer / yr | DataHub / yr | DataHub savings |
|---|---|---|---|
| 1 | $5,195 | $588 (Professional $49/mo) | **89% cheaper** |
| 1 | $5,195 | $1,188 (Expert $99/mo) | **77% cheaper** |
| 5 | $25,975 | $18,000 (Enterprise from $1,500/mo) | **31% cheaper** |
| 10 | $51,950 | ~$24,000 (Enterprise + extras) | **~54% cheaper** |
| 25 | $129,875 | ~$42,000 | **~68% cheaper** |

Alteryx also forces customers onto Server (+$58k/yr base) for any team collaboration — DataHub includes collaboration in the base price. Alteryx Intelligence Suite (AI add-on) is another $1,950/seat/yr; included free in every DataHub tier.

---

## Project Model

### Solo Projects
Every user can create projects on any plan. Solo projects have a single member — the owner — and all usage is billed to that owner.

### Collaborative Projects
A collaborative project is one with at least one invited member in addition to the owner:

- **Starter** — cannot invite members. Solo projects only.
- **Professional** — invite up to **5 collaborators** per project.
- **Expert** — invite up to **20 collaborators** per project.
- **Enterprise** — unlimited members per project.

All usage inside any project is billed to the **project owner's** account. Invited members consume the owner's quota — a Starter user invited into an Expert owner's project uses the Expert owner's allowance.

---

## Billing Attribution Rules

| Project type | Billing account |
|---|---|
| Solo | Project owner |
| Collaborative | Project owner (members consume owner's quota) |

A Starter user invited into an Expert owner's project uses the Expert owner's quota.

---

## Enforcement Details

All limits are enforced server-side in `plan_guard.py` and `usage_service.py`.

- **Hard limits** (all tiers): once monthly quota is exceeded, requests raise `HTTP 403` with a structured error payload and an `upgrade_url`.
- **File too large** raises `HTTP 413`.
- DuckDB query timeout: 60 seconds (env `DUCKDB_QUERY_TIMEOUT_S`).

---

## Billing API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/billing/subscribe` | POST | Create a new subscription |
| `/billing/upgrade` | POST | Upgrade an existing subscription to a higher tier |
| `/billing/verify` | POST | Verify Razorpay payment signature after checkout |
| `/billing/status` | GET | Current plan + subscription details |
| `/billing/cancel` | POST | Cancel subscription (at cycle end) |
| `/billing/invoices` | GET | Payment history (last 12) |
| `/billing/invoices/{id}/pdf` | GET | Get PDF download URL for an invoice |
| `/billing/webhook/razorpay` | POST | Razorpay webhook receiver (payment, subscription events) |

---

## FAQ

**Q: Is pricing per user or per account?**
All tiers are per-account (single seat). Professional allows up to 5 collaborators; Expert allows up to 20. Collaborators consume the account owner's quota.

**Q: Can two Starter users share a project?**
No. Starter is solo-only. Collaboration requires Professional or above.

**Q: What happens when I hit a monthly limit?**
A `HTTP 403` is returned with a structured error payload and an `upgrade_url`. There are no soft overages or surprise charges.

**Q: Do limits reset monthly?**
Yes. AI messages and pipeline runs reset monthly (UTC). Storage is cumulative.

**Q: Is annual billing available?**
Not yet. Monthly billing only at launch. Annual billing (with ~2 months free) will be added later.

**Q: How does Enterprise pricing work?**
Enterprise starts at **$1,500/mo** and scales with seat count, region (data residency), SLA, and integration requirements. A typical 10-seat deal lands around $2,000/mo; a 50-seat deal around $5,500/mo. Contact us for a quote.
