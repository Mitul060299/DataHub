"""
demo.py
=======
Public (unauthenticated) demo project endpoints.

These routes expose read-only metadata for the shared demo project so that
unauthenticated visitors can explore the workspace without creating an account.

No auth token is required.  The demo project and dataset IDs are set via the
DEMO_PROJECT_ID and DEMO_DATASET_ID environment variables by the operator after
running scripts/seed_demo.py.  If those env vars are not set, the endpoints
return 404 so the frontend falls back to the empty-state home page.

Security:
- No write operations are exposed here.
- Dataset preview enforces a hard row-count cap (500 rows).
- The demo project owner's personal data is never exposed.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models_db import DatasetMetaDB, PipelineV2DB, ProjectDB

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/demo", tags=["demo"])


# ── Response models ───────────────────────────────────────────────────────────

class DemoProjectOut(BaseModel):
    project_id: str
    project_name: str
    dataset_id: Optional[str]
    colour: Optional[str] = "#5b6af0"
    icon: Optional[str] = "📊"
    description: Optional[str] = None
    pipeline_count: int = 0


class DemoDatasetPreviewOut(BaseModel):
    dataset_id: str
    columns: list[str]
    rows: list[dict]
    total_rows: int


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=DemoProjectOut, summary="Get public demo project metadata")
def get_demo_project(db: Session = Depends(get_db)) -> DemoProjectOut:
    """Return metadata for the shared public demo project.

    Returns 404 when DEMO_PROJECT_ID env var is not configured, so the
    frontend gracefully falls back to the empty workspace home page.
    """
    project_id = settings.demo_project_id
    if not project_id:
        raise HTTPException(status_code=404, detail="Demo project not configured")

    project = db.query(ProjectDB).filter(ProjectDB.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Demo project not found")

    pipeline_count = (
        db.query(PipelineV2DB)
        .filter(PipelineV2DB.project_id == project_id)
        .count()
    )

    return DemoProjectOut(
        project_id=project.id,
        project_name=project.name,
        dataset_id=settings.demo_dataset_id or None,
        colour=getattr(project, "colour", "#5b6af0") or "#5b6af0",
        icon=getattr(project, "icon", "📊") or "📊",
        description=project.description,
        pipeline_count=pipeline_count,
    )


@router.get(
    "/datasets/{dataset_id}/preview",
    response_model=DemoDatasetPreviewOut,
    summary="Preview demo dataset (public, read-only)",
)
def preview_demo_dataset(
    dataset_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> DemoDatasetPreviewOut:
    """Return a paginated preview of the demo dataset.

    Only the configured DEMO_DATASET_ID is accessible via this public route.
    Any other dataset_id returns 404.
    """
    demo_dataset_id = settings.demo_dataset_id
    if not demo_dataset_id:
        raise HTTPException(status_code=404, detail="Demo dataset not configured")

    # Strictly enforce: only the well-known demo dataset is accessible here.
    if dataset_id != demo_dataset_id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Enforce cap — never serve more than 500 rows on the public endpoint.
    limit = min(limit, 500)

    # Use DuckDB fast path if Parquet is available.
    try:
        from ..services.duckdb_service import DuckDBService

        if meta.storage_path and getattr(meta, "import_mode", "cached") != "live":
            page_rows, total = DuckDBService.preview_page(
                meta.storage_path,
                offset=offset,
                limit=limit,
                allowed_columns=list(meta.columns or []),
            )
            if not filter:
                total = meta.row_count or total
            return DemoDatasetPreviewOut(
                dataset_id=dataset_id,
                columns=list(meta.columns or []),
                rows=page_rows,
                total_rows=total,
            )
    except Exception as exc:  # noqa: BLE001
        _log.warning("DuckDB fast path failed for demo dataset %s: %s", dataset_id, exc)

    # Fallback: return empty preview rather than exposing an error.
    return DemoDatasetPreviewOut(
        dataset_id=dataset_id,
        columns=list(meta.columns or []),
        rows=[],
        total_rows=meta.row_count or 0,
    )
