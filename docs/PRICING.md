# DataHub Pricing

> Pricing is **hybrid base + per-seat** for Team and Business tiers. Starter and Professional are per-account (single seat). Free is free. Indian customers are billed in **INR** via Razorpay's domestic flow; international customers are billed in **USD** via Razorpay International on the same merchant account. Currency is auto-detected from browser timezone and locked at subscription creation.

> **Positioning:** DataHub aims to be a **fraction of the cost of Alteryx Designer** (~$433/seat/month) while covering the same prep + automation surface. Effective per-seat cost on Team is ~$60/mo and on Business ~$70/mo.

---

## Beta Tier (Open Beta — billing disabled)

When `BILLING_ENABLED=false` (the default until billing is switched on), **every user automatically receives the Beta plan** regardless of what is stored in the database. Beta unlocks all single-user features so the product can be evaluated without artificial limits.

| Attribute | Beta value |
|---|---|
| **Max file upload** | 2 GB |
| **Storage** | 20 GB |
| **Max datasets** | Unlimited |
| **Dataset uploads / month** | 200 |
| **Data scan / month** | 200 GB |
| **Pipeline runs / month** | 2,000 |
| **AI token budget / month** | 5,000,000 tokens |
| **API calls / month** | 500 |
| **File formats** | CSV, Excel, JSON, Parquet |
| **Database connectors** | All (PostgreSQL, MySQL, MSSQL, Oracle, Snowflake, BigQuery, Redshift, S3, GCS, Azure Blob, Google Sheets, SQLite) |
| **Scheduling** | ✓ |
| **Webhooks** | ✓ |
| **Dashboard sharing** | ✓ |
| **SSO** | — |
| **Collab workspaces** | — (single-user only) |

**When billing is re-enabled** (`BILLING_ENABLED=true`), users who have purchased a plan get their tier; users without a paid plan still receive Beta (not Free) until they are explicitly downgraded. This avoids silently blocking existing beta users the moment billing goes live.

The Beta plan is enforced in `plan_guard.py` → `default_user_plan()` and respected in `resolve_user_plan_by_id()` / `resolve_user_plan()`.

---

## Tier Overview

| Feature | Free | Starter | Professional | Team | Business | Enterprise |
|---|---|---|---|---|---|---|
| **Price (INR/mo)** | ₹0 | ₹999 | ₹3,999 | ₹8,999 | ₹17,999 | Custom |
| **Price (USD/mo)** | $0 | $19 | $79 | $179 | $349 | Custom (from $1,500/mo, 5+ seats) |
| **Included seats** | 1 | 1 | 1 | 3 | 5 | Custom |
| **Extra seat (INR)** | — | — | — | ₹1,499/seat/mo | ₹2,499/seat/mo | Negotiated |
| **Extra seat (USD)** | — | — | — | $29/seat/mo | $49/seat/mo | Negotiated |
| **Max seats** | 1 | 1 | 1 | 25 | 100 | Unlimited |
| **Members per project** | 1 | 1 | 1 | 10 | 50 | Unlimited |
| **Collaborative projects** | 0 | 0 | 0 | 5 | Unlimited | Unlimited |
| **Projects (total)** | 2 | 5 | 20 | Unlimited | Unlimited | Unlimited |
| **AI messages / month** | 50 | 500 | 1,500 | 4,000 (scales) | 15,000 (scales) | Negotiated (fair-use) |
| **Pipeline runs / month** | 10 | 100 | 500 | 2,000 (scales) | 8,000 (scales) | Negotiated (fair-use) |
| **Dataset uploads / month** | 3 | 25 | 100 | 500 | 2,000 | Unlimited |
| **Max file size** | 50 MB | 250 MB | 1 GB | 5 GB | 10 GB | Unlimited |
| **Storage** | 500 MB | 5 GB | 20 GB | 100 GB (scales) | 500 GB (scales) | Negotiated |
| **Data scan / month** | 5 GB | 25 GB | 100 GB | 500 GB (scales) | 2 TB (scales) | Negotiated |
| **File formats** | CSV, Excel | CSV, Excel, JSON | + Parquet | All standard | All standard | All (any format on request) |
| **Database connectors** | — | SQLite | PostgreSQL, MySQL, SQLite, MSSQL, Oracle | + Snowflake, Redshift, BigQuery | All supported + custom on request | All + bespoke connectors |
| **Scheduling** | — | Daily | ✓ | ✓ | ✓ | ✓ |
| **Dashboard sharing** | — | Read-only link | ✓ | ✓ | ✓ | ✓ |
| **Webhooks** | — | — | — | — | ✓ | ✓ |
| **SSO / SAML** | — | — | — | — | ✓ | ✓ |
| **Audit log** | — | — | — | ✓ | ✓ | ✓ |

