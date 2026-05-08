# DataHub — Engineering Changelog

This file tracks all non-trivial changes made to the codebase: security fixes, bug fixes, performance improvements, cleanup, and UI/UX work. Most recent entries first.

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
