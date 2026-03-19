from fastapi import FastAPI, Request
import os
import logging
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .routers import health, datasets, profiling, transformations, auth, plugins, context, insights, governance, agents, webhooks, jobs, connectors, users, workspaces, metrics, approvals, realtime, templates, pipelines, imports, cleaning, visualizations, chat_sessions, pipeline_workflows, calculated_columns, dashboards_v2, feedback, billing
from .routers import ml_routes, full_auto_routes
from .routers import pipeline_refresh, cron, data_sources
from .routers import dashboard_access
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
