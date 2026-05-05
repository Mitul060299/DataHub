from fastapi import FastAPI, Request
import asyncio
import os
import logging
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler  # noqa: F401 (kept for reference)
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from .services.rate_limiter import limiter

# ── Sentry error tracking (fire-and-forget; no-op if SENTRY_DSN unset) ───────
try:
    from .config import settings as _sentry_settings
    if _sentry_settings.sentry_dsn:
        import sentry_sdk
        sentry_sdk.init(
            dsn=_sentry_settings.sentry_dsn,
            environment=_sentry_settings.app_env,
            traces_sample_rate=_sentry_settings.sentry_traces_sample_rate,
            send_default_pii=False,
        )
except Exception as _exc:  # noqa: BLE001
    logging.getLogger(__name__).debug("Sentry init failed (non-fatal): %s", _exc)


def _json_rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    retry_after = int(getattr(exc, "retry_after", 60) or 60)
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": "Too many requests. Please wait before trying again.",
            "retry_after_seconds": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject OWASP-recommended security headers on every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Content-Security-Policy: API only serves JSON — block all resource loads
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none'"
        )
        # Only set HSTS in production to avoid breaking local dev
        from .config import settings as _s
        if _s.app_env == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

from .routers import health, datasets, profiling, transformations, auth, plugins, context, insights, governance, agents, webhooks, jobs, connectors, users, metrics, approvals, realtime, templates, pipelines, imports, cleaning, visualizations, chat_sessions, pipeline_workflows, calculated_columns, dashboards_v2, feedback, billing, reviews
from .routers import support_chat
from .routers import full_auto_routes
from .routers import usage as usage_routes
from .routers import trial as trial_routes
# ml_routes intentionally not imported — ML/AutoML services are not yet
# production-ready. The endpoints have been removed for the GA launch and
# will be re-introduced once the underlying training pipeline is real.
from .routers import pipeline_refresh, cron, data_sources
from .routers import waitlist
from .routers import dashboard_access
from .routers.project_members import router as project_members_router, project_invite_router as project_invite_router
from .routers.organization_members import router as organization_members_router, org_invite_router as org_invite_router
from .routers.projects import router as projects_router, recent_router as workspace_recent_router
from .routers.artifacts import router as artifacts_router
from .routers.saved_visualizations import router as saved_visualizations_router
from .routers.canvas import router as canvas_router
# Note: Old 'dashboards' and 'widgets' routers removed - use 'visualizations' router instead
from .db import Base, engine
from . import models_db
from .services.audit import audit_store
from .models import AuditEntry
from .services.metrics import start_timer
from .config import settings
from .services.pipelines import start_scheduler

app = FastAPI(title="DataHub API", version="0.1.0")
logger = logging.getLogger(__name__)

# ── Rate limiting (slowapi + Redis) ──────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _json_rate_limit_handler)  # type: ignore[arg-type]
app.add_middleware(SlowAPIMiddleware)

# ── Security headers ──────────────────────────────────────────────────────────
app.add_middleware(SecurityHeadersMiddleware)

# Single source of truth: driven by the CORS_ORIGINS env var (comma-separated).
# Localhost origins are included automatically in development (see config.py).
# Never use a hardcoded list here — change config.py or the env var instead.
_CORS_ORIGINS = settings.cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Workspace-Id", "X-Project-Id", "X-Request-Id"],
    expose_headers=["X-Request-Id"],
)