---

## Why these limits (and why no "unlimited" below Enterprise)

AI messages, pipeline runs, and data scan all map to **real per-call cost** (LLM tokens, container CPU, storage egress). Earlier "unlimited" tiers exposed DataHub to uncapped COGS from a single power user. Limits are now **generous but bounded**, with seat-based scaling so growing teams scale linearly instead of needing to jump tiers.

Enterprise is "negotiated fair-use" — effectively unlimited for normal workloads, with throttling clauses in the contract for abuse.

---

## Overage Pricing (Team & Business)

When you exceed your monthly allowance, DataHub does **not** hard-block by default — you continue working and are billed for overage at the next cycle. Hard caps can be enabled per-account from the billing settings if you want predictable spend.

| Resource | Team overage | Business overage |
|---|---|---|
| AI messages | $0.02 / message | $0.015 / message |
| Pipeline runs | $0.05 / run | $0.03 / run |
| Data scan | $0.10 / GB | $0.07 / GB |
| Storage | $0.30 / GB / mo | $0.20 / GB / mo |

INR overage rates are listed in `/billing/overage-rates`.

---

## Seat-Based Scaling (Team & Business)

When extra seats are purchased, quotas scale linearly:

### Team tier — per extra seat
| Resource | Increment per seat |
|---|---|
| AI messages/month | +1,000 |
| Pipeline runs/month | +500 |
| Storage | +10 GB |
| Data scan/month | +50 GB |

### Business tier — per extra seat
| Resource | Increment per seat |
|---|---|
| AI messages/month | +2,500 |
| Pipeline runs/month | +1,500 |
| Storage | +25 GB |
| Data scan/month | +200 GB |

### Seat management rules
- **Increases** take effect immediately (prorated).
- **Decreases** take effect at next billing renewal.
- Minimum seats = included seats for the tier.

---

## How DataHub compares (at launch)

| Tool | Entry price | Designer/seat | Notes |
|---|---|---|---|
| Alteryx Designer | — | ~$433/mo (~$5,195/yr) | Desktop-first, no built-in AI agent |
| Tableau Prep + Creator | — | $75/mo | Prep only, no automation |
| Power BI Pro | $10/mo | $10/mo | BI-only, no data prep automation |
| Sigma | ~$600/yr/seat | ~$50/mo | Cloud BI, limited prep |
| **DataHub Team** | **$179/mo** | **~$60/mo** | Prep + pipelines + AI agent |
| **DataHub Business** | **$349/mo** | **~$70/mo** | Same + governance, webhooks |

### Alteryx vs DataHub at scale

The Enterprise floor (`from $1,500/mo`) only kicks in at **5+ seats**. Below that, customers buy Business at $349/mo (~77% cheaper than even **one** Alteryx seat). Above 5 seats, DataHub stays 30–75% cheaper because we bill per **account + light per-seat add-on**, not a full per-seat license:

| Seats | Alteryx Designer / yr | DataHub / yr | DataHub savings |
|---|---|---|---|
| 1 | $5,195 | $4,188 (Business $349/mo) | **19% cheaper** |
| 3 | $15,585 | $4,188 (Business $349/mo) | **73% cheaper** |
| 5 | $25,975 | $18,000 (Enterprise from $1,500/mo) | **31% cheaper** |
| 10 | $51,950 | ~$24,000 (Enterprise + 5 add-on seats) | **~54% cheaper** |
| 25 | $129,875 | ~$42,000 | **~68% cheaper** |
| 50 | $259,750 | ~$66,000 | **~75% cheaper** |

