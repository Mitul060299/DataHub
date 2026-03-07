from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import auth, webhooks, jobs, workspaces, dashboards_v2, imports, datasets


app = FastAPI(title="DataHub Live Matrix API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


app.include_router(auth.router)
app.include_router(webhooks.router)
app.include_router(jobs.router)
app.include_router(workspaces.router)
app.include_router(dashboards_v2.router)
app.include_router(dashboards_v2.public_router)
app.include_router(imports.router)
app.include_router(datasets.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
