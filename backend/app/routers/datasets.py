from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header, Depends, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from typing import Dict
import time
from io import StringIO
import pandas as pd
import uuid
import difflib
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
from ..models import (
    DatasetPreview,
    DatasetMeta,
    DatasetLineageGraph,
    DatasetLineageNode,
    DatasetLineageEdge,
    DatasetPage,
    DatasetQueryRequest,
    DatasetQueryResponse,
    CrossDatasetQueryRequest,
    CrossDatasetQueryResponse,
    DatasetRenameRequest,
    JoinableDataset,
    JoinableResponse,
    StorageTierPolicyOut,
    StorageTierPolicyUpdate,
)
from ..services.events import emit_event
from ..security import get_current_role, get_current_user_id, require_role
from ..db import get_db
from ..config import settings
from ..services.cache import invalidate_profile_cache
from ..services.duckdb_service import DuckDBService
from ..services.query_cache import QueryCacheService
from ..services.object_storage import StorageService
from ..services.rate_limiter import limiter
from ..services.storage_tiering import storage_tier_service
from ..services.plan_guard import resolve_user_plan, enforce_sso
from ..services.usage_service import enforce_usage_limit, increment_usage
from ..models_db import DatasetMetaDB, DatasetDataDB, DatasetChunkDB, DataSourceDB, PipelineScheduleDB
from ..services.pipeline_runner import run_pipeline as _run_pipeline

router = APIRouter(prefix="/datasets", tags=["datasets"])

_DATASETS: Dict[str, pd.DataFrame] = {}
_DATASET_LAST_ACCESS: Dict[str, float] = {}

_CHUNK_SIZE = 1000
_MAX_CACHE = settings.dataset_cache_max
_CACHE_TTL = settings.dataset_cache_ttl_seconds
_DATASET_META_SCHEMA_CHECKED = False


def _touch_cache(dataset_id: str) -> None:
    _DATASET_LAST_ACCESS[dataset_id] = time.time()


def _evict_cache() -> None:
    now = time.time()
    expired = [key for key, ts in _DATASET_LAST_ACCESS.items() if now - ts > _CACHE_TTL]
    for key in expired:
        _DATASET_LAST_ACCESS.pop(key, None)
        _DATASETS.pop(key, None)

    if len(_DATASETS) <= _MAX_CACHE:
        return
    sorted_items = sorted(_DATASET_LAST_ACCESS.items(), key=lambda item: item[1])
    while len(_DATASETS) > _MAX_CACHE and sorted_items:
        key, _ = sorted_items.pop(0)
        _DATASET_LAST_ACCESS.pop(key, None)
        _DATASETS.pop(key, None)


def dataset_cache_stats() -> dict:
    if _DATASET_LAST_ACCESS:
        oldest = min(_DATASET_LAST_ACCESS.values())
        newest = max(_DATASET_LAST_ACCESS.values())
    else:
        oldest = None
        newest = None
    return {
        "cached_datasets": len(_DATASETS),
        "max_cached": _MAX_CACHE,
        "ttl_seconds": _CACHE_TTL,
        "oldest_access": oldest,
        "newest_access": newest,
    }


def _chunk_rows(rows: list[dict], size: int) -> list[list[dict]]:
    return [rows[i : i + size] for i in range(0, len(rows), size)]


