# DataHub Pricing

> Pricing is **hybrid base + per-seat** for Team and Business tiers. Professional is per-account (single seat). Free is free. Indian customers are billed in **INR** via Razorpay's domestic flow; international customers are billed in **USD** via Razorpay International on the same merchant account. Currency is auto-detected from browser timezone and locked at subscription creation.

---

## Tier Overview

| Feature | Free | Professional | Team | Business | Enterprise |
|---|---|---|---|---|---|
| **Price (INR/mo)** | ₹0 | ₹6,999 | ₹14,999 | ₹29,999 | Custom |
| **Price (USD/mo)** | $0 | $149 | $299 | $599 | Min $5,000/mo |
| **Included seats** | 1 | 1 | 3 | 5 | Custom |
| **Extra seat (INR)** | — | — | ₹2,499/seat/mo | ₹3,999/seat/mo | Negotiated |
| **Extra seat (USD)** | — | — | $49/seat/mo | $79/seat/mo | Negotiated |
| **Max seats** | 1 | 1 | 25 | 100 | Unlimited |
| **Members per project** | 1 | 1 | 10 | 50 | Unlimited |
| **Collaborative projects** | 0 | 0 | 5 | Unlimited | Unlimited |
| **Projects (total)** | 2 | 20 | Unlimited | Unlimited | Unlimited |
| **AI messages / month** | 100 | 2,000 | 5,000 (scales) | Unlimited | Unlimited |
| **Pipeline runs / month** | 10 | 200 | 1,000 (scales) | Unlimited | Unlimited |
| **Dataset uploads / month** | 3 | 50 | Unlimited | Unlimited | Unlimited |
| **Max file size** | 50 MB | 1 GB | 5 GB | 10 GB | Unlimited |
| **Storage** | 500 MB | 20 GB | 100 GB (scales) | 2 TB (scales) | Unlimited |
| **Data scan / month** | 5 GB | 50 GB | 200 GB (scales) | Unlimited | Unlimited |
| **File formats** | CSV, Excel | + JSON, Parquet | CSV, Excel, JSON, Parquet | CSV, Excel, JSON, Parquet | All (any format on request) |
| **Database connectors** | — | PostgreSQL, MySQL, SQLite, MSSQL, Oracle | + Snowflake, Redshift, BigQuery | All supported + custom on request | All + bespoke connectors |
| **Scheduling** | — | ✓ | ✓ | ✓ | ✓ |
| **Dashboard sharing** | — | ✓ | ✓ | ✓ | ✓ |
| **Webhooks** | — | — | — | ✓ | ✓ |
| **SSO / SAML** | — | — | — | ✓ | ✓ |
| **Audit log** | — | — | ✓ | ✓ | ✓ |

---

## Seat-Based Scaling (Team & Business)

When extra seats are purchased, quotas scale linearly:

### Team tier — per extra seat
| Resource | Increment per seat |
|---|---|
| AI messages/month | +1,000 |
| Pipeline runs/month | +200 |
| Storage | +5 GB |
| Data scan/month | +20 GB |

### Business tier
Business has unlimited AI messages, pipeline runs, and data scan. Storage adds +20 GB per extra seat.

### Seat management rules
- **Increases** take effect immediately (prorated).
- **Decreases** take effect at next billing renewal.
- Minimum seats = included seats for the tier.

---

## Project Model

### Solo Projects
Every user can create projects on any plan. Solo projects have a single member — the owner — and all usage is billed to that owner.

### Collaborative Projects
A collaborative project is one with at least one invited member in addition to the owner:

- **Free / Professional** — cannot invite members. Solo projects only.
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

- **Hard limits** raise `HTTP 403` with a structured error payload.
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
| `/billing/webhook/razorpay` | POST | Razorpay webhook receiver (payment, subscription events) |

---

## FAQ

**Q: Is pricing per user or per account?**
Professional is per account (1 seat). Team and Business include multiple seats with optional extra seats at a per-seat price.

**Q: Can two Free users share a workspace?**
No. Free users cannot create collab workspaces.

**Q: If I'm on Team and invite a Free user, do I pay for their usage?**
Yes. All usage inside a collab workspace bills to the workspace owner. They also consume a seat.

**Q: Do limits reset monthly?**
Yes. AI messages, pipeline runs, data scan reset monthly (UTC). Storage is cumulative.

**Q: What happens when I reduce seats mid-cycle?**
The reduction takes effect at the next billing renewal. No mid-cycle refund.

**Q: What happens when I hit the pipeline run limit?**
Pipeline execution returns HTTP 403 with `"error": "pipeline_runs_per_month"`. Upgrade or wait for the monthly reset.

**Q: Is annual billing available?**
Not yet. Monthly billing only for launch. Annual billing will be added later.
