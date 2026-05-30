# DataHub — Engineering Changelog

This file tracks all non-trivial changes made to the codebase: security fixes, bug fixes, performance improvements, cleanup, and UI/UX work. Most recent entries first.

---

## 2026-05-30 — Phase 11 Dashboard Overhaul: Filter Bar, New Chart Types, Chart Switcher, Auto-Refresh, RGL Canvas

### New chart types — `echarts_builder.py` + `echartsBuilder.ts`
- `backend/app/services/echarts_builder.py` — 5 new private builder functions added:
  - `_build_funnel(rows, label_col, value_col, title, subtitle)` — funnel series sorted descending, gradient fill per stage
  - `_build_gauge(rows, value_col, title, subtitle, min_val, max_val)` — single-KPI dial; auto-scales max; colour thresholds: green ≤33%, purple ≤66%, red above
  - `_build_treemap(rows, label_col, value_col, title, subtitle)` — proportional area treemap with palette colouring
  - `_build_radar(rows, x_col, y_cols, title, subtitle)` — spider chart; multi-y_col mode (each y_col = axis, each row = series) or single-y_col mode
  - `_build_dual_axis(rows, x_col, y_cols, title, subtitle)` — first y_col as bar on left yAxis, rest as line on right yAxis (combo chart)
- Dispatcher in `build_echarts_config` extended to handle: `funnel`, `gauge`, `treemap`, `radar`, `dual_axis` / `dual-axis` / `combo`
- `infer_chart_type` heuristics extended — context-keyword patterns for funnel (pipeline/conversion), gauge (KPI/dial), treemap (hierarchy/breakdown), radar (multi-dimensional/spider), dual_axis (combo/dual-axis/secondary-axis) — each guarded by `len(num_cols) >= 2` where appropriate
- `frontend/src/lib/echartsBuilder.ts` — `buildEChartsConfig` fully rewritten; now covers: `bar`, `horizontal_bar`, `line`, `area` (gradient fill), `scatter`, `pie`, `donut`, `heatmap`, `waterfall`, `funnel`, `gauge`, `treemap`, `radar`, `dual_axis` / `combo`, `table`

### DashboardFilterBar — new component
- `frontend/src/components/DashboardFilterBar.tsx` (new) — persistent dimension filter row above the dashboard grid
  - `ActiveFilter` type: `{ id, column, operator: "=" | "!=" | "contains" | ">" | "<", value }`
  - Active filter chips (column OP value + × remove) with inline add-filter form (column selector + operator selector + value input)
  - Apply on Enter, dismiss on Escape
- `frontend/src/pages/DashboardPage.tsx` — wired in:
  - `applyDashFilters(cfg, filters)` — applies all 5 operators against xAxis.data / series labels; dims non-matching items to opacity 0.08
  - `activeFilters` + `filterBarVisible` state added
  - `⊟ Filter` toggle button in header (shows live count when filters active)
  - `DashboardFilterBar` rendered below header when visible
  - `displayCfg` now applies dash filters after cross-filter

### Chart type switcher — DashboardPage TileCard
- `CHART_TYPES` constant — 15 types: bar, horizontal_bar, line, area, scatter, pie, donut, heatmap, waterfall, funnel, gauge, treemap, radar, dual_axis, table
- `⇄` button in TileCard header (visible in edit mode for chart/table tiles) opens a 3-column popover grid of all 15 types with active-type highlight
- `handleChartTypeChange(tileId, chartType)` — calls `updateDashboardTile` then `handleTileRefresh` to rebuild the ECharts config server-side
- `onChartTypeChange` and `activeFilters` props threaded through to every `<TileCard>` instance

### Auto-refresh — DashboardPage
- `SettingsOverlay` now includes an **Auto-refresh interval** `<select>` (Off / 1 / 5 / 15 / 30 / 60 min); saved to `dashboard.theme.refresh_interval_mins`
- `useEffect` timer in `DashboardPage` calls `handleTileRefresh` for all chart + metric tiles on the configured interval; cleared on unmount or interval change

### DashboardCanvas → react-grid-layout
- `frontend/src/components/DashboardCanvas.tsx` — migrated from absolute positioning + custom drag handlers to `react-grid-layout`:
  - `WidthProvider(GridLayout)` with 12-column grid, 60px row height, 8px gutters
  - Layout persisted to localStorage under new key `dh:dashboard:layout:{projectId}` (was `dh:dashboard:positions:{projectId}`)
  - Default layout: 2-column grid, 6 cols × 5 rows per tile
  - Both drag (via `.canvas-drag-handle` header class) and resize are enabled
  - Tiles are `display:flex;flex-direction:column` so the ECharts renderer fills available height
  - Old `Position`, `toPosition`, `dragging` ref, `handleMouseDown`, and `persistPositions` removed