Alteryx also forces customers onto Server (+$58k/yr base) for any team collaboration; DataHub includes collaboration in the base price. The Intelligence Suite (Alteryx's AI add-on) is another $1,950/seat/yr — included free in every DataHub tier.

---

## Project Model

### Solo Projects
Every user can create projects on any plan. Solo projects have a single member — the owner — and all usage is billed to that owner.

### Collaborative Projects
A collaborative project is one with at least one invited member in addition to the owner:

- **Free / Starter / Professional** — cannot invite members. Solo projects only.
- **Team** — up to **5 collaborative projects**, **10 members per project**.
- **Business** — unlimited collaborative projects, **50 members per project**.
- **Enterprise** — unlimited members per project, unlimited collaborative projects.

All usage inside any project (solo or collaborative) is billed to the **project owner's** account. Invited members consume the owner's quota — a Free-tier user invited into a Team owner's project uses the Team owner's allowance.

---

## Billing Attribution Rules

| Project type | Billing account |
|---|---|
| Solo | Project owner |
| Collaborative | Project owner (members consume owner's quota) |

A Free-tier user invited into a Team owner's project uses the Team owner's quota.

---

## Enforcement Details

All limits are enforced server-side in `plan_guard.py` and `usage_service.py`.

- **Soft limits** (AI messages, pipeline runs, data scan on Team/Business): once exceeded, usage is metered into overage and reported on the next invoice. Account owner can opt into hard caps from billing settings.
- **Hard limits** (Free / Starter / Professional, and any tier with hard-cap enabled): raise `HTTP 403` with a structured error payload.
- **Seat limit** raises `HTTP 403` with `"code": "seat_limit_reached"` and an `upgrade_url`.
- **File too large** raises `HTTP 413`.
- DuckDB query timeout: 60 seconds (env `DUCKDB_QUERY_TIMEOUT_S`).

---

## Billing API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/billing/subscribe` | POST | Create a new subscription |
| `/billing/upgrade` | POST | Upgrade an existing subscription to a higher tier |
| `/billing/verify` | POST | Verify Razorpay payment signature after checkout |
| `/billing/seats` | POST | Update seat count (increase/decrease) |
| `/billing/seat-usage` | GET | Current seat usage breakdown |
| `/billing/status` | GET | Current plan + subscription details |
| `/billing/cancel` | POST | Cancel subscription (at cycle end) |
| `/billing/invoices` | GET | Payment history (last 12) |
| `/billing/invoices/{id}/pdf` | GET | Get PDF download URL for an invoice |
| `/billing/overage-rates` | GET | Current overage pricing for the account's currency |
| `/billing/webhook/razorpay` | POST | Razorpay webhook receiver (payment, subscription events) |

---

## FAQ

**Q: Is pricing per user or per account?**
Starter and Professional are per account (1 seat). Team and Business include multiple seats with optional extra seats at a per-seat price.

**Q: Can two Free users share a project?**
No. Free, Starter and Professional users cannot invite members to projects.

**Q: Why did "unlimited" go away on Business?**
Earlier "unlimited" tiers exposed DataHub to uncapped LLM and compute costs from a single power user. Business now includes high quotas with linear seat-based scaling and metered overage instead — most teams will never hit the cap, and those who do pay only for what they use.

**Q: If I'm on Team and invite a Free user, do I pay for their usage?**
Yes. All usage inside a collaborative project bills to the project owner. They also consume a seat.

**Q: Do limits reset monthly?**
Yes. AI messages, pipeline runs, data scan reset monthly (UTC). Storage is cumulative.

**Q: What happens when I reduce seats mid-cycle?**
The reduction takes effect at the next billing renewal. No mid-cycle refund.

**Q: What happens when I hit the pipeline run limit?**
On Team/Business with default soft caps, runs continue and overage is billed at the next cycle. On Free/Starter/Pro (or any tier with hard caps enabled) execution returns HTTP 403 with `"error": "pipeline_runs_per_month"`.

**Q: Is annual billing available?**
Not yet. Monthly billing only for launch. Annual billing (with ~2 months free) will be added later.

**Q: How does Enterprise pricing actually work?**
Enterprise starts at **$1,500/mo for 5+ seats** and scales from there — we size to your seat count, region (data residency), SLA, and integration requirements. Below 5 seats, Business at $349/mo is the better fit and is already cheaper than a single Alteryx seat. A typical 10-seat Enterprise deal lands around $2,000/mo; a 50-seat deal around $5,500/mo.