def _ensure_dataset_meta_schema(db: Session) -> None:
    global _DATASET_META_SCHEMA_CHECKED
    if _DATASET_META_SCHEMA_CHECKED:
        return

    inspector = inspect(db.bind)
    existing_columns = {col["name"] for col in inspector.get_columns("dataset_meta")}
    required_columns = {
        "user_id": "VARCHAR",
        "name": "VARCHAR",
        "description": "TEXT",
        "source_type": "VARCHAR",
        "storage_provider": "VARCHAR DEFAULT 's3'",
        "storage_path": "TEXT",
        "file_format": "VARCHAR DEFAULT 'parquet'",
        "schema_json": "JSONB DEFAULT '{}'::jsonb",
        "stats_json": "JSONB DEFAULT '{}'::jsonb",
        "columns": "JSONB DEFAULT '[]'::jsonb",
        "row_count": "INTEGER",
        "file_size_bytes": "BIGINT",
        "compressed_size_bytes": "BIGINT",
        "status": "VARCHAR DEFAULT 'processing'",
        "error_message": "TEXT",
        "last_queried_at": "TIMESTAMPTZ",
        "query_count": "INTEGER DEFAULT 0",
        "access_tier": "VARCHAR DEFAULT 'hot'",
        "parent_id": "VARCHAR",
        "created_at": "TIMESTAMPTZ DEFAULT now()",
        "updated_at": "TIMESTAMPTZ DEFAULT now()",
    }

    for column_name, column_ddl in required_columns.items():
        if column_name not in existing_columns:
            db.execute(
                text(
                    f"ALTER TABLE dataset_meta ADD COLUMN IF NOT EXISTS {column_name} {column_ddl}"
                )
            )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("dataset_meta")}
    if "idx_datasets_user_workspace" not in existing_indexes:
        db.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_datasets_user_workspace "
                "ON dataset_meta (user_id, workspace_id)"
            )
        )

    db.commit()
    _DATASET_META_SCHEMA_CHECKED = True


# ── File validation endpoint ──────────────────────────────────────────────────

@router.post("/validate")
@limiter.limit("30/minute")
async def validate_file(
    request: Request,
    file: UploadFile = File(...),
    _role: str = Depends(get_current_role),
):
    """Validate an uploaded file before commit — returns preview metadata."""
    from ..services.file_validator import validate_upload

    file_bytes = await file.read()
    result = validate_upload(file_bytes, file.filename or "")

    if not result.valid:
        raise HTTPException(status_code=422, detail={
            "error": "file_validation_failed",
            "message": result.error or "File validation failed.",
        })

    return {
        "valid": True,
        "filename": file.filename,
        "file_size_mb": result.file_size_mb,
        "row_count": result.row_count,
        "column_count": result.column_count,
        "columns": [{"name": c.name, "type": c.type} for c in result.columns],
        "encoding_converted": result.encoding_converted,
        "warnings": result.warnings,
    }


@router.post("/upload", response_model=DatasetPreview)
@limiter.limit("20/hour")
async def upload_dataset(
    request: Request,
    file: UploadFile = File(...),
    dataset_name: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
) -> DatasetPreview:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization)
    _ensure_dataset_meta_schema(db)
    # Usage limit check
    user_plan = resolve_user_plan(db, authorization)
    enforce_usage_limit(user_id, user_plan, "datasets_uploaded", db)
    content = await file.read()
    df = pd.read_csv(pd.io.common.BytesIO(content))
    df = df.astype(object).where(pd.notnull(df), None)
    resolved_name = (dataset_name or "").strip() or (file.filename or "dataset")
    dataset_id = str(uuid.uuid4())
    if int(df.shape[0]) <= 5000:
        _DATASETS[dataset_id] = df
        _touch_cache(dataset_id)
        _evict_cache()
    initial_tier = storage_tier_service.assign_initial_tier(
        file_size_bytes=len(content),
        row_count=int(df.shape[0]),
    )
    db.add(
        DatasetMetaDB(
            id=dataset_id,
            user_id=user_id,
            workspace_id=workspace_id or "default",
            name=resolved_name,
            columns=list(df.columns),
            row_count=int(df.shape[0]),
            access_tier=initial_tier,
            parent_id=None,
        )
    )
    rows = df.to_dict(orient="records")
    chunks = _chunk_rows(rows, _CHUNK_SIZE)
    for index, chunk in enumerate(chunks):
        db.add(
            DatasetChunkDB(
                id=f"{dataset_id}:{index}",
                dataset_id=dataset_id,
                chunk_index=index,
                rows=chunk,
            )
        )
    if len(rows) <= 5000:
        db.add(
            DatasetDataDB(
                id=dataset_id,
                rows=rows,
            )
        )
    db.commit()
    # Track monthly dataset upload usage
    increment_usage(user_id, "datasets_uploaded", db)
    preview = DatasetPreview(
        dataset_id=dataset_id,
        name=resolved_name,
        columns=list(df.columns),
        row_count=int(df.shape[0]),
        sample_rows=df.head(10).to_dict(orient="records"),
        parent_id=None,
    )
    emit_event("dataset.uploaded", preview.model_dump())

    # ── Auto-refresh trigger: find pipelines with auto_refresh_on_upload ──────
    try:
        uploaded_filename = file.filename or resolved_name
        matching_sources = (
            db.query(DataSourceDB)
            .filter(
                DataSourceDB.user_id == (user_id or ""),
                DataSourceDB.source_type == "manual_upload",
                DataSourceDB.is_active == True,  # noqa: E712
            )
            .all()
        )
        for src in matching_sources:
            cfg = src.config or {}
            # Match by filename pattern stored in config["match_filename"]
            pattern = str(cfg.get("match_filename", "")).strip()
            if pattern and pattern not in uploaded_filename:
                continue
            # Find schedules for pipelines that reference this source
            schedules = (
                db.query(PipelineScheduleDB)
                .filter(
                    PipelineScheduleDB.is_active == True,  # noqa: E712
                    PipelineScheduleDB.auto_refresh_on_upload == True,  # noqa: E712
                )
                .all()
            )
            for sched in schedules:
                background_tasks.add_task(
                    _run_pipeline,
                    sched.pipeline_id,
                    "upload",
                    {"source_id": src.id, "storage_path": None},
                )
    except Exception:
        pass  # never let the trigger logic break the upload response

    return preview