### Bug fix — AIPanel.tsx
- `frontend/src/components/AIPanel.tsx` — fixed pre-existing JSX parse error (TS2657 / esbuild `Expected ")"` at line 1871): wrapped two sibling `<div>` elements inside `{aiMode === "chat" && (...)}` in a `<>` Fragment; build was failing silently when run from the wrong working directory

---

## 2026-05-30 — Phase 10 Enterprise: SAML 2.0 SSO + GDPR + White-Label Branding

### SAML 2.0 SP (Enterprise SSO)
- `backend/app/routers/saml.py` (new) — full SAML 2.0 Service Provider implementation:
  - `GET /auth/saml/metadata` — SP metadata XML (entity ID, ACS URL, NameID format)
  - `GET /auth/saml/login?org_id=` — redirect user to IdP SSO URL
  - `POST /auth/saml/acs` — Assertion Consumer Service; decodes Base64 SAML Response; parses with `defusedxml` (XXE-safe); verifies RSA-SHA256 XML-DSig signature against stored PEM cert using `cryptography`; provisions user on first login; issues app JWT; redirects to frontend with token in fragment
  - `POST/GET/DELETE /auth/saml/config` — IdP config CRUD (Enterprise plan required)
- `backend/app/models_db.py` — `SamlIdpConfigDB` added (`saml_idp_configs` table; `org_id` PK FK to organizations)
- `backend/app/main.py` — `saml_idp_configs` DDL entry #0086 in startup safety-net; `saml_router` registered
- `backend/requirements.txt` — `defusedxml>=0.7.1` added
- `frontend/src/api.ts` — `SamlIdpConfig` interface; `fetchSamlConfig`, `updateSamlConfig`, `deleteSamlConfig`
- `frontend/src/pages/SettingsPage.tsx` — `SamlConfigPanel` component; "SAML SSO" sidebar item; `"saml"` section type
- `frontend/src/App.tsx` — `/settings/saml` route

### GDPR Compliance
- `backend/app/routers/users.py` — two new endpoints:
  - `GET /users/me/gdpr-export` — Article 20 full data portability; JSON export of all user-owned data (30+ tables)
  - `DELETE /users/me/gdpr-erase` — Article 17 right to erasure; cascades hard delete across all user tables; queues S3 paths for async cleanup; anonymises audit log actor to `[deleted]`
- `frontend/src/api.ts` — `gdprExport()`, `gdprErase()`

### White-Label Branding
- `backend/app/models_db.py` — `OrganizationBrandingDB` added (`organization_branding` table)
- `backend/app/routers/branding.py` (new) — `GET/PUT/DELETE /organization/branding`; `hide_datahub_branding` requires Business; `custom_css` requires Enterprise
- `backend/app/main.py` — `organization_branding` DDL entry #0085; `branding_router` registered
- `frontend/src/hooks/useBranding.ts` (new) — fetches org branding on mount; applies `--brand-primary` CSS vars, favicon, `<title>`, and custom CSS injection
- `frontend/src/App.tsx` — `useBranding()` called at app root; `/settings/branding` route
- `frontend/src/pages/SettingsPage.tsx` — `BrandingPanel` component; colour picker + plan-gated controls

---

## 2026-05-25 — Phase S2/S3: DuckDB-WASM + QStash Background Workers

### DuckDB-WASM (browser-side analytics)
- `backend/app/routers/datasets.py` — `GET /datasets/{id}/presigned-url` returns short-lived S3 signed URL for client-side DuckDB queries; rate-limited 60 req/min
- `frontend/src/hooks/useDuckDB.ts` (new) — module singleton; lazy WASM init via jsDelivr CDN; presigned URL cache with 60 s buffer; `runQuery(datasetId, sql)` → Arrow → plain JS rows
- `frontend/src/lib/echartsBuilder.ts` (new) — `buildEChartsConfig()` + `extractMetricValue()` TypeScript mirror of Python chart builder
- `frontend/src/pages/DashboardPage.tsx` — `handleTileRefresh` runs client-side DuckDB first for chart/metric tiles; double-fallback to server on error or missing `dataset_id`

