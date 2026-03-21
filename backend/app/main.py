from fastapi import FastAPI, Request
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
from .routers import health, datasets, profiling, transformations, auth, plugins, context, insights, governance, agents, webhooks, jobs, connectors, users, workspaces, metrics, approvals, realtime, templates, pipelines, imports, cleaning, visualizations, chat_sessions, pipeline_workflows, calculated_columns, dashboards_v2, feedback, billing
from .routers import ml_routes, full_auto_routes
from .routers import pipeline_refresh, cron, data_sources
from .routers import dashboard_access
from .routers.projects import router as projects_router, recent_router as workspace_recent_router
from .routers.artifacts import router as artifacts_router
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

ALLOWED_CORS_ORIGINS = [
    "https://datahub.org.in",
    "https://www.datahub.org.in",
    "http://localhost:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.on_event("startup")
def create_tables() -> None:
    logger.warning("CORS ORIGINS LOADED: %s", settings.cors_origins)
    logger.warning("GROQ KEY SET: %s", bool(settings.groq_api_key))
    logger.warning("APP ENV: %s", settings.app_env)
    if settings.app_env != "production" or os.getenv("AUTO_CREATE_TABLES") == "1":
        Base.metadata.create_all(bind=engine)

    # Schema safety-net: ADD COLUMN / CREATE TABLE IF NOT EXISTS for all columns
    # added by recent migrations. No-op if already present. Bypasses alembic
    # stamp state (safety net for timed-out Render free-tier deploys).
    _schema_ddl = [
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
    ]
    try:
        from sqlalchemy import text as _text
        with engine.connect() as _conn:
            for _stmt in _schema_ddl:
                _conn.execute(_text(_stmt))
            _conn.commit()
        logger.warning("startup: schema safety-net DDL applied successfully")
    except Exception as _exc:
        logger.error("startup: schema safety-net DDL failed: %s", _exc)

    try:
        start_scheduler()
    except Exception:
        pass


@app.middleware("http")
async def cors_on_error(request: Request, call_next):
    try:
        response = await call_next(request)
    except Exception as exc:
        response = JSONResponse(status_code=500, content={"detail": str(exc)})

    origin = request.headers.get("origin", "")
    if origin in ALLOWED_CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    response = JSONResponse(status_code=500, content={"detail": str(exc)})
    origin = request.headers.get("origin", "")
    if origin in ALLOWED_CORS_ORIGINS:
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
app.include_router(billing.router)
app.include_router(pipeline_refresh.router)
app.include_router(cron.router)
app.include_router(data_sources.router)
app.include_router(projects_router)
app.include_router(workspace_recent_router)
app.include_router(artifacts_router)
