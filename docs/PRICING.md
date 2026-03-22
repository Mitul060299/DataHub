# DataHub Pricing

_Last updated: March 2026_

---

## Overview

DataHub is priced in **USD** with INR equivalents shown in brackets. All plans are billed monthly per workspace (not per seat).

| Tier | Price | INR Equivalent |
|---|---|---|
| Free | $0 | — |
| Professional | $40 / month | ₹3,299 / month |
| Team | $75 / month | ₹6,199 / month |
| Business | $100 / month | ₹8,299 / month |
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
| Dashboards | 2 |
| DB connections | CSV & Excel only |
| Support | Community |

CTA: **Get started**

---

### Professional — $40 / month (₹3,299)

| Feature | Value |
|---|---|
| Projects | Unlimited |
| AI messages | 500 / month |
| File size limit | 1 GB |
| Storage | 20 GB |
| Team members | 1 |
| Scheduled pipelines | 5 |
| Dashboards | 20 |
| DB connections | CSV, Excel, Google Sheets |
| Support | Email |

CTA: **Start free trial**

---

### Team — $75 / month (₹6,199) ⭐ Popular

| Feature | Value |
|---|---|
| Projects | Unlimited |
| AI messages | Unlimited |
| File size limit | 1 GB |
| Storage | 100 GB |
| Team members | 10 |
| Scheduled pipelines | 20 |
| Dashboards | Unlimited |
| DB connections | + PostgreSQL, MySQL _(coming soon)_ |
| Audit log | ✅ |
| Support | Priority email |

CTA: **Start free trial**

---

### Business — $100 / month (₹8,299)

| Feature | Value |
|---|---|
| Projects | Unlimited |
| AI messages | Unlimited |
| File size limit | 1 GB |
| Storage | 500 GB |
| Team members | 50 |
| Scheduled pipelines | Unlimited |
| Dashboards | Unlimited |
| DB connections | + Snowflake, BigQuery _(coming soon)_ |
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
| Dashboards | Unlimited |
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
Enforces per-upload file size, total storage, dataset count, workspace count, allowed file formats, allowed connectors, SSO, scheduling, and dashboard sharing.

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
| Google Sheets | ❌ | ✅ | ✅ | ✅ | ✅ |
| PostgreSQL | ❌ | ❌ | 🔜 | 🔜 | 🔜 |
| MySQL | ❌ | ❌ | 🔜 | 🔜 | 🔜 |
| Snowflake | ❌ | ❌ | ❌ | 🔜 | 🔜 |
| BigQuery | ❌ | ❌ | ❌ | 🔜 | 🔜 |
| Custom | ❌ | ❌ | ❌ | ❌ | 🔜 |

---

## Payment Integration

- **Provider**: Razorpay (INR billing)
- **Plans configured in**: `backend/app/razorpay_plans.py`
- **Billing UI**: `frontend/src/components/PlansPanel.tsx`
- **Plan enforcement entry point**: `backend/app/services/plan_guard.py`
- **Usage tracking**: `backend/app/services/usage_service.py`