### QStash Background Workers (Phase S3)
- `backend/app/routers/jobs.py` — `POST /jobs/worker` with HMAC-SHA256 signature verification from QStash signing keys
- `backend/app/services/job_queue.py` — `enqueue_pipeline_job()` publishes to QStash when `QSTASH_TOKEN` set; in-process fallback when absent
- `frontend/src/hooks/useRealtimePipelineRun.ts` (new) — subscribes to `pipeline:{id}` Supabase Realtime channel; `triggerRun()` stores `run_id` and filters events to avoid collisions

---

## 2026-05-11 — DirectQuery (Live Connect) Mode

**Backend:**
- `backend/app/services/connectors.py` — `_apply_sample_limit(query, config, dialect)` helper wraps any SQL query with a dialect-aware row limit when `config["_sample_limit"]` is set. Supports `standard` (LIMIT), `mssql` (TOP N), and `oracle` (ROWNUM) dialects. Applied to 8 SQL connectors: PostgreSQL, MySQL, SQLite, MSSQL, Oracle, Redshift, Snowflake, BigQuery.
- `backend/app/routers/connectors.py` — `POST /connectors/import` now accepts `import_mode: "cached" | "live"`. In live mode: (1) pulls only 500 rows (`_sample_limit=500`) as a preview; (2) automatically creates a `ConnectorCredentialDB` row from the connection config when one is not already present, so query folding can decrypt credentials during pipeline execution.
- `backend/app/models.py` — `DatasetMeta` Pydantic model gains an `import_mode: Optional[str]` field.
- `backend/app/routers/datasets.py` — `GET /datasets` list response now includes `import_mode` per dataset.

**Frontend:**
- `frontend/src/api.ts` — `importFromConnection` gains an `importMode: "cached" | "live"` parameter (defaults to `"cached"`). Sends `save_credential: true` for live mode so the backend persists credentials for query folding.
- `frontend/src/components/modals/ConnectorModal.tsx` — Power BI-style connection type selector added to the **configure step** (before table browsing): two cards — **Import** (copy data into DataHub, fast queries, manual refresh) and **DirectQuery** (query source directly, always fresh, no storage used). The **browse step** now shows a static mode badge (`⬇ Import` / `⚡ DirectQuery`) instead of a changeable toggle — mode is committed before you see tables. Button labels: `Load` for Import, `Connect` for DirectQuery. Footer CTA: `Save & browse tables` / `Connect & browse tables`. Warning banner in browse step explains the 500-row preview + pipeline push-down behaviour.
- `frontend/src/components/ExplorerPanel.tsx` — dataset list mapping: `import_mode === "live"` overrides `file_format` → `"live"` so the dataset shows a green badge.
- `frontend/src/components/DataSection.tsx` — `normalizeFormat` recognises `"live"`; `formatAccent` maps `live` → `#34d399` (green).

**How it works:**
1. User selects **DirectQuery** in the connector modal → 500-row sample stored (Parquet + JSONB) for schema inference and AI agent context.
2. Dataset appears in the Explorer with a green ⚡ `LIVE` badge.
3. When a pipeline runs, `FoldabilityClassifier` + `QueryFoldOptimizer` (in `pipeline_engine.py`) push SQL back to the source database using the stored encrypted credentials.
4. Each pipeline step's output is materialized as a Parquet snapshot in object storage (R2/S3) via `step_materialize`.

---

## 2026-05-11 — DuckDB Session Replay Fix (commit `1295377`)

**Bug:** After a page refresh, `_replay_session_views()` in `ai_agent_service.py` skipped source registration for datasets backed by JSONB chunks (no `storage_path`), causing `"Catalog Error: Table … does not exist"` on the first AI query.

**Fix:**
- `backend/app/services/ai_agent_service.py` — added `elif dataset:` branch in `_replay_session_views()`: loads rows from `DatasetChunkDB`/`DatasetDataDB`, creates `TABLE "{alias}"`, `VIEW "dataset"`, and `VIEW "{uuid_alias}"` so stored SQL referencing the UUID alias resolves correctly.
- `backend/app/services/agent/nodes/context_loader.py` — JSONB branch now also registers `VIEW "{uuid_alias}"` after `CREATE TABLE "{_primary_alias}"` so both name forms resolve in the session.

---

## 2026-05-10 — SEO Blog Infrastructure

