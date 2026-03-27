# DataHub Pricing

_Last updated: March 2026_

---

## Overview

DataHub is priced in **USD** with INR equivalents shown in brackets. All plans are billed monthly per workspace (not per seat).

| Tier | Price | INR Equivalent |
|---|---|---|
| Free | $0 | ₹0 |
| Professional | $79 / month | ₹3,299 / month |
| Team | $149 / month | ₹6,199 / month |
| Business | $399 / month | ₹16,599 / month |
| Enterprise | Custom | Custom |

---

## Tier Details

### Free — $0

| Feature | Value |
|---|---|
| Projects | 2 |
| AI messages | 50 / month |
| File size limit | 50 MB |
| Storage | 1 GB |
| Team members | 1 |
| Scheduled pipelines | 0 |
| Canvases | 2 |
| Visualizations Library | Unlimited |
| DB connections | CSV & Excel only |
| Support | Community |

CTA: **Get started**

---

### Professional — $79 / month (₹3,299)

| Feature | Value |
|---|---|
| Projects | Unlimited |
| AI messages | 500 / month |
| File size limit | 1 GB |
| Storage | 20 GB |
| Team members | 1 |
| Scheduled pipelines | 5 |
| Canvases | 20 |
| Visualizations Library | Unlimited |
| DB connections | PostgreSQL, MySQL, SQLite, MSSQL, Oracle _(coming soon)_ |
| Support | Email |

CTA: **Start free trial**

---

### Team — $149 / month (₹6,199) ⭐ Popular

| Feature | Value |
|---|---|
| Projects | Unlimited |
| AI messages | Unlimited |
| File size limit | 1 GB |
| Storage | 100 GB |
| Team members | 10 |
| Scheduled pipelines | 20 |
| Canvases | Unlimited |
| Visualizations Library | Unlimited |
| DB connections | + Snowflake, Redshift, BigQuery _(coming soon)_ |
| Audit log | ✅ |
| Support | Priority email |

CTA: **Start free trial**

---

### Business — $399 / month (₹16,599)

| Feature | Value |
|---|---|
| Projects | Unlimited |
| AI messages | Unlimited |
| File size limit | 1 GB |
| Storage | 500 GB |
| Team members | 50 |
| Scheduled pipelines | Unlimited |
| Canvases | Unlimited |
| Visualizations Library | Unlimited |
| DB connections | + Custom connectors _(coming soon)_ |
| Audit log | ✅ |
| SSO / SAML | _(coming soon)_ |
| Support | 24/7 dedicated |

CTA: **Start free trial**

---

### Enterprise — Custom

| Feature | Value |
|---|---|
| Projects | Unlimited |
| AI messages | Unlimited |
| File size limit | Custom |
| Storage | Custom |
| Team members | Unlimited |
| Scheduled pipelines | Unlimited |
| Canvases | Unlimited |
| Visualizations Library | Unlimited |
| DB connections | Custom _(coming soon)_ |
| White-label option | _(coming soon)_ |
| SSO / SAML | ✅ |
| Audit log | ✅ |
| Custom SLA | ✅ |
| On-premise deploy | ✅ |
| Support | Dedicated account manager |

CTA: **Contact sales** → hello@datahub.org.in

---

## Backend Enforcement

Plan limits are enforced in two backend files:

### `backend/app/services/plan_guard.py`
Enforces per-upload file size, total storage, dataset count, workspace count, allowed file formats, allowed connectors, SSO, scheduling, and canvas/dashboard sharing.

| Plan | Max file size | Max storage | Scheduling | SSO |
|---|---|---|---|---|
| Free | 50 MB | 1 GB | ❌ | ❌ |
| Professional | 1 GB | 20 GB | ✅ | ❌ |
| Team | 1 GB | 100 GB | ✅ | ❌ |
| Business | 1 GB | 500 GB | ✅ | ✅ |
| Enterprise | Unlimited | Unlimited | ✅ | ✅ |

### `backend/app/services/plan_limits.py`
Enforces monthly rolling usage quotas (AI calls, pipeline runs, dataset uploads).

| Plan | AI calls/month | Pipeline runs/month | Dataset uploads/month |
|---|---|---|---|
| Free | 100 | 10 | 3 |
| Professional | 2,000 | 200 | 50 |
| Team | 10,000 | 1,000 | Unlimited |
| Business | Unlimited | Unlimited | Unlimited |
| Enterprise | Unlimited | Unlimited | Unlimited |

---

## DB Connector Roadmap

DB connectors are not yet live. Availability by tier when shipped:

| Connector | Free | Pro | Team | Business | Enterprise |
|---|---|---|---|---|---|
| CSV / Excel | ✅ | ✅ | ✅ | ✅ | ✅ |
| PostgreSQL | ❌ | 🔜 | 🔜 | 🔜 | 🔜 |
| MySQL | ❌ | 🔜 | 🔜 | 🔜 | 🔜 |
| SQLite | ❌ | 🔜 | 🔜 | 🔜 | 🔜 |
| MSSQL | ❌ | 🔜 | 🔜 | 🔜 | 🔜 |
| Oracle | ❌ | 🔜 | 🔜 | 🔜 | 🔜 |
| Snowflake | ❌ | ❌ | 🔜 | 🔜 | 🔜 |
| Redshift | ❌ | ❌ | 🔜 | 🔜 | 🔜 |
| BigQuery | ❌ | ❌ | 🔜 | 🔜 | 🔜 |
| Custom | ❌ | ❌ | ❌ | 🔜 | 🔜 |
| On-premise | ❌ | ❌ | ❌ | ❌ | 🔜 |

---

## Payment Integration

- **Provider**: Razorpay (INR billing)
- **Plans configured in**: `backend/app/razorpay_plans.py`
- **Billing UI**: `frontend/src/components/PlansPanel.tsx`
- **Plan enforcement entry point**: `backend/app/services/plan_guard.py`
- **Canvas limit enforcement**: `backend/app/routers/canvas.py` (`_CANVAS_LIMITS` — Free: 2, Pro: 20, Team/Business/Enterprise: Unlimited)
- **Saved Visualizations**: `backend/app/routers/saved_visualizations.py` (not plan-gated — unlimited for all tiers)
- **Usage tracking**: `backend/app/services/usage_service.py`
