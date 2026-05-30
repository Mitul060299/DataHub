# Compliance & Enterprise Hardening

## Scope
This document outlines compliance controls for GDPR and SOC2 readiness.

## GDPR Compliance ✅

### Article 20 — Right to Data Portability
- `GET /users/me/gdpr-export` returns a single JSON payload containing the user’s full data:
  profile, projects, datasets, pipelines (V1 + V2), dashboards, audit log (last 1,000 entries),
  feedback, support chat history, usage history.
- All fields wrapped in independent try/except blocks so missing tables never break the export.

### Article 17 — Right to Erasure
- `DELETE /users/me/gdpr-erase` performs a cascading hard delete across 30+ tables.
- Queues any S3-backed dataset paths into `pending_storage_deletes` for async background cleanup.
- Audit log rows are **anonymised** (actor set to `[deleted]`) rather than hard-deleted to preserve compliance audit trails.
- Deletes the user’s owned organization if `owner_user_id` matches.
- Final step: `db.delete(user)` + commit.

## SOC2 Readiness
- **Access controls**: RBAC (viewer / editor / admin) enforced on all endpoints.
- **Audit logging**: every mutating request (POST/PUT/DELETE) is logged by `audit_middleware`.
  Per-user audit trail accessible via `GET /users/me/audit-log`.
- **Encryption at rest**: dataset artifacts stored as Parquet in S3/R2/GCS with provider-managed
  encryption; connector credentials encrypted before storage.
- **TLS termination**: Render / Vercel / Cloudflare (Caddyfile for self-hosted).
- **Secrets management**: all secrets via environment variables; no hardcoded credentials.
- **Rate limiting**: per-IP and per-user rate limiting on all endpoints.
- **XXE prevention**: SAML Response XML parsed via `defusedxml` (disables DTD, entity expansion).

## Enterprise SSO
- **OIDC**: full discovery → JWKS → token exchange flow (`/auth/oidc/login`, `/auth/oidc/callback`).
- **SAML 2.0**: SP-initiated SSO with POST binding; ACS handler verifies RSA-SHA256 XML-DSig
  signature using the stored PEM certificate; user provisioned on first login.
  Enterprise plan required to configure (`POST /auth/saml/config`).

## White-Label Branding
- Business plan: hide DataHub badge (`hide_datahub_branding`).
- Enterprise plan: inject arbitrary custom CSS, set custom domain product name, logo, favicon,
  and primary colour theme at runtime via `useBranding` hook.