**New pages (`/blog`, `/blog/:slug`):**
- `frontend/src/pages/BlogIndexPage.tsx` — public card-grid listing all 10 articles; JSON-LD `Blog` schema; no auth required.
- `frontend/src/pages/BlogPostPage.tsx` — article shell that lazy-loads each article component by slug; JSON-LD `Article` schema (headline, datePublished, author, publisher); unknown slugs redirect to `/blog`.
- `frontend/src/data/blogPosts.ts` — central registry (slug, title, excerpt, date, readTime, tags) with `getPostBySlug` and `getRelatedPosts` helpers.
- `frontend/src/content/blog/_components.tsx` — shared styled components used by all articles: `H2`, `H3`, `P`, `Lead`, `UL`, `LI`, `OL`, `Callout` (info/tip/warning), `CodeBlock`, `InlineCode`, `CompareTable`, `MidCTA`, `FAQ`, `Article`.

**10 long-form articles (1,800–2,100 words each):**

| Slug | Target query |
|------|--------------|
| `reconcile-excel-files-automatically` | how to reconcile two Excel files automatically |
| `remove-duplicates-csv-without-code` | remove duplicates from CSV without code |
| `alteryx-alternative-cheaper` | Alteryx alternative cheaper |
| `data-cleaning-tool-for-analysts` | data cleaning tool for analysts |
| `standardise-column-names-excel` | how to standardise column names in Excel |
| `clean-messy-excel-csv-without-coding` | clean messy Excel/CSV without coding |
| `affordable-alteryx-alternative-small-teams` | affordable Alteryx alternative small teams/freelancers |
| `prepare-raw-data-for-power-bi` | how to prepare raw data for Power BI dashboards |
| `why-analysts-spend-more-time-cleaning` | why analysts spend more time cleaning data |
| `automate-repetitive-data-cleaning-workflows` | automate repetitive data cleaning workflows |

Each article includes a comparison table, FAQ section, mid-article CTA, and end CTA driving to `/signup` and `/pricing`.

**Routing & prerender:**
- `frontend/src/App.tsx` — `/blog` and `/blog/:slug` routes added as public routes (outside `AppShell`).
- `frontend/scripts/prerender-routes.mjs` — 11 new entries (blog index + 10 articles) so Vercel serves real HTML to crawlers instead of the JS bundle.

**SEO config:**
- `frontend/public/sitemap.xml` — 11 new `<url>` entries (priority 0.8; blog index `changefreq weekly`, articles `changefreq monthly`).
- `frontend/public/robots.txt` — explicit `User-agent: Googlebot` and `User-agent: Bingbot` sections with `Allow: /blog` and `Allow: /blog/`.

---

## 2026-05-08 — Documentation Refresh

**Updated docs:**
- `docs/ONBOARDING.md` — full rewrite to reflect current UI: added Welcome Modal (4-slide walkthrough), Workspace Layout (always-visible Explorer, Pipeline tab inline layout, AI panel hide behaviour), First-Time Tour (8 current steps), and Getting Started Checklist sections. Updated Pipeline Operations section to reference the Pipeline tab. Fixed broken `＋ Join` character. Updated AI Chat Agent description.
- `docs/CAPABILITIES.md` — corrected AI agent state machine node count from 8 to 9 (`clarify_step` node was missing from the summary).
- `docs/AI_AGENT_AUTO_MODE.md` — updated `Last updated` date to 2026-05-08.
- `docs/WEB_APP_USER_JOURNEY_PROPOSAL.md` — added May 8, 2026 implementation status block documenting all workspace simplification and onboarding overhaul changes.

---

## 2026-05-08 — Onboarding Overhaul

**WelcomeModal (redesigned):**
- `frontend/src/components/WelcomeModal.tsx` — replaced single-screen modal with a 4-slide interactive walkthrough: (1) feature overview with feature cards, (2) Data tab tips, (3) Pipeline tab tips, (4) sample dataset picker. Animated progress dots allow jumping between slides. Back/Next navigation on every slide.

**Tour (updated):**
- `frontend/src/components/TourTooltip.tsx` — removed broken `activity-pipeline` step (ActivityBar was removed in a prior commit). Added new `pipeline-tab` step pointing at the Pipeline tab button. Rewrote all step copy to be more concrete and action-oriented (8 steps total).
- `frontend/src/components/CanvasPanel.tsx` — added `data-tour="pipeline-tab"` to the Pipeline tab button so the tour can highlight it. Refactored tab array to use `tourTarget?: string` instead of `tourAttr?: boolean`.