def save_dataset(
    df: pd.DataFrame,
    db: Session,
    parent_id: str | None = None,
    workspace_id: str | None = None,
    user_id: str | None = None,
    store_rows: bool = True,
    meta_extra: dict | None = None,
) -> str:
    _ensure_dataset_meta_schema(db)
    dataset_id = str(uuid.uuid4())
    df = df.astype(object).where(pd.notnull(df), None)
    if store_rows and int(df.shape[0]) <= 5000:
        _DATASETS[dataset_id] = df
        _touch_cache(dataset_id)
        _evict_cache()
    meta_kwargs = {
        "id": dataset_id,
        "user_id": user_id,
        "workspace_id": workspace_id or "default",
        "columns": list(df.columns),
        "row_count": int(df.shape[0]),
        "parent_id": parent_id,
        "access_tier": storage_tier_service.assign_initial_tier(
            row_count=int(df.shape[0]),
            parent_tier=(meta_extra or {}).get("access_tier") if meta_extra else None,
        ),
    }
    if meta_extra:
        meta_kwargs.update(meta_extra)
    db.add(DatasetMetaDB(**meta_kwargs))

    if store_rows:
        rows = df.to_dict(orient="records")
        chunks = _chunk_rows(rows, _CHUNK_SIZE)
        for index, chunk in enumerate(chunks):
            db.add(
                DatasetChunkDB(
                    id=f"{dataset_id}:{index}",
                    dataset_id=dataset_id,
                    chunk_index=index,
                    rows=chunk,
                )
            )
        if len(rows) <= 5000:
            db.add(
                DatasetDataDB(
                    id=dataset_id,
                    rows=rows,
                )
            )
    db.commit()
    emit_event("dataset.transformed", {"dataset_id": dataset_id})
    return dataset_id


@router.get("/storage-tier/policy", response_model=StorageTierPolicyOut)
def get_storage_tier_policy(
    authorization: str | None = Header(default=None),
) -> StorageTierPolicyOut:
    role = get_current_role(authorization)
    require_role("viewer", role)
    return StorageTierPolicyOut(**storage_tier_service.policy())


@router.put("/storage-tier/policy", response_model=StorageTierPolicyOut)
def update_storage_tier_policy(
    payload: StorageTierPolicyUpdate,
    authorization: str | None = Header(default=None),
) -> StorageTierPolicyOut:
    role = get_current_role(authorization)
    require_role("admin", role)
    updated = storage_tier_service.update_policy(
        hot_max_size_bytes=payload.hot_max_size_bytes,
        warm_max_size_bytes=payload.warm_max_size_bytes,
        warm_after_days=payload.warm_after_days,
        archive_after_days=payload.archive_after_days,
    )
    return StorageTierPolicyOut(**updated)


