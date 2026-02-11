# DataHub Capabilities Status

Legend: ✅ Implemented | 🟡 Partial/Scaffolded | ⭕ Planned

## 1. Data Ingestion & Connectivity
- CSV upload ✅
- Inline CSV connector ✅
- Excel/Google Sheets/DB/SaaS APIs 🟡 (excel, google_sheets, sql_query, http_csv, supabase)
- Batch imports 🟡 (CSV upload)
- Incremental imports 🟡 (sql_query updated_at)
- Schema/type inference ✅ (pandas inference)
- Connector/plugin system ✅ (registry + load/enable/disable)
- Import UI ✅ (file upload wired to dataset upload)

## 2. AI-Powered Profiling & Cleaning
- Profiling (missing, outliers, types) ✅
- Smart type inference ✅
- Auto-clean suggestions ✅ (rule-based + LLM optional)
- “Did you mean?” suggestions ✅
- Versioned cleaning/undo 🟡 (recipe history is in-memory)

## 3. Business Context & Memory
- Glossary/rules API ✅
- Persistence ✅ (Postgres + Chroma optional)
- Context-aware agents ✅ (workspace-aware context)
- Versioned context ✅ (versions list + revert)

## 4. AI Agents & Intelligence
- Suggestions/insights ✅ (rule-based + optional LLM)
- Anomaly detection ✅ (outliers, duplicates, cardinality)
- Explainable insights ✅ (quality score + rationale)
- Insight narratives 🟡 (LLM summary when configured)
- Auto-actions from insights ✅ (missing + duplicates fixes)
- Auto-apply recipes ✅ (manual trigger)
- Learn from feedback 🟡 (feedback collection API)
- Conversational interface ✅ (dataset chat endpoint + UI)

## 5. Transformation & Wrangling
- Recipes API ✅
- Apply recipes ✅
- Auditable/reversible ✅
- Advanced transforms (joins/pivots/formulas) ✅ (join/pivot/formula steps)
- Dataset lineage/provenance ✅ (parent dataset tracking + lineage API)

## 6. Analytics & Visualizations
- Summary charts ✅ (column summaries)
- Dashboards CRUD ✅
- Widget system ✅ (summary/table/correlation)
- Drag/drop builder 🟡 (builder UI scaffold; not persisted)
- Export PDF/SVG/PNG ✅ (client-side export)
- Usage analytics ✅ (audit-based summary)
- Correlation insights ✅ (numeric correlations)
- Interactive chart controls 🟡 (bins/top-N implemented; normalize planned)
- Configurable widget settings ✅ (bins/top-N per widget)
- Dashboard templates ✅ (starter gallery)
- Widget theming ✅ (per-widget color)

## 7. Collaboration & Automation
- Webhooks ✅ (database-backed registry + event dispatch)
- Scheduled jobs 🟡 (database-backed store; no runner)
- Approval workflows ✅ (requests + approve/reject)
- Approval filters ✅ (status/requester/resource)
- Real-time collaboration ✅ (presence/chat with auth token)
- Dashboard sharing ✅ (share links)
- Shared dashboard view ✅ (read-only shared page)
- Workspace sharing ✅ (share links)
- Shared workspace view ✅ (read-only shared page)
- Share link expiry ✅ (optional expiration)
- Shared link rate limiting ✅ (fixed window)
- Signed share links ✅ (HMAC signature; requires secret)
- Share access auditing ✅ (audit logs for shared views)
- Share scopes ✅ (scope metadata on links)
- Share scope allowlist ✅ (server-side validation)
- Share scope policies ✅ (role-based sharing rules)
- Bulk revoke shared links ✅ (admin unshare all)
- Admin share management ✅ (list/revoke shared items)
- Share settings visibility ✅ (admin config view)
- Expired share purge ✅ (admin cleanup)
- Audit time filters ✅ (since/limit)

## 8. Extensibility & Integration
- REST API ✅
- Plugin framework ✅
- External connectors ✅ (Supabase, SQL, Sheets, Excel, HTTP CSV)
- Two-way sync ✅ (pull/push sync)

## 9. Security & Compliance
- Audit viewer UI ✅
- Role-based access ✅ (viewer/editor/admin)
- OIDC SSO 🟡 (requires configuration)

## 10. Deployment & DevOps
- Docker Compose ✅
- Helm placeholders ✅
- CI build ✅
- Deploy/rollback pipeline ✅ (release workflow + rollback notes)
- Monitoring ✅ (Prometheus/Grafana compose)
- Performance optimizations ✅ (dataset cache with TTL/LRU)
- Query caching ✅ (profiling/summary cache + invalidation)

## 11. Supabase Integration
- Supabase connector ✅
- Supabase JWT validation ✅