**Onboarding progress widget:**
- `frontend/src/components/OnboardingProgress.tsx` — updated step hints to reference the current UI (Pipeline tab instead of Pipeline panel, corrected keyboard shortcut).

**Styles:**
- `frontend/src/styles/global.css` — added CSS for new welcome modal slide components: progress dots, slide badge, feature cards, tips list, nav row.

---

## 2026-05-08 — Hide AI Panel on Pipeline Tab + Panel Border Fix

**UI behaviour:**
- `frontend/src/components/CanvasPanel.tsx` — added `onTabChange` prop; tab switches now propagate up to the parent so `WorkspacePage` can react to the active tab.
- `frontend/src/pages/WorkspacePage.tsx` — added `canvasTab` state. `AIPanel` and its drag handle are now only rendered when `canvasTab !== "pipeline"`, giving the pipeline tab the full horizontal width for the visual graph + applied steps.

**Visual polish:**
- `frontend/src/components/ExplorerPanel.tsx` — panel border changed from `var(--bd)` (`#ffffff0e`, ~5% opacity) to `var(--bd3)` (`#ffffff26`, ~15% opacity); background lifted from `var(--bg1)` to `var(--bg2)` so the left sidebar visually separates from the canvas. Project selector button bumped to `var(--bg3)` background so it has contrast against the new panel background.
- `frontend/src/components/AIPanel.tsx` — same border + background treatment as ExplorerPanel: `borderLeft` uses `var(--bd3)`, background is `var(--bg2)`, header background updated to match.

---

## 2026-05-08 — Workspace UI Simplification

**Removed:**
- `frontend/src/pages/WorkspacePage.tsx` — removed `ActivityBar` component and its two toggle buttons (Explorer toggle, Pipeline toggle). Removed `PipelinePanel` sliding overlay and all related state (`explorerOpen`, `pipelineOpen`, `pipelineWidth`, `resizingPipeline`). `ExplorerPanel` is now always visible; no toggle needed.
- Explorer resize calculation: removed `activityBarWidth = 52` offset now that the ActivityBar strip is gone.

**Changed:**
- `frontend/src/components/CanvasPanel.tsx` — on the "Pipeline" tab, `PipelineGraphTab` (visual graph) is now shown side-by-side with `PipelineSection` (steps list + controls, 300px right panel) instead of the graph alone. Pipeline configuration is now permanently available on the Pipeline tab without needing a separate overlay panel.

---

## 2026-05-08 — Dead Code Cleanup

**Frontend removed:**
- `frontend/src/components/AutoGoalPanel.tsx` — fully implemented component (~250 lines) never imported anywhere; orphaned.
- `frontend/src/components/RefreshIndicator.tsx` — animated spinner component never imported anywhere; orphaned.

**Backend removed:**
- `backend/app/routers/exports.py` — single-line deprecation comment, never mounted in `main.py`. Functionality lives in `datasets.py`.
- `backend/app/services/dl_service.py` — stub deep-learning service returning hardcoded mock results (`accuracy: 0.88`). No callers.
- `backend/app/services/automl_service.py` — stub AutoML service returning mock configs. No callers.
- 18 development-artifact `.txt` files from `backend/` root (`test_final*.txt`, `_audit_run.txt`, `_orgs*.txt`, etc.) — captured test output / audit logs committed by mistake.

---

## 2026-05-08 — UI/UX Improvements (commit `153bbc8`)

**Correctness bugs:**
- `DataTable` — rows keyed by array index → now uses `row.id` / `row.__id`; prevents stale DOM reuse on sort/filter.
- `VisualizationsSection` — delete was instant and irreversible; added confirmation dialog.
- `PipelineSection` — "Clear steps" success was silent; now fires a `"Pipeline cleared"` toast via global event bus.
- `SharePanel` — revoke-access and delete-public-link errors only logged to console; now surface a user-visible toast.

**Form validation:**
- `SignupPage` — submit button was only gated on `termsAccepted`; now also requires non-empty email and `password ≥ 8 chars`. Added "Minimum 8 characters" hint when field is empty.

**Accessibility:**
- `TopBar` — user menu button gains `aria-label="Open user menu"`.
- `SharePanel` — tabs get `role="tablist"` / `role="tab"` / `aria-selected`; close button gains `aria-label`.

**Responsive layout (mobile < 768 px):**
- `SettingsPage` — 2-column `200px 1fr` grid stacks to single column.
- `SharePanel` — fixed `width: 400` capped to `min(400px, 92vw)`.
- `CanvasView` — canvas card grid `minmax(220px)` drops to `minmax(160px)`.