@router.post("/storage-tier/rebalance")
def rebalance_storage_tiers(
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)

    query = db.query(DatasetMetaDB)
    if workspace_id:
        query = query.filter(DatasetMetaDB.workspace_id == workspace_id)
    datasets = query.all()

    updated_count = 0
    for meta in datasets:
        current_tier = meta.access_tier or "hot"
        next_tier = storage_tier_service.rebalance_tier(
            current_tier=current_tier,
            created_at=meta.created_at,
            last_queried_at=meta.last_queried_at,
        )
        if next_tier != current_tier:
            meta.access_tier = next_tier
            updated_count += 1
    db.commit()
    return {
        "status": "ok",
        "updated": updated_count,
        "total": len(datasets),
        "workspace_id": workspace_id,
    }


def get_dataset(dataset_id: str) -> pd.DataFrame:
    if dataset_id not in _DATASETS:
        raise KeyError("Dataset not found")
    _touch_cache(dataset_id)
    return _DATASETS[dataset_id]


def get_dataset_from_db(dataset_id: str, db: Session) -> pd.DataFrame:
    chunks = (
        db.query(DatasetChunkDB)
        .filter(DatasetChunkDB.dataset_id == dataset_id)
        .order_by(DatasetChunkDB.chunk_index.asc())
        .all()
    )
    if chunks:
        rows: list[dict] = []
        for chunk in chunks:
            rows.extend(chunk.rows or [])
        df = pd.DataFrame(rows)
        _DATASETS[dataset_id] = df
        _touch_cache(dataset_id)
        _evict_cache()
        return df

    data = db.query(DatasetDataDB).filter(DatasetDataDB.id == dataset_id).first()
    if data:
        df = pd.DataFrame(data.rows)
        _DATASETS[dataset_id] = df
        _touch_cache(dataset_id)
        _evict_cache()
        return df

    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta or not meta.storage_path:
        raise KeyError("Dataset not found")

    query_path = StorageService.get_query_path(meta.storage_path)
    df = pd.read_parquet(query_path)
    _DATASETS[dataset_id] = df
    _touch_cache(dataset_id)
    _evict_cache()
    return df