def _apply_startup_ddl() -> None:
    """Run schema safety-net DDL + scheduler in a background thread.

    Called via asyncio.to_thread so it never blocks uvicorn's event loop or
    port-binding.  Each statement is tried independently — a Supabase statement
    timeout on one entry never prevents the others from running.
    """
    _schema_ddl = [
        # 0026 — data_sources table (must precede 0029 project_id column)
        """CREATE TABLE IF NOT EXISTS data_sources (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            name        TEXT NOT NULL,
            source_type TEXT NOT NULL,
            config      JSONB NOT NULL DEFAULT '{}',
            last_tested_at  TIMESTAMPTZ,
            last_pulled_at  TIMESTAMPTZ,
            is_active   BOOLEAN NOT NULL DEFAULT true,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_data_sources_user ON data_sources (user_id)",
        # 0026 — pipeline_schedules table
        """CREATE TABLE IF NOT EXISTS pipeline_schedules (
            id                      TEXT PRIMARY KEY,
            pipeline_id             TEXT NOT NULL REFERENCES pipelines_v2(id) ON DELETE CASCADE,
            user_id                 TEXT NOT NULL,
            cron_expression         TEXT NOT NULL DEFAULT '0 9 * * 1',
            timezone                TEXT NOT NULL DEFAULT 'Asia/Kolkata',
            is_active               BOOLEAN NOT NULL DEFAULT false,
            last_run_at             TIMESTAMPTZ,
            next_run_at             TIMESTAMPTZ,
            auto_refresh_on_upload  BOOLEAN NOT NULL DEFAULT false,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_pipeline_schedules_pipeline ON pipeline_schedules (pipeline_id)",
        "CREATE INDEX IF NOT EXISTS idx_pipeline_schedules_next_run ON pipeline_schedules (next_run_at)",
        # 0026 — table_snapshots table
        """CREATE TABLE IF NOT EXISTS table_snapshots (
            id              TEXT PRIMARY KEY,
            pipeline_run_id TEXT NOT NULL REFERENCES pipeline_runs_v2(id) ON DELETE CASCADE,
            table_name      TEXT NOT NULL,
            snapshot_url    TEXT NOT NULL,
            row_count       INTEGER,
            schema          JSONB NOT NULL DEFAULT '{}',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_table_snapshots_run ON table_snapshots (pipeline_run_id)",
        "CREATE INDEX IF NOT EXISTS idx_table_snapshots_table_name ON table_snapshots (table_name)",
        # 0026 — pipeline_runs_v2 extra column
        "ALTER TABLE pipeline_runs_v2 ADD COLUMN IF NOT EXISTS output_snapshot_url TEXT",
        # 0026 — dashboard_tiles extra columns
        "ALTER TABLE dashboard_tiles ADD COLUMN IF NOT EXISTS snapshot_id TEXT REFERENCES table_snapshots(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS idx_dashboard_tiles_snapshot ON dashboard_tiles (snapshot_id)",
        "ALTER TABLE dashboard_tiles ADD COLUMN IF NOT EXISTS refresh_config JSONB NOT NULL DEFAULT '{}'",
        # 0027 — dashboards_v2 extended columns (originally missed due to RLS crash)
        "ALTER TABLE dashboards_v2 ADD COLUMN IF NOT EXISTS theme JSONB DEFAULT '{}'",
        "ALTER TABLE dashboards_v2 ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE dashboards_v2 ADD COLUMN IF NOT EXISTS share_token TEXT",
        # 0027 — dashboard_tiles extended columns
        "ALTER TABLE dashboard_tiles ADD COLUMN IF NOT EXISTS tile_type TEXT NOT NULL DEFAULT 'chart'",
        "ALTER TABLE dashboard_tiles ADD COLUMN IF NOT EXISTS echarts_config JSONB",
        "ALTER TABLE dashboard_tiles ADD COLUMN IF NOT EXISTS table_data JSONB",
        "ALTER TABLE dashboard_tiles ADD COLUMN IF NOT EXISTS metric_value TEXT",
        "ALTER TABLE dashboard_tiles ADD COLUMN IF NOT EXISTS metric_label TEXT",
        "ALTER TABLE dashboard_tiles ADD COLUMN IF NOT EXISTS metric_trend TEXT",
        "ALTER TABLE dashboard_tiles ADD COLUMN IF NOT EXISTS metric_threshold JSONB",
        # 0027 — dashboard_access table
        """CREATE TABLE IF NOT EXISTS dashboard_access (
            id                  TEXT PRIMARY KEY,
            dashboard_id        TEXT NOT NULL REFERENCES dashboards_v2(id) ON DELETE CASCADE,
            granted_to_user_id  TEXT,
            granted_to_email    TEXT,
            access_level        TEXT NOT NULL DEFAULT 'view',
            granted_by          TEXT NOT NULL,
            expires_at          TIMESTAMPTZ,
            token               TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_dashboard_access_dashboard ON dashboard_access (dashboard_id)",
        "CREATE INDEX IF NOT EXISTS idx_dashboard_access_user ON dashboard_access (granted_to_user_id)",
        # 0027 — dashboard_views table
        """CREATE TABLE IF NOT EXISTS dashboard_views (
            id                  TEXT PRIMARY KEY,
            dashboard_id        TEXT NOT NULL REFERENCES dashboards_v2(id) ON DELETE CASCADE,
            viewed_by_user_id   TEXT,
            viewed_by_email     TEXT,
            viewed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            ip_address          TEXT
        )""",
        "CREATE INDEX IF NOT EXISTS idx_dashboard_views_dashboard ON dashboard_views (dashboard_id)",
        "CREATE INDEX IF NOT EXISTS idx_dashboard_views_user ON dashboard_views (viewed_by_user_id)",
        # 0028 — user onboarding flags
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS has_uploaded_first_file BOOLEAN NOT NULL DEFAULT false",
        # 0064 — 15-day opt-in trial state (one trial per user; abuse prevention)
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_plan TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_method_on_file BOOLEAN NOT NULL DEFAULT false",
        # 0029 — projects table
        """CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            colour TEXT NOT NULL DEFAULT '#5B6AF0',
            icon TEXT NOT NULL DEFAULT '\ud83d\udcc1',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects (user_id)",
        # 0029 — project_id FK columns on existing tables
        "ALTER TABLE pipelines_v2 ADD COLUMN IF NOT EXISTS project_id TEXT",
        "ALTER TABLE dashboards_v2 ADD COLUMN IF NOT EXISTS project_id TEXT",
        "ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS project_id TEXT",
        # 0033 — monthly usage tracking
        """CREATE TABLE IF NOT EXISTS user_usage (
            id                  SERIAL PRIMARY KEY,
            user_id             TEXT        NOT NULL,
            period              TEXT        NOT NULL,
            api_calls           INTEGER     NOT NULL DEFAULT 0,
            pipeline_runs       INTEGER     NOT NULL DEFAULT 0,
            datasets_uploaded   INTEGER     NOT NULL DEFAULT 0,
            storage_bytes_used  BIGINT      NOT NULL DEFAULT 0,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (user_id, period)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_user_usage_user_period ON user_usage (user_id, period)",
        # 0034 — dataset version columns
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS version_note TEXT",
        "CREATE INDEX IF NOT EXISTS idx_datasets_parent_id ON dataset_meta (parent_id)",
        # 0035 — dashboard comments
        """CREATE TABLE IF NOT EXISTS dashboard_comments (
            id          TEXT PRIMARY KEY,
            dashboard_id TEXT NOT NULL,
            user_id     TEXT NOT NULL,
            author_name TEXT NOT NULL,
            body        TEXT NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_dashboard_comments_dashboard_id ON dashboard_comments (dashboard_id)",
        # notification prefs column on users
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB",
        # 0036 — user reviews
        """CREATE TABLE IF NOT EXISTS reviews (
            id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name        TEXT NOT NULL,
            role        TEXT,
            rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
            body        TEXT NOT NULL,
            approved    BOOLEAN NOT NULL DEFAULT false,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews (approved)",
        # 0037 — saved visualizations (AI-generated charts the user explicitly saves)
        """CREATE TABLE IF NOT EXISTS visualizations (
            id              TEXT PRIMARY KEY,
            user_id         TEXT NOT NULL,
            project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
            name            TEXT NOT NULL,
            chart_type      TEXT NOT NULL DEFAULT 'bar',
            echarts_config  JSONB NOT NULL DEFAULT '{}',
            thumbnail_s3_key TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_visualizations_user ON visualizations (user_id)",
        # 0037 — canvas layouts (drag-drop dashboards per project)
        """CREATE TABLE IF NOT EXISTS canvas_layouts (
            id              TEXT PRIMARY KEY,
            user_id         TEXT NOT NULL,
            project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
            name            TEXT NOT NULL DEFAULT 'Untitled Dashboard',
            layout          JSONB NOT NULL DEFAULT '[]',
            is_public       BOOLEAN NOT NULL DEFAULT false,
            public_token    TEXT UNIQUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_canvas_layouts_user ON canvas_layouts (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_canvas_layouts_project ON canvas_layouts (project_id)",
        # 0040 — connector_credentials table (encrypted config store for fold/write-back/live)
        """CREATE TABLE IF NOT EXISTS connector_credentials (
            id              TEXT PRIMARY KEY,
            user_id         TEXT NOT NULL,
            connector_type  TEXT NOT NULL,
            label           TEXT,
            encrypted_config TEXT NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_connector_credentials_user ON connector_credentials (user_id)",
        # 0040 — dataset_meta new columns for live-mode / query-folding / write-back
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS connector_credential_id TEXT",
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS import_mode TEXT NOT NULL DEFAULT 'cached'",
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS connector_config JSONB",
        # 0041 — international waitlist
        """CREATE TABLE IF NOT EXISTS waitlist_entries (
            id         TEXT PRIMARY KEY,
            email      TEXT NOT NULL,
            plan       TEXT NOT NULL,
            region     TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_email_unique ON waitlist_entries (email)",
        # 0041 — workspace_members for team collaboration
        "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS owner_id TEXT",
        """CREATE TABLE IF NOT EXISTS workspace_members (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            user_id         TEXT,
            email           TEXT NOT NULL,
            role            TEXT NOT NULL DEFAULT 'viewer',
            status          TEXT NOT NULL DEFAULT 'pending',
            invite_token    TEXT UNIQUE,
            invited_by      TEXT NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            accepted_at     TIMESTAMPTZ
        )""",
        "CREATE INDEX IF NOT EXISTS idx_wm_workspace_id ON workspace_members (workspace_id)",
        "CREATE INDEX IF NOT EXISTS idx_wm_user_id ON workspace_members (user_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_wm_invite_token ON workspace_members (invite_token) WHERE invite_token IS NOT NULL",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_wm_workspace_email ON workspace_members (workspace_id, email)",
        # 0042 — agent artifacts table (persisted Parquet snapshots from pipeline write-ops)
        """CREATE TABLE IF NOT EXISTS artifacts (
            id              TEXT PRIMARY KEY,
            user_id         TEXT NOT NULL,
            session_id      TEXT,
            pipeline_run_id TEXT REFERENCES pipeline_runs_v2(id) ON DELETE SET NULL,
            step_id         TEXT,
            name            TEXT NOT NULL,
            description     TEXT,
            s3_key          TEXT NOT NULL,
            row_count       INTEGER,
            column_schema   JSONB DEFAULT '[]',
            type            TEXT NOT NULL DEFAULT 'auto',
            format          TEXT NOT NULL DEFAULT 'parquet',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_artifacts_user_id ON artifacts (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_artifacts_session_id ON artifacts (session_id)",
        "CREATE INDEX IF NOT EXISTS idx_artifacts_pipeline_run_id ON artifacts (pipeline_run_id)",
        # 0042 — backfill missing columns on existing artifacts tables
        "ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'parquet'",
        "ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS step_id TEXT",
        "ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS pipeline_run_id TEXT REFERENCES pipeline_runs_v2(id) ON DELETE SET NULL",
        # 0042/0043 — uploaded_by attribution on dataset versions
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS uploaded_by TEXT",
        # 0046 — workspace_type ('personal' | 'collab') on workspaces table
        "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS workspace_type TEXT NOT NULL DEFAULT 'personal'",
        # 0047/0051 — per-user monthly bytes-scanned counter (used by usage_service.increment_scan_bytes)
        "ALTER TABLE user_usage ADD COLUMN IF NOT EXISTS data_scanned_bytes BIGINT NOT NULL DEFAULT 0",
        # 0050 — pipeline_steps_json on dataset_meta (live workspace persistence)
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS pipeline_steps_json JSONB",
        # 0052 — pending_storage_deletes retry queue (orphan cleanup)
        """CREATE TABLE IF NOT EXISTS pending_storage_deletes (
            id              SERIAL PRIMARY KEY,
            storage_path    TEXT NOT NULL,
            source          TEXT NOT NULL,
            attempts        INTEGER NOT NULL DEFAULT 0,
            next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_error      TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_pending_storage_deletes_next_attempt ON pending_storage_deletes (next_attempt_at)",
        # 0053 — append-only pipeline_events log
        """CREATE TABLE IF NOT EXISTS pipeline_events (
            id              TEXT PRIMARY KEY,
            event_type      TEXT NOT NULL,
            user_id         TEXT,
            session_id      TEXT,
            run_id          TEXT,
            step_id         TEXT,
            payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_pipeline_events_event_type ON pipeline_events (event_type)",
        "CREATE INDEX IF NOT EXISTS idx_pipeline_events_user_id ON pipeline_events (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_pipeline_events_session_id ON pipeline_events (session_id)",
        "CREATE INDEX IF NOT EXISTS idx_pipeline_events_created_at ON pipeline_events (created_at)",
        # 0054 — soft-delete (Trash) on dataset_meta
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ",
        "CREATE INDEX IF NOT EXISTS ix_dataset_meta_deleted_at ON dataset_meta (deleted_at)",
        # 0055 — server-side dataset_sessions (chat session binding only;
        # the live_* preview columns were dropped in 0059 — see migration
        # for rationale).
        """CREATE TABLE IF NOT EXISTS dataset_sessions (
            id                  TEXT PRIMARY KEY,
            user_id             TEXT NOT NULL,
            dataset_id          TEXT NOT NULL,
            chat_session_id     TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS ix_dataset_sessions_user_id ON dataset_sessions (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_dataset_sessions_dataset_id ON dataset_sessions (dataset_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_dataset_sessions_user_dataset ON dataset_sessions (user_id, dataset_id)",
        # 0056 — dataset_lineage_edges (replaces parent_id chain)
        """CREATE TABLE IF NOT EXISTS dataset_lineage_edges (
            id              TEXT PRIMARY KEY,
            child_id        TEXT NOT NULL,
            parent_id       TEXT NOT NULL,
            transform_id    TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS ix_dataset_lineage_edges_child_id ON dataset_lineage_edges (child_id)",
        "CREATE INDEX IF NOT EXISTS ix_dataset_lineage_edges_parent_id ON dataset_lineage_edges (parent_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_dataset_lineage_edges_child_parent ON dataset_lineage_edges (child_id, parent_id)",
        # 0056 — backfill lineage edges from any existing parent_id values
        # (idempotent: ON CONFLICT skips already-recorded edges).
        """INSERT INTO dataset_lineage_edges (id, child_id, parent_id, transform_id, created_at)
           SELECT 'edge:' || dm.id || ':' || dm.parent_id, dm.id, dm.parent_id, NULL, COALESCE(dm.created_at, NOW())
           FROM dataset_meta dm
           WHERE dm.parent_id IS NOT NULL
           ON CONFLICT (child_id, parent_id) DO NOTHING""",
        # 0057 — project scoping on dataset_meta (previously datasets were only
        # workspace-scoped, so every project inside a workspace showed the same list).
        "ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS project_id TEXT",
        "CREATE INDEX IF NOT EXISTS ix_dataset_meta_project_id ON dataset_meta (project_id)",
        # 0058 — snapshot path on each pipeline step (replay-from-Parquet path).
        "ALTER TABLE pipeline_steps ADD COLUMN IF NOT EXISTS snapshot_path TEXT",
        # 0069 — Auto Mode: auto runs + pipeline step audit columns
        """CREATE TABLE IF NOT EXISTS agent_auto_runs (
            id                 TEXT PRIMARY KEY,
            user_id            TEXT NOT NULL,
            project_id         TEXT NOT NULL,
            dataset_id         TEXT NOT NULL,
            session_id         TEXT NOT NULL,
            goal_raw           TEXT NOT NULL,
            goal_parsed        JSONB,
            plan               JSONB,
            status             TEXT NOT NULL DEFAULT 'running',
            rules_total        INTEGER,
            rules_satisfied    INTEGER,
            rules_failed       INTEGER,
            rules_skipped      INTEGER,
            pipeline_run_id    TEXT,
            output_table_name  TEXT,
            output_dataset_id  TEXT,
            interrupt_log      JSONB DEFAULT '[]',
            reflection_log     JSONB DEFAULT '[]',
            goal_report        JSONB,
            tokens_used        INTEGER DEFAULT 0,
            duration_ms        INTEGER,
            error_message      TEXT,
            pre_run_review     BOOLEAN NOT NULL DEFAULT FALSE,
            dry_run            BOOLEAN NOT NULL DEFAULT FALSE,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            completed_at       TIMESTAMPTZ
        )""",
        "CREATE INDEX IF NOT EXISTS idx_agent_auto_runs_user      ON agent_auto_runs (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_agent_auto_runs_project   ON agent_auto_runs (project_id)",
        "CREATE INDEX IF NOT EXISTS idx_agent_auto_runs_session   ON agent_auto_runs (session_id)",
        "CREATE INDEX IF NOT EXISTS idx_agent_auto_runs_dataset   ON agent_auto_runs (dataset_id)",
        "CREATE INDEX IF NOT EXISTS idx_agent_auto_runs_status    ON agent_auto_runs (status)",
        """CREATE TABLE IF NOT EXISTS agent_recipes (
            id                 TEXT PRIMARY KEY,
            project_id         TEXT NOT NULL,
            created_by         TEXT NOT NULL,
            name               TEXT NOT NULL,
            description        TEXT,
            schema_fingerprint TEXT NOT NULL DEFAULT '',
            goal_text          TEXT NOT NULL,
            rules              JSONB NOT NULL DEFAULT '[]',
            reference_steps    JSONB NOT NULL DEFAULT '[]',
            expectations       JSONB NOT NULL DEFAULT '[]',
            trust_level        TEXT NOT NULL DEFAULT 'guide',
            run_count          INTEGER NOT NULL DEFAULT 0,
            success_count      INTEGER NOT NULL DEFAULT 0,
            last_run_id        TEXT,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_agent_recipes_project     ON agent_recipes (project_id)",
        "CREATE INDEX IF NOT EXISTS idx_agent_recipes_fingerprint ON agent_recipes (schema_fingerprint)",
        "ALTER TABLE pipeline_steps ADD COLUMN IF NOT EXISTS auto_run_id        TEXT",
        "ALTER TABLE pipeline_steps ADD COLUMN IF NOT EXISTS rule_justification TEXT",
        "CREATE INDEX IF NOT EXISTS idx_pipeline_steps_auto_run ON pipeline_steps (auto_run_id)",
        # add_webhook_user_id — user-scoped webhook access
        "ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS user_id TEXT",
        "CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks (user_id)",
        # 0071 — remove workspace_id from all tables (replaced by user_id + project_id)
        "ALTER TABLE projects             DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE dataset_meta         DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE connector_credentials DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE import_tables        DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE import_connections   DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE viz_dashboard_themes DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE viz_dashboards       DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE dashboards_v2        DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE chat_sessions        DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE pipelines_v2         DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE pipeline_events      DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE chat_templates       DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE visualizations       DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE canvas_layouts       DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE data_sources         DROP COLUMN IF EXISTS workspace_id",
        "ALTER TABLE artifacts            DROP COLUMN IF EXISTS workspace_id",
        # 0070 — support chat widget: session + message tables
        """CREATE TABLE IF NOT EXISTS support_chat_sessions (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            visitor_id    TEXT NOT NULL,
            email         TEXT,
            first_page    TEXT NOT NULL DEFAULT '/',
            message_count INTEGER NOT NULL DEFAULT 0,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_active   TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_support_chat_sessions_visitor ON support_chat_sessions (visitor_id)",
        "CREATE INDEX IF NOT EXISTS idx_support_chat_sessions_email  ON support_chat_sessions (email)",
        """CREATE TABLE IF NOT EXISTS support_chat_messages (
            id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id             UUID NOT NULL REFERENCES support_chat_sessions(id) ON DELETE CASCADE,
            role                   TEXT NOT NULL,
            content                TEXT NOT NULL,
            intent                 TEXT,
            is_capability_request  BOOLEAN NOT NULL DEFAULT FALSE,
            created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_support_chat_messages_session ON support_chat_messages (session_id)",
        "CREATE INDEX IF NOT EXISTS idx_support_chat_messages_intent  ON support_chat_messages (intent)",
        "CREATE INDEX IF NOT EXISTS idx_support_chat_messages_cap_req ON support_chat_messages (is_capability_request)",
    ]
    try:
        from sqlalchemy import text as _text
        _failed: list[str] = []
        with engine.connect() as _conn:
            for _stmt in _schema_ddl:
                try:
                    _conn.execute(_text(_stmt))
                    _conn.commit()
                except Exception as _stmt_exc:
                    _conn.rollback()
                    _short = _stmt.strip().splitlines()[0][:80]
                    logger.warning("startup DDL skipped (%s): %s", _short, _stmt_exc)
                    _failed.append(_short)
        if _failed:
            logger.warning("startup: %d DDL statement(s) skipped (see warnings above)", len(_failed))
        else:
            logger.warning("startup: schema safety-net DDL applied successfully")
    except Exception as _exc:
        logger.error("startup: schema safety-net DDL failed: %s", _exc)

    try:
        start_scheduler()
    except Exception:
        pass


async def _apply_startup_ddl_bg() -> None:
    """Async wrapper — runs _apply_startup_ddl in a thread pool so the event
    loop (and therefore the HTTP port) is never blocked."""
    await asyncio.to_thread(_apply_startup_ddl)


# Hard refs to fire-and-forget startup tasks so Python's garbage collector
# can't reap them before they finish (asyncio.create_task only holds a weak
# reference internally — see https://bugs.python.org/issue44665).
_BACKGROUND_TASKS: set[asyncio.Task] = set()

@app.on_event("startup")
async def create_tables() -> None:
    logger.warning("CORS ORIGINS LOADED: %s", settings.cors_origins)
    logger.warning("GROQ KEY SET: %s", bool(settings.groq_api_key))
    logger.warning("APP ENV: %s", settings.app_env)
    # Log process RSS so we can diagnose OOM kills on Render free tier (512 MB cap).
    try:
        import psutil as _psutil
        _rss = _psutil.Process(os.getpid()).memory_info().rss / 1024 / 1024
        logger.warning("STARTUP_RSS: %.0f MB (after all module imports)", _rss)
    except Exception:
        pass
    # Render injects RENDER=true; skip create_all there — Alembic handles schema.
    # Running create_all on Render fires a background thread making 30+ DB
    # round-trips at the same moment as the first user request burst, which
    # pushes RSS over the 512 MB OOM-kill limit on Starter instances.
    _on_render = bool(os.getenv("RENDER"))
    if (settings.app_env != "production" and not _on_render) or os.getenv("AUTO_CREATE_TABLES") == "1":
        # Run as a background task so it never blocks uvicorn from binding the
        # port.  On Render, if this awaits synchronously (~30 Supabase round-
        # trips) the deploy health-check times out before the port opens.
        # Hold the task reference so Python's GC can't collect it mid-flight
        # (asyncio only weakly tracks tasks).
        _t = asyncio.create_task(asyncio.to_thread(Base.metadata.create_all, engine))
        _BACKGROUND_TASKS.add(_t)
        _t.add_done_callback(_BACKGROUND_TASKS.discard)

    # Schema safety-net DDL is run in a background task so that uvicorn can
    # bind to the port immediately.  On Render free tier, ALTER TABLE statements
    # can time out after ~2 minutes each; running them synchronously here would
    # push total startup past Render's port-scan deadline and kill the deploy.
    _t2 = asyncio.create_task(_apply_startup_ddl_bg())
    _BACKGROUND_TASKS.add(_t2)
    _t2.add_done_callback(_BACKGROUND_TASKS.discard)
    logger.warning("STARTUP: uvicorn ready, port bound, background DDL task scheduled")


@app.middleware("http")
async def cors_on_error(request: Request, call_next):
    try:
        response = await call_next(request)
    except Exception as exc:
        response = JSONResponse(status_code=500, content={"detail": str(exc)})

    origin = request.headers.get("origin", "")
    if origin in _CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    response = JSONResponse(status_code=500, content={"detail": str(exc)})
    origin = request.headers.get("origin", "")
    if origin in _CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    timer = start_timer(request.method, request.url.path)
    try:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=()"
        if request.method in {"POST", "PUT", "DELETE"}:
            audit_store.add(
                AuditEntry(
                    action=request.method,
                    actor=request.client.host if request.client else "unknown",
                    target=str(request.url.path),
                    metadata={"status": response.status_code},
                )
            )
        timer.observe(response.status_code)
        return response
    except Exception:
        timer.observe(500)
        raise

@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
async def root() -> dict:
    """Lightweight root probe — returns immediately without touching the DB.
    Render's port scanner/health checker hits / by default; a 200 here allows
    it to confirm the port is open well before the startup DDL finishes.
    HEAD is also handled so Render's initial HEAD probe doesn't return 405."""
    return {"status": "ok"}


# ── Render health-check aliases ───────────────────────────────────────────────
# Render's dashboard health-check path is configured independently of
# render.yaml (which is only read on initial service creation from a blueprint).
# We expose every plausible path so the service stays healthy regardless of
# what the Render dashboard is set to, without requiring any dashboard changes.
@app.api_route("/api/health", methods=["GET", "HEAD"], include_in_schema=False)
async def api_health() -> dict:
    return {"status": "ok"}


@app.api_route("/healthz", methods=["GET", "HEAD"], include_in_schema=False)
async def healthz() -> dict:
    return {"status": "ok"}


@app.api_route("/ping", methods=["GET", "HEAD"], include_in_schema=False)
async def ping() -> dict:
    return {"status": "ok"}


app.include_router(health.router)
app.include_router(metrics.router)
app.include_router(auth.router)
app.include_router(datasets.router)
app.include_router(profiling.router)
app.include_router(transformations.router)
app.include_router(plugins.router)
app.include_router(context.router)
app.include_router(insights.router)
app.include_router(governance.router)
app.include_router(agents.router)
# Old dashboards and widgets routers removed - replaced by visualizations router
app.include_router(webhooks.router)
app.include_router(jobs.router)
app.include_router(connectors.router)
app.include_router(users.router)
app.include_router(approvals.router)
app.include_router(realtime.router)
app.include_router(templates.router)
app.include_router(pipelines.router)
app.include_router(imports.router)
app.include_router(cleaning.router)
app.include_router(calculated_columns.router)
app.include_router(dashboards_v2.router)
app.include_router(dashboards_v2.public_router)
app.include_router(dashboard_access.router)
app.include_router(visualizations.router)
# app.include_router(ml_routes.router)  # disabled — see import note above
app.include_router(full_auto_routes.router)
app.include_router(chat_sessions.router)
app.include_router(pipeline_workflows.router)
app.include_router(feedback.router)
app.include_router(reviews.router)
app.include_router(billing.router)
app.include_router(support_chat.router)
app.include_router(trial_routes.router)
app.include_router(pipeline_refresh.router)
app.include_router(cron.router)
app.include_router(data_sources.router)
app.include_router(projects_router)
app.include_router(workspace_recent_router)
app.include_router(artifacts_router)
app.include_router(saved_visualizations_router)
app.include_router(canvas_router)
app.include_router(waitlist.router)
app.include_router(project_members_router)
app.include_router(project_invite_router)
app.include_router(organization_members_router)
app.include_router(org_invite_router)
app.include_router(usage_routes.router)
