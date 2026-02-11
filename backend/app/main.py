from fastapi import FastAPI, Request
import os
from fastapi.middleware.cors import CORSMiddleware
from .routers import health, datasets, profiling, transformations, auth, plugins, context, insights, governance, agents, dashboards, webhooks, jobs, connectors, users, workspaces, widgets, metrics, approvals, realtime, templates
from .db import Base, engine
from . import models_db
from .services.audit import audit_store
from .models import AuditEntry
from .services.metrics import start_timer
from .config import settings

app = FastAPI(title="DataHub API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def create_tables() -> None:
    if settings.app_env != "production" or os.getenv("AUTO_CREATE_TABLES") == "1":
        Base.metadata.create_all(bind=engine)


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
app.include_router(dashboards.router)
app.include_router(webhooks.router)
app.include_router(jobs.router)
app.include_router(connectors.router)
app.include_router(users.router)
app.include_router(workspaces.router)
app.include_router(widgets.router)
app.include_router(approvals.router)
app.include_router(realtime.router)
app.include_router(templates.router)