@router.get("/", response_model=list[DatasetMeta])
def list_datasets(
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> list[DatasetMeta]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    query = db.query(DatasetMetaDB)
    if workspace_id:
        # Include rows with NULL workspace_id (legacy / un-tagged datasets) as
        # well as exact matches so uploads from any code path are always visible.
        query = query.filter(
            (DatasetMetaDB.workspace_id == workspace_id)
            | DatasetMetaDB.workspace_id.is_(None)
        )
    rows = query.all()
    datasets: list[DatasetMeta] = []

    for row in rows:
        dataset_id = str(row.id or "").strip()
        if not dataset_id:
            continue

        raw_columns = row.columns if isinstance(row.columns, (list, tuple)) else []
        columns = [str(column) for column in raw_columns if column is not None]

        try:
            row_count = int(row.row_count or 0)
        except (TypeError, ValueError):
            row_count = 0

        datasets.append(
            DatasetMeta(
                dataset_id=dataset_id,
                name=str(row.name) if row.name is not None else None,
                file_format=str(row.file_format) if row.file_format is not None else None,
                columns=columns,
                row_count=row_count,
                parent_id=str(row.parent_id) if row.parent_id is not None else None,
            )
        )

    return datasets


# ── Version History endpoints ─────────────────────────────────────────────────

@router.get("/{dataset_id}/versions")
def list_dataset_versions(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return the full version chain for a dataset (walk parent_id links)."""
    role = get_current_role(authorization)
    require_role("viewer", role)

    # Walk backwards through parent chain to find the root
    chain = []
    current_id: str | None = dataset_id
    visited: set[str] = set()
    while current_id and current_id not in visited:
        visited.add(current_id)
        row = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == current_id).first()
        if not row:
            break
        chain.append(row)
        current_id = row.parent_id

    # Walk forward from the root to collect all descendants of the root
    if chain:
        root = chain[-1]
        all_versions = (
            db.query(DatasetMetaDB)
            .filter(DatasetMetaDB.id == root.id)
            .all()
        )
        # Collect descendants using a BFS
        to_visit = [root.id]
        expanded: list[DatasetMetaDB] = []
        visited_forward: set[str] = set()
        while to_visit:
            cur = to_visit.pop(0)
            if cur in visited_forward:
                continue
            visited_forward.add(cur)
            rows = db.query(DatasetMetaDB).filter(DatasetMetaDB.parent_id == cur).all()
            for r in rows:
                expanded.append(r)
                to_visit.append(r.id)
        all_versions = [root] + expanded
    else:
        all_versions = []

    return {
        "dataset_id": dataset_id,
        "versions": [
            {
                "id": v.id,
                "name": v.name,
                "version_number": getattr(v, "version_number", 1),
                "version_note": getattr(v, "version_note", None),
                "row_count": v.row_count,
                "columns": v.columns,
                "created_at": v.created_at.isoformat() if v.created_at else None,
                "parent_id": v.parent_id,
                "is_current": v.id == dataset_id,
            }
            for v in sorted(all_versions, key=lambda x: getattr(x, "version_number", 1))
        ],
    }


@router.post("/{dataset_id}/upload-version")
@limiter.limit("20/hour")
async def upload_new_version(
    request: Request,
    dataset_id: str,
    file: UploadFile = File(...),
    version_note: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    """Upload a new version of an existing dataset. Returns the new dataset id."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization)

    parent = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Validate
    from ..services.file_validator import validate_upload
    file_bytes = await file.read()
    validation = validate_upload(file_bytes, file.filename or "")
    if not validation.valid:
        raise HTTPException(status_code=422, detail={
            "error": "file_validation_failed",
            "message": validation.error or "File validation failed.",
        })

    df = pd.read_csv(pd.io.common.BytesIO(file_bytes))
    df = df.astype(object).where(pd.notnull(df), None)
    new_id = str(uuid.uuid4())
    next_version = (getattr(parent, "version_number", 1) or 1) + 1

    db.add(
        DatasetMetaDB(
            id=new_id,
            user_id=user_id,
            workspace_id=workspace_id or parent.workspace_id or "default",
            name=parent.name,
            columns=list(df.columns),
            row_count=int(df.shape[0]),
            access_tier=parent.access_tier or "hot",
            parent_id=dataset_id,
            version_number=next_version,
            version_note=version_note or None,
        )
    )
    rows = df.to_dict(orient="records")
    if rows:
        db.add(DatasetDataDB(id=new_id, rows=rows))
    db.commit()
    increment_usage(user_id, "datasets_uploaded", db)

    return {
        "new_dataset_id": new_id,
        "version_number": next_version,
        "parent_id": dataset_id,
        "row_count": int(df.shape[0]),
    }


@router.get("/{dataset_id}/lineage", response_model=list[DatasetMeta])
def dataset_lineage(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[DatasetMeta]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    lineage: list[DatasetMeta] = []
    current_id = dataset_id
    visited = set()
    while current_id and current_id not in visited:
        visited.add(current_id)
        row = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == current_id).first()
        if not row:
            break
        lineage.append(
            DatasetMeta(
                dataset_id=row.id,
                name=row.name,
                file_format=row.file_format,
                columns=row.columns,
                row_count=row.row_count,
                parent_id=row.parent_id,
            )
        )
        current_id = row.parent_id
    return lineage


@router.get("/{dataset_id}/lineage/graph", response_model=DatasetLineageGraph)
def dataset_lineage_graph(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DatasetLineageGraph:
    role = get_current_role(authorization)
    require_role("viewer", role)

    user_plan = resolve_user_plan(db, authorization)
    enforce_sso(user_plan)

    nodes: list[DatasetLineageNode] = []
    edges: list[DatasetLineageEdge] = []
    current_id = dataset_id
    visited = set()

    while current_id and current_id not in visited:
        visited.add(current_id)
        row = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == current_id).first()
        if not row:
            break

        nodes.append(
            DatasetLineageNode(
                dataset_id=row.id,
                name=row.name,
                file_format=row.file_format,
                source_type=row.source_type,
                row_count=row.row_count,
                created_at=row.created_at.isoformat() if row.created_at else None,
            )
        )

        if row.parent_id:
            edges.append(
                DatasetLineageEdge(
                    from_dataset_id=row.parent_id,
                    to_dataset_id=row.id,
                    relationship="transformed_from",
                )
            )
        current_id = row.parent_id

    return DatasetLineageGraph(nodes=nodes, edges=edges)


@router.patch("/{dataset_id}")
def rename_dataset(
    dataset_id: str,
    payload: DatasetRenameRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Rename a dataset (user-facing label only)."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    meta.name = name
    db.commit()
    return {"dataset_id": dataset_id, "name": name}


@router.get("/{dataset_id}/suggest-columns")
def suggest_columns(
    dataset_id: str,
    query: str,
    limit: int = 5,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("viewer", role)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    columns = meta.columns or []
    normalized = [str(col) for col in columns]
    close = difflib.get_close_matches(query, normalized, n=max(1, min(limit, 20)), cutoff=0.4)
    contains = [col for col in normalized if query.lower() in col.lower() and col not in close]
    suggestions = close + contains
    return {"query": query, "suggestions": suggestions[: max(1, min(limit, 20))]}


@router.post("/{dataset_id}/query", response_model=DatasetQueryResponse)
def query_dataset(
    dataset_id: str,
    payload: DatasetQueryRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DatasetQueryResponse:
    role = get_current_role(authorization)
    require_role("viewer", role)

    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta or not meta.storage_path:
        raise HTTPException(status_code=404, detail="Dataset not found or not in object storage")

    results, cached = DuckDBService.query_with_cache(
        db,
        dataset_id,
        meta.user_id,
        meta.storage_path,
        payload.query,
    )

    return DatasetQueryResponse(
        results=results,
        row_count=len(results),
        cached=cached,
    )


@router.post("/{dataset_id}/cache/clear")
def clear_dataset_cache(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    QueryCacheService.clear_dataset_cache(db, dataset_id)
    return {"success": True, "message": "Cache cleared"}


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict:
    role = get_current_role(authorization)
    require_role("viewer", role)
    if dataset_id in _DATASETS:
        _DATASETS.pop(dataset_id, None)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if meta and meta.storage_path:
        try:
            StorageService.delete(meta.storage_path)
        except Exception:
            pass
    db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).delete()
    db.query(DatasetDataDB).filter(DatasetDataDB.id == dataset_id).delete()
    db.query(DatasetChunkDB).filter(DatasetChunkDB.dataset_id == dataset_id).delete()
    db.commit()
    invalidate_profile_cache(dataset_id)
    emit_event("dataset.deleted", {"dataset_id": dataset_id})
    return {"status": "deleted", "dataset_id": dataset_id}


@router.get("/{dataset_id}/export")
def export_dataset(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    sort_by: str | None = None,
    sort_dir: str = "asc",
    filter_col: str | None = None,
    filter_op: str | None = None,
    filter_val: str | None = None,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    role = get_current_role(authorization)
    require_role("viewer", role)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")

    def row_iter():
        yield ",".join(meta.columns) + "\n"
        chunks = (
            db.query(DatasetChunkDB)
            .filter(DatasetChunkDB.dataset_id == dataset_id)
            .order_by(DatasetChunkDB.chunk_index.asc())
            .all()
        )
        rows: list[dict] = []
        for chunk in chunks:
            rows.extend(chunk.rows or [])

        if filter_col and filter_op and filter_val is not None:
            def _matches(row: dict) -> bool:
                value = row.get(filter_col)
                if filter_op == "contains":
                    return str(filter_val).lower() in str(value).lower()
                if filter_op == "eq":
                    return str(value) == str(filter_val)
                if filter_op == "gt":
                    try:
                        return float(value) > float(filter_val)
                    except Exception:
                        return False
                if filter_op == "lt":
                    try:
                        return float(value) < float(filter_val)
                    except Exception:
                        return False
                return True

            rows = [row for row in rows if _matches(row)]

        if sort_by:
            rows.sort(key=lambda r: (r.get(sort_by) is None, r.get(sort_by)))
            if sort_dir.lower() == "desc":
                rows.reverse()

        for row in rows:
            values = [str(row.get(col, "")) for col in meta.columns]
            yield ",".join(values) + "\n"

    emit_event("dataset.exported", {"dataset_id": dataset_id})
    return StreamingResponse(row_iter(), media_type="text/csv")


@router.get("/{dataset_id}/preview", response_model=DatasetPage)
def preview_dataset(
    dataset_id: str,
    offset: int = 0,
    limit: int = 50,
    sort_by: str | None = None,
    sort_dir: str = "asc",
    filter_col: str | None = None,
    filter_op: str | None = None,
    filter_val: str | None = None,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> DatasetPage:
    role = get_current_role(authorization)
    require_role("viewer", role)
    if limit > 500:
        limit = 500
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df = get_dataset_from_db(dataset_id, db)
    rows: list[dict] = df.to_dict(orient="records")

    if filter_col and filter_op and filter_val is not None:
        def _matches(row: dict) -> bool:
            value = row.get(filter_col)
            if filter_op == "contains":
                return str(filter_val).lower() in str(value).lower()
            if filter_op == "eq":
                return str(value) == str(filter_val)
            if filter_op == "gt":
                try:
                    return float(value) > float(filter_val)
                except Exception:
                    return False
            if filter_op == "lt":
                try:
                    return float(value) < float(filter_val)
                except Exception:
                    return False
            return True

        rows = [row for row in rows if _matches(row)]

    if sort_by:
        rows.sort(key=lambda r: (r.get(sort_by) is None, r.get(sort_by)))
        if sort_dir.lower() == "desc":
            rows.reverse()

    page_rows = rows[offset : offset + limit]

    return DatasetPage(
        dataset_id=dataset_id,
        columns=meta.columns,
        offset=offset,
        limit=limit,
        rows=page_rows,
        total_rows=meta.row_count,
    )


@router.post("/cross-query", response_model=CrossDatasetQueryResponse)
def cross_dataset_query(
    payload: CrossDatasetQueryRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> CrossDatasetQueryResponse:
    """Run a single DuckDB SQL query that joins/unions multiple datasets.

    ``payload.dataset_ids`` maps SQL relation alias -> dataset_id.
    The SQL query references tables by those aliases.
    """
    role = get_current_role(authorization)
    require_role("viewer", role)

    if not payload.dataset_ids:
        raise HTTPException(status_code=422, detail="dataset_ids must not be empty")

    relation_rows: dict[str, list[dict]] = {}
    for alias, dataset_id in payload.dataset_ids.items():
        try:
            df = get_dataset_from_db(dataset_id, db)
            relation_rows[alias] = df.astype(object).where(pd.notnull(df), None).to_dict(orient="records")
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found (alias: {alias})")

    try:
        results = DuckDBService.transform_named_relations(
            relation_rows=relation_rows,
            sql=payload.query,
            output_relation=list(payload.dataset_ids.keys())[0],
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Query error: {str(exc)}")

    return CrossDatasetQueryResponse(
        results=results,
        row_count=len(results),
        aliases=list(payload.dataset_ids.keys()),
    )


@router.get("/{dataset_id}/joinable", response_model=JoinableResponse)
def get_joinable_datasets(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> JoinableResponse:
    """Return datasets that share at least one column name with the given dataset.
    Useful for suggesting JOIN candidates in the UI and AI agent.
    """
    role = get_current_role(authorization)
    require_role("viewer", role)

    source_meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not source_meta:
        raise HTTPException(status_code=404, detail="Dataset not found")

    source_cols = set(str(c) for c in (source_meta.columns or []))
    if not source_cols:
        return JoinableResponse(dataset_id=dataset_id, joinable=[])

    query = db.query(DatasetMetaDB).filter(DatasetMetaDB.id != dataset_id)
    if workspace_id:
        query = query.filter(
            (DatasetMetaDB.workspace_id == workspace_id) | DatasetMetaDB.workspace_id.is_(None)
        )

    joinable: list[JoinableDataset] = []
    for meta in query.all():
        other_cols = set(str(c) for c in (meta.columns or []))
        shared = sorted(source_cols & other_cols)
        if shared:
            joinable.append(
                JoinableDataset(
                    dataset_id=str(meta.id),
                    name=str(meta.name) if meta.name else None,
                    shared_columns=shared,
                    total_columns=len(other_cols),
                    row_count=int(meta.row_count or 0),
                )
            )

    joinable.sort(key=lambda j: len(j.shared_columns), reverse=True)

    return JoinableResponse(dataset_id=dataset_id, joinable=joinable)
