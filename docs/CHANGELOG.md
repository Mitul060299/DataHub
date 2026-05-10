# DataHub — Engineering Changelog

This file tracks all non-trivial changes made to the codebase: security fixes, bug fixes, performance improvements, cleanup, and UI/UX work. Most recent entries first.

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
