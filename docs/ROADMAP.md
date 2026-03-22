# Roadmap

## Phase 1 - MVP ✅ Complete
- FastAPI backend with dataset upload, profiling, and recipe endpoints
- React frontend shell with upload and table preview
- Docker Compose deployment

## Phase 2 - AI Integration ✅ Complete
- AI-driven profiling and cleanup suggestions (Groq LLM)
- Context memory for business rules (Postgres + Chroma)
- RAG workflows and conversational dataset chat

## Phase 3 - Advanced Analytics & UX ✅ Complete
- Interactive dashboard builder (v2 dashboards with drag-drop layout)
- Dashboard comments
- Collaboration and sharing (signed share links, scopes, rate limits)
- RBAC (viewer/editor/admin), audit logs, per-user audit trail UI
- File version history (version_number, version_note, upload-version endpoint)

## Phase 4 - Extensibility & Automation ✅ Complete
- Plugin/connector API (Supabase, SQL, Sheets, Excel, HTTP CSV)
- Webhooks and scheduled jobs
- Pipeline templates and NL pipeline editing (Groq JSON-mode)
- Approval workflows

## Phase 5 - Monetisation & Growth ✅ Complete
- Five-tier pricing (Free / Professional / Team / Business / Enterprise)
- Razorpay billing (plans, subscriptions, HMAC webhooks)
- Hard usage limits enforced per plan (API calls, pipeline runs, datasets, storage)
- Email notifications via Resend (pipeline complete, 80% usage warning, weekly digest)
- Notification preferences (per-user toggles)
- Rate limiting on all endpoints (slowapi, per-IP)
- File upload validation (format allowlist, MIME check)
- Feedback form with owner email notification
- User reviews section on homepage

## Phase 6 - Enterprise Hardening ➕ Planned
- SSO / SAML (OIDC partially scaffolded)
- On-premise / air-gapped deployment
- Advanced data lineage and compliance packs (SOC2, GDPR)
- White-label option
- 24/7 dedicated support SLA
- Scheduled pipeline runner (currently store-only)
