"""
data_sources.py
===============
CRUD + test endpoints for data_sources.

GET    /api/sources             — list user's sources
POST   /api/sources             — create a source
GET    /api/sources/{id}        — get one source
PATCH  /api/sources/{id}        — update (name, config, is_active, etc.)
DELETE /api/sources/{id}        — soft delete (is_active=False)
POST   /api/sources/{id}/test   — validate connection, return 5-row preview
GET    /api/sources/{id}/pipelines — pipelines that reference this source
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import duckdb
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import DataSourceCreate, DataSourceResponse, DataSourceTest
from ..models_db import DataSourceDB, PipelineScheduleDB, PipelineV2DB
from ..security import get_current_user_id, get_current_role, require_role

router = APIRouter(prefix="/api/sources", tags=["data_sources"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _db_to_resp(src: DataSourceDB, pipeline_count: int = 0) -> DataSourceResponse:
    return DataSourceResponse(
        id=src.id,
        name=src.name,
        user_id=src.user_id,
        source_type=src.source_type,
        config=src.config or {},
        last_tested_at=src.last_tested_at.isoformat() if src.last_tested_at else None,
        last_pulled_at=src.last_pulled_at.isoformat() if src.last_pulled_at else None,
        is_active=src.is_active,
        created_at=src.created_at.isoformat() if src.created_at else "",
        pipeline_count=pipeline_count,
    )


def _resolve_preview_path(src: DataSourceDB) -> str | None:
    """Return a DuckDB-readable path for the first few rows of this source."""
    cfg: dict = src.config or {}
    if src.source_type == "manual_upload":
        from ..services.object_storage import StorageService
        raw = cfg.get("storage_path")
        return StorageService.get_query_path(str(raw)) if raw else None
    if src.source_type == "s3_folder":
        bucket = cfg.get("bucket", "")
        prefix = cfg.get("prefix", "").rstrip("/") + "/"
        return f"s3://{bucket}/{prefix}*.parquet"
    if src.source_type in {"google_sheets", "url"}:
        return cfg.get("url")
    return None


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

@router.get("", response_model=list[DataSourceResponse])
async def list_sources(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[DataSourceResponse]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization) or ""

    sources = (
        db.query(DataSourceDB)
        .filter(DataSourceDB.user_id == user_id, DataSourceDB.is_active == True)  # noqa
        .order_by(DataSourceDB.created_at.desc())
        .all()
    )

    result = []
    for src in sources:
        # Count pipelines that reference this source in any step's parameters
        pipeline_count = _count_referencing_pipelines(db, src.id)
        result.append(_db_to_resp(src, pipeline_count))
    return result


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

@router.post("", response_model=DataSourceResponse, status_code=201)
async def create_source(
    body: DataSourceCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DataSourceResponse:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization) or ""

    src = DataSourceDB(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=body.name,
        source_type=body.source_type,
        config=body.config,
        is_active=True,
    )
    db.add(src)
    db.commit()
    db.refresh(src)
    return _db_to_resp(src)


# ---------------------------------------------------------------------------
# Get one
# ---------------------------------------------------------------------------

@router.get("/{source_id}", response_model=DataSourceResponse)
async def get_source(
    source_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DataSourceResponse:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization) or ""

    src = _get_owned(db, source_id, user_id)
    return _db_to_resp(src, _count_referencing_pipelines(db, source_id))


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

@router.patch("/{source_id}", response_model=DataSourceResponse)
async def update_source(
    source_id: str,
    body: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DataSourceResponse:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization) or ""

    src = _get_owned(db, source_id, user_id)
    allowed = {"name", "config", "is_active", "source_type"}
    for key, val in body.items():
        if key in allowed:
            setattr(src, key, val)

    db.commit()
    db.refresh(src)
    return _db_to_resp(src, _count_referencing_pipelines(db, source_id))


# ---------------------------------------------------------------------------
# Soft delete
# ---------------------------------------------------------------------------

@router.delete("/{source_id}", status_code=204)
async def delete_source(
    source_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> None:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization) or ""

    src = _get_owned(db, source_id, user_id)
    src.is_active = False
    db.commit()


# ---------------------------------------------------------------------------
# Test connection
# ---------------------------------------------------------------------------

@router.post("/{source_id}/test", response_model=DataSourceTest)
async def test_source(
    source_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DataSourceTest:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization) or ""

    src = _get_owned(db, source_id, user_id)
    path = _resolve_preview_path(src)

    if not path:
        src.last_tested_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        return DataSourceTest(ok=False, message="No readable path configured for this source type", preview=[])

    try:
        con = duckdb.connect(":memory:")
        try:
            rows = con.execute(
                f"SELECT * FROM read_parquet('{path}') LIMIT 5"
            ).df().to_dict(orient="records")
        except Exception:
            rows = con.execute(
                f"SELECT * FROM read_csv_auto('{path}') LIMIT 5"
            ).df().to_dict(orient="records")
        finally:
            con.close()

        src.last_tested_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        return DataSourceTest(ok=True, message="Connection successful", preview=rows)

    except Exception as exc:
        src.last_tested_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        return DataSourceTest(ok=False, message=str(exc), preview=[])


# ---------------------------------------------------------------------------
# Pipelines that reference this source
# ---------------------------------------------------------------------------

@router.get("/{source_id}/pipelines")
async def get_dependent_pipelines(
    source_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization) or ""

    _get_owned(db, source_id, user_id)   # ownership check

    pipelines = db.query(PipelineV2DB).filter(PipelineV2DB.user_id == user_id).all()
    result = []
    for p in pipelines:
        steps = p.steps if isinstance(p.steps, list) else []
        refs = [
            s for s in steps
            if isinstance(s, dict)
            and (
                (s.get("parameters") or {}).get("data_source_id") == source_id
                or (s.get("parameters") or {}).get("source_id") == source_id
            )
        ]
        if refs:
            result.append(
                {
                    "id": p.id,
                    "name": p.name,
                    "status": p.status,
                    "step_count": len(steps),
                }
            )
    return result


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _get_owned(db: Session, source_id: str, user_id: str) -> DataSourceDB:
    src = db.query(DataSourceDB).filter(DataSourceDB.id == source_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Data source not found")
    if src.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return src


def _count_referencing_pipelines(db: Session, source_id: str) -> int:
    """Count pipelines that reference this source_id in any step."""
    all_pipelines = db.query(PipelineV2DB).all()
    count = 0
    for p in all_pipelines:
        steps = p.steps if isinstance(p.steps, list) else []
        for s in steps:
            if not isinstance(s, dict):
                continue
            params = s.get("parameters") or {}
            if params.get("data_source_id") == source_id or params.get("source_id") == source_id:
                count += 1
                break
    return count