---

## 2026-05-07 — Thread-Safety & Deprecated DateTime (commit `0cd3da6`)

- `datasets.py` — `_ensure_dataset_meta_schema` was not thread-safe; concurrent requests could race to run `ALTER TABLE`. Wrapped in double-checked locking with `_DATASET_META_SCHEMA_LOCK`.
- `chat_sessions.py` — all 4 `datetime.utcnow()` calls replaced with `datetime.now(timezone.utc)` (deprecated in Python 3.12, raises `DeprecationWarning` in 3.12+).

---

## 2026-05-06 — IDOR & Timer Cleanup (commit `af5f3db`)

- `pipelines.py` + `models_db.py` — `PipelineDB` lacked `user_id`; any authenticated user could read/edit/delete/run any pipeline. Added ownership filter on all CRUD and run operations.
- `pipeline_engine.py` — `extra_input_dataset_ids` accepted any dataset ID without ownership check; users could bind other users' data. Now validated against `user_id`.
- `PipelineContext.tsx` — `sessionSyncTimerRef` was never cleared on unmount; caused a `setState` call on unmounted component. Added cleanup in `useEffect` return.

---

## 2026-05-06 — Stability, Injection & API Path Fixes (commit `c8b3fc7`)

- `fold_optimizer.py` — BigQuery identifiers were inserted into SQL without escaping backticks; a project/dataset/table name containing a backtick would break generated SQL. Added `_bq_esc()` helper.
- `datasets.py` — export endpoint accepted `sort_by` and `filter_col` from query params without validation; those were interpolated into a `ORDER BY` / `WHERE` clause. Now validated against dataset schema columns.
- `api.ts` — 12 API functions (visualizations + canvas) had a double `/api/api/` prefix, making them 404 in production. Fixed.
- `App.tsx` — rate-limit toast was always shown for 5 s regardless of the `Retry-After` header. Now uses `retryAfter * 1000`.
- `PipelineSection.tsx` — CSS `@keyframes` re-injected into `<head>` on every render; moved to a one-time `useEffect`.
- `config.py` — bare `except Exception: pass` on Razorpay plan import silently hid real errors (e.g. syntax errors). Now only catches `ModuleNotFoundError`; all other exceptions are logged.

---

## 2026-05-05 — Critical Security Fixes (commit `d1669df`)

**Auth bypass:**
- `imports.py` — all 6 import/connector endpoints lacked authentication; any anonymous user could list, preview, delete connectors. Added `get_current_subject` + `user_id` ownership filter to all endpoints.
- `users.py` — silent role escalation: `elif user.role == "viewer": user.role = "admin"` was present in the update handler. Removed.
- `security.py` — an invalid/tampered JWT Bearer token was treated as `"viewer"` instead of `"unauthenticated"`, granting partial access. Fixed.

**Information leakage:**
- `main.py` — both 500 handlers returned `str(exc)` in the response body, leaking internal stack details. Changed to `"Internal server error"` with a server-side `logger.error()`.
- `.env.production.example` — contained a Razorpay test key and `localhost` in `CORS_ORIGINS`. Cleaned up.

**OIDC/SSO:**
- `auth.py` — OIDC callback hardcoded every SSO user's role as `"viewer"`. Now reads `datahub_role` / `role` from JWT claims.

**IDOR:**
- `billing.py` — invoice PDF endpoint returned any invoice URL given an ID without verifying it belongs to the requesting user.
- `chat_sessions.py` — chat message content was sent as a URL query parameter (logged by proxies/browsers). Moved to POST body.

**Credentials:**
- `imports.py` — connector credentials were stored in plaintext. Now encrypted via `encrypt_connector_config` (Fernet) before persistence.
- `models_db.py` — added `user_id` column to `ImportTableDB`, `ImportConnectionDB`, `PipelineDB`.

**Infrastructure:**
- `Dockerfile` — backend ran as `root`. Added `appuser` non-root user.
- `requirements.txt` — duplicate `pytz==2024.1` entry removed.
- `.dockerignore` created to exclude dev artifacts from Docker image.

---

## How to read this file

Each entry covers one commit (or a logical group of related changes). The format is:

```
## YYYY-MM-DD — Title (commit hash if available)

- File — what changed and why
```

Changes are grouped by category: Security, Bug Fix, Performance, Cleanup, UI/UX.
