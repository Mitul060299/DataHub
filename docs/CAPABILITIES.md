# DataHub Capabilities Status

Legend: ✅ Implemented | 🟡 Partial/Scaffolded | ➕ Planned

## 1. Data Ingestion & Connectivity
- CSV upload ✅
- Inline CSV connector ✅
- Excel/Google Sheets/DB/SaaS APIs 🟡 (excel, google_sheets, sql_query, http_csv, supabase)
- Batch imports 🟡 (CSV upload)
- Incremental imports 🟡 (sql_query updated_at)
- Schema/type inference ✅ (pandas inference)
- Connector/plugin system ✅ (registry + load/enable/disable)
- Import UI ✅
- File format validation ✅ (whitelist: CSV, Excel, JSON, Parquet; MIME check; content sniff)
- File size enforcement ✅ (configurable per-plan upload limit)
- File upload preview ✅ (column/row preview before confirming upload)
- Dataset version history ✅ (version_number, version_note columns; upload-version endpoint; UI list)

## 2. AI-Powered Profiling & Cleaning
- Profiling (missing, outliers, types) ✅
- Smart type inference ✅
- Auto-clean suggestions ✅ (rule-based + LLM optional)
- “Did you mean?” suggestions ✅
- Versioned cleaning/undo 🟡 (recipe history in-memory)

## 3. Business Context & Memory
- Glossary/rules API ✅
- Persistence ✅ (Postgres + Chroma optional)
- Context-aware agents ✅
- Versioned context ✅ (versions list + revert)

## 4. AI Agents & Intelligence
- Suggestions/insights ✅ (rule-based + optional LLM via Groq)
- Anomaly detection ✅ (outliers, duplicates, cardinality)
- Explainable insights ✅ (quality score + rationale)
- Insight narratives 🟡 (LLM summary when configured)
- Auto-actions from insights ✅ (missing + duplicates fixes)
- Auto-apply recipes ✅
- Learn from feedback 🟡 (feedback collection API)
- Conversational interface ✅ (dataset chat endpoint + UI)
- NL pipeline editing ✅ (POST /api/pipelines/{id}/nl-edit via Groq; rewrites steps from plain English)

## 5. Transformation & Wrangling
- Recipes API ✅
- Apply recipes ✅
- Auditable/reversible ✅
- Advanced transforms (joins/pivots/formulas) ✅
- Dataset lineage/provenance ✅ (parent dataset tracking + lineage API)

## 6. Analytics & Visualizations
- Summary charts ✅
- Dashboards CRUD ✅
- Widget system ✅
- Drag/drop builder 🟡
- Export PDF/SVG/PNG ✅
- Usage analytics ✅ (audit-based summary)
- Correlation insights ✅
- Interactive chart controls 🟡 (bins/top-N implemented)
- Configurable widget settings ✅
- Dashboard templates ✅
- Widget theming ✅
- Dashboard comments ✅ (GET/POST/DELETE /api/dashboards/{id}/comments with auth)

## 7. Collaboration & Automation
- Webhooks ✅
- Scheduled jobs 🟡 (database-backed store; no runner yet)
- Approval workflows ✅
- Approval filters ✅
- Real-time collaboration ✅ (presence/chat with auth token)
- Dashboard sharing ✅
- Shared dashboard view ✅
- Workspace sharing ✅
- Shared workspace view ✅
- Share link expiry ✅
- Shared link rate limiting ✅
- Signed share links ✅
- Share access auditing ✅
- Share scopes ✅
- Bulk revoke shared links ✅
- Admin share management ✅
- Weekly digest email ✅ (per-user 7-day activity summary via cron endpoint + Resend)
- Email — pipeline complete notification ✅ (Resend; respects user pref)
- Email — 80% usage warning ✅ (Resend; respects user pref)
- Notification preferences ✅ (GET/PUT /users/me/notification-preferences; 3 toggles)
- Projects ✅ (user-scoped project grouping for pipelines, dashboards, data sources)

## 8. Extensibility & Integration
- REST API ✅
- Plugin framework ✅
- External connectors ✅ (Supabase, SQL, Sheets, Excel, HTTP CSV)
- Two-way sync ✅

## 9. Security & Compliance
- Audit viewer UI ✅ (settings page with pagination + filter)
- Per-user audit log API ✅ (GET /users/me/audit-log; paginated, filterable)
- Role-based access ✅ (viewer/editor/admin)
- OIDC SSO 🟡 (requires configuration)
- Rate limiting ✅ (slowapi; per-IP, per-endpoint limits; 429 + Retry-After)
- File upload validation ✅ (format allowlist, MIME check, content sniff)
- Usage enforcement ✅ (hard limits per plan; 429 on exceed)

## 10. Billing & Monetisation
- Pricing tiers ✅ (Free / Professional / Team / Business / Enterprise)
- Razorpay integration ✅ (plans, subscriptions, HMAC-verified webhooks)
- Usage tracking ✅ (user_usage table, monthly period buckets)
- Plan limit enforcement ✅ (API calls, pipeline runs, datasets, storage)
- Usage UI ✅ (settings page usage panel with progress bars)

## 11. Community & Feedback
- Homepage feedback form ✅ (POST /feedback; name, email, subject, message)
- Feedback email notifications ✅ (sent to owner via Resend on submission)
- User reviews ✅ (POST /api/reviews; star rating 1–5; owner-approved before display)
- Reviews homepage section ✅ (public display of approved reviews + submit form)

## 12. Deployment & DevOps
- Docker Compose ✅
- Helm placeholders ✅
- CI build ✅
- Deploy/rollback pipeline ✅
- Monitoring ✅ (Prometheus/Grafana compose)
- Performance optimisations ✅ (dataset cache with TTL/LRU)
- Query caching ✅ (profiling/summary cache + invalidation)
- Startup schema safety-net ✅ (DDL guards in main.py; bypasses stalled Alembic migrations)

## 11. Supabase Integration
- Supabase connector ✅
- Supabase JWT validation ✅
