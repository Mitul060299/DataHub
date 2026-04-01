from fastapi import FastAPI, Request
import asyncio
import os
import logging
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler  # noqa: F401 (kept for reference)
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from .services.rate_limiter import limiter


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
from .routers import health, datasets, profiling, transformations, auth, plugins, context, insights, governance, agents, webhooks, jobs, connectors, users, workspaces, metrics, approvals, realtime, templates, pipelines, imports, cleaning, visualizations, chat_sessions, pipeline_workflows, calculated_columns, dashboards_v2, feedback, billing, reviews
from .routers import ml_routes, full_auto_routes
from .routers import pipeline_refresh, cron, data_sources
from .routers import waitlist
from .routers import dashboard_access
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

# Single source of truth: driven by the CORS_ORIGINS env var (comma-separated).
# Localhost origins are included automatically in development (see config.py).
# Never use a hardcoded list here — change config.py or the env var instead.
_CORS_ORIGINS = settings.cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Workspace-Id", "X-Request-Id"],
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
        # 0029 — projects table
        """CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            description TEXT,
            colour TEXT NOT NULL DEFAULT '#5B6AF0',
            icon TEXT NOT NULL DEFAULT '📁',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects (workspace_id)",
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
            workspace_id    TEXT NOT NULL DEFAULT 'default',
            project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
            name            TEXT NOT NULL,
            chart_type      TEXT NOT NULL DEFAULT 'bar',
            echarts_config  JSONB NOT NULL DEFAULT '{}',
            thumbnail_s3_key TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_visualizations_user ON visualizations (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_visualizations_workspace ON visualizations (workspace_id)",
        # 0037 — canvas layouts (drag-drop dashboards per project)
        """CREATE TABLE IF NOT EXISTS canvas_layouts (
            id              TEXT PRIMARY KEY,
            user_id         TEXT NOT NULL,
            workspace_id    TEXT NOT NULL DEFAULT 'default',
            project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
            name            TEXT NOT NULL DEFAULT 'Untitled Dashboard',
            layout          JSONB NOT NULL DEFAULT '[]',
            is_public       BOOLEAN NOT NULL DEFAULT false,
            public_token    TEXT UNIQUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_canvas_layouts_user ON canvas_layouts (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_canvas_layouts_workspace ON canvas_layouts (workspace_id)",
        "CREATE INDEX IF NOT EXISTS idx_canvas_layouts_project ON canvas_layouts (project_id)",
        # 0040 — connector_credentials table (encrypted config store for fold/write-back/live)
        """CREATE TABLE IF NOT EXISTS connector_credentials (
            id              TEXT PRIMARY KEY,
            user_id         TEXT NOT NULL,
            workspace_id    TEXT NOT NULL DEFAULT 'default',
            connector_type  TEXT NOT NULL,
            label           TEXT,
            encrypted_config TEXT NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_connector_credentials_user_workspace ON connector_credentials (user_id, workspace_id)",
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


@app.on_event("startup")
async def create_tables() -> None:
    logger.warning("CORS ORIGINS LOADED: %s", settings.cors_origins)
    logger.warning("GROQ KEY SET: %s", bool(settings.groq_api_key))
    logger.warning("APP ENV: %s", settings.app_env)
    if settings.app_env != "production" or os.getenv("AUTO_CREATE_TABLES") == "1":
        # Run as a background task so it never blocks uvicorn from binding the
        # port.  On Render, if this awaits synchronously (~30 Supabase round-
        # trips) the deploy health-check times out before the port opens.
        asyncio.create_task(asyncio.to_thread(Base.metadata.create_all, engine))

    # Schema safety-net DDL is run in a background task so that uvicorn can
    # bind to the port immediately.  On Render free tier, ALTER TABLE statements
    # can time out after ~2 minutes each; running them synchronously here would
    # push total startup past Render's port-scan deadline and kill the deploy.
    asyncio.create_task(_apply_startup_ddl_bg())


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
app.include_router(workspaces.router)
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
app.include_router(ml_routes.router)
app.include_router(full_auto_routes.router)
app.include_router(chat_sessions.router)
app.include_router(pipeline_workflows.router)
app.include_router(feedback.router)
app.include_router(reviews.router)
app.include_router(billing.router)
app.include_router(pipeline_refresh.router)
app.include_router(cron.router)
app.include_router(data_sources.router)
app.include_router(projects_router)
app.include_router(workspace_recent_router)
app.include_router(artifacts_router)
app.include_router(saved_visualizations_router)
app.include_router(canvas_router)
app.include_router(waitlist.router)
