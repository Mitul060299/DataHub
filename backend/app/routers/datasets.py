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
    DatasetExportConnectorRequest,
)
from ..services.events import emit_event
from ..security import get_current_role, get_current_user_id, require_role, decrypt_connector_config
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
from ..services.audit import audit_store
from ..models import AuditEntry
from ..models_db import DatasetMetaDB, DatasetDataDB, DatasetChunkDB, DataSourceDB, PipelineScheduleDB, ConnectorCredentialDB
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

@router.get("/export/sheets-config")
def get_sheets_export_config(
    authorization: str | None = Header(default=None),
) -> dict:
    """Return the Google service-account email so the frontend can show a 'share with' hint.
    The full JSON secret is never exposed — only the client_email field."""
    require_role("viewer", get_current_role(authorization))
    email = settings.google_service_account_email
    if not email and settings.google_service_account_json:
        # Parse the email from the JSON if an explicit override is not set
        import json, base64 as _b64  # noqa: E401
        try:
            try:
                sa_info = json.loads(settings.google_service_account_json)
            except json.JSONDecodeError:
                sa_info = json.loads(_b64.b64decode(settings.google_service_account_json).decode("utf-8"))
            email = sa_info.get("client_email", "")
        except Exception:
            email = ""
    return {"service_account_email": email}


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
    # ── File validation: extension, magic bytes, size, encoding ──────────────
    from ..services.file_validator import validate_upload as _validate_upload
    from ..services.plan_guard import limits_for_plan as _limits_for_plan
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty.")
    _plan_limits = _limits_for_plan(user_plan)
    _max_bytes = _plan_limits.max_file_size_bytes  # -1 means unlimited (Enterprise)
    if _max_bytes > 0 and len(content) > _max_bytes:
        _file_mb = round(len(content) / (1024 * 1024), 1)
        _cap = _max_bytes
        _limit_label = (
            f"{_cap // (1024 ** 3)} GB" if _cap >= 1024 ** 3
            else f"{round(_cap / (1024 * 1024))} MB"
        )
        raise HTTPException(
            status_code=413,
            detail={
                "error": "file_too_large",
                "message": (
                    f"Your file is {_file_mb} MB. The {user_plan} plan supports "
                    f"files up to {_limit_label}. For large files, Parquet format is 5\u201310\u00d7 "
                    "smaller than CSV \u2014 convert with: df.to_parquet('file.parquet')"
                ),
                "file_size_mb": _file_mb,
                "limit_label": _limit_label,
                "plan": user_plan,
            },
        )
    _vr = _validate_upload(content, file.filename or "")
    if not _vr.valid:
        raise HTTPException(
            status_code=422,
            detail={"error": "file_validation_failed", "message": _vr.error or "File validation failed."},
        )
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
    # Audit trail
    try:
        audit_store.add(AuditEntry(
            action="dataset.upload",
            actor=user_id or "anonymous",
            target=f"dataset:{dataset_id}",
            metadata={"name": resolved_name, "rows": int(df.shape[0]), "columns": list(df.columns)},
        ))
    except Exception:
        pass
    preview = DatasetPreview(
        dataset_id=dataset_id,
        name=resolved_name,
        columns=list(df.columns),
        row_count=int(df.shape[0]),
        sample_rows=df.head(10).to_dict(orient="records"),
        parent_id=None,
    )
    emit_event("dataset.uploaded", preview.model_dump())

    # ── Auto-refresh trigger: fire any pipeline schedules with auto_refresh_on_upload ──
    try:
        if user_id:
            from ..models_db import PipelineV2DB
            # Find all active auto-refresh schedules for pipelines owned by this user
            auto_schedules = (
                db.query(PipelineScheduleDB)
                .join(PipelineV2DB, PipelineV2DB.id == PipelineScheduleDB.pipeline_id)
                .filter(
                    PipelineScheduleDB.is_active == True,          # noqa: E712
                    PipelineScheduleDB.auto_refresh_on_upload == True,  # noqa: E712
                    PipelineV2DB.user_id == user_id,
                )
                .all()
            )
            for sched in auto_schedules:
                # Provide the newly uploaded dataset as the input, overriding default params
                background_tasks.add_task(
                    _run_pipeline,
                    sched.pipeline_id,
                    "upload",
                    {"input_dataset_id": dataset_id},
                )
    except Exception:
        pass  # never let trigger logic break the upload response

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


@router.get("", response_model=list[DatasetMeta])
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
                "uploaded_by": getattr(v, "uploaded_by", None),
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
            uploaded_by=user_id,
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


@router.get("/compare-schemas")
def compare_schemas(
    ids: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Compare column schemas of two datasets and return alignment info."""
    role = get_current_role(authorization)
    require_role("viewer", role)

    dataset_ids = [d.strip() for d in ids.split(",") if d.strip()]
    if len(dataset_ids) < 2:
        raise HTTPException(status_code=400, detail="Provide at least two dataset IDs separated by commas")

    results = []
    for did in dataset_ids[:2]:
        meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == did).first()
        if not meta:
            raise HTTPException(status_code=404, detail=f"Dataset {did!r} not found")
        columns = list(meta.columns or [])
        results.append({"id": did, "name": meta.name or did, "columns": columns})

    cols_a = set(str(c) for c in results[0]["columns"])
    cols_b = set(str(c) for c in results[1]["columns"])

    exact_matches = sorted(cols_a & cols_b)
    only_in_a = sorted(cols_a - cols_b)
    only_in_b = sorted(cols_b - cols_a)

    # Fuzzy column suggestions (difflib)
    fuzzy_suggestions: list[dict] = []
    for col in only_in_a:
        close = difflib.get_close_matches(col, list(cols_b), n=1, cutoff=0.6)
        if close:
            fuzzy_suggestions.append({"column_a": col, "column_b": close[0], "confidence": "high"})

    return {
        "datasets": results,
        "exact_matches": exact_matches,
        "only_in_a": only_in_a,
        "only_in_b": only_in_b,
        "fuzzy_suggestions": fuzzy_suggestions,
        "alignment_score": round(len(exact_matches) / max(len(cols_a | cols_b), 1), 2),
    }
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
    user_id = get_current_user_id(authorization)
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
    # Audit trail
    try:
        audit_store.add(AuditEntry(
            action="dataset.delete",
            actor=user_id or "anonymous",
            target=f"dataset:{dataset_id}",
            metadata={},
        ))
    except Exception:
        pass
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
    """Export full dataset as CSV — reads from stored Parquet artifact (no LIMIT)."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")

    def row_iter():
        if meta.storage_path:
            query_path = StorageService.get_query_path(meta.storage_path)
            conn = DuckDBService._ensure_db()

            # Build optional WHERE / ORDER BY clauses
            conditions: list[str] = []
            if filter_col and filter_op and filter_val is not None:
                col_q = filter_col.replace('"', '""')
                val_q = filter_val.replace("'", "''")
                if filter_op == "contains":
                    conditions.append(f'LOWER("{col_q}") LIKE \'%{val_q.lower()}%\'')
                elif filter_op == "eq":
                    conditions.append(f'"{col_q}" = \'{val_q}\'')
                elif filter_op == "gt":
                    conditions.append(f'TRY_CAST("{col_q}" AS DOUBLE) > {float(filter_val)!r}')
                elif filter_op == "lt":
                    conditions.append(f'TRY_CAST("{col_q}" AS DOUBLE) < {float(filter_val)!r}')

            where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
            order = ""
            if sort_by:
                sb_q = sort_by.replace('"', '""')
                direction = "DESC" if sort_dir.lower() == "desc" else "ASC"
                order = f' ORDER BY "{sb_q}" {direction}'

            sql = f"SELECT * FROM read_parquet('{query_path}'){where}{order}"
            result = conn.execute(sql)
            col_names = [desc[0] for desc in result.description]
            yield ",".join(col_names) + "\n"
            for batch in result.fetch_arrow_reader(1000):
                for row in batch.to_pylist():
                    yield ",".join(str(row.get(c, "") or "") for c in col_names) + "\n"
        else:
            # Legacy fallback: reconstruct from DatasetChunkDB chunks
            col_names_raw = meta.columns or []
            # meta.columns may be list[str] or list[dict]
            if col_names_raw and isinstance(col_names_raw[0], dict):
                col_names = [c.get("name", "") for c in col_names_raw]
            else:
                col_names = list(col_names_raw)
            yield ",".join(col_names) + "\n"
            chunks = (
                db.query(DatasetChunkDB)
                .filter(DatasetChunkDB.dataset_id == dataset_id)
                .order_by(DatasetChunkDB.chunk_index.asc())
                .all()
            )
            rows: list[dict] = []
            for chunk in chunks:
                rows.extend(chunk.rows or [])
            for row in rows:
                yield ",".join(str(row.get(c, "") or "") for c in col_names) + "\n"

    emit_event("dataset.exported", {"dataset_id": dataset_id})
    display_name = (meta.name or dataset_id).replace('"', "")
    headers = {"Content-Disposition": f'attachment; filename="{display_name}.csv"'}
    return StreamingResponse(row_iter(), media_type="text/csv", headers=headers)


@router.get("/{dataset_id}/export/powerbi")
def export_dataset_powerbi(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Export full dataset as a Power BI-ready .xlsx file."""
    from ..services.export_service import ExportService
    role = get_current_role(authorization)
    require_role("viewer", role)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    try:
        xlsx_bytes = ExportService.export_powerbi(dataset_id, meta.name or dataset_id, db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}") from exc
    emit_event("dataset.exported_powerbi", {"dataset_id": dataset_id})
    safe_name = (meta.name or dataset_id).replace('"', "")
    headers = {
        "Content-Disposition": f'attachment; filename="{safe_name}.xlsx"',
    }
    return StreamingResponse(
        iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.get("/{dataset_id}/export/tableau")
def export_dataset_tableau(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Export full dataset as a Tableau .hyper file (CSV fallback if pantab unavailable)."""
    from ..services.export_service import ExportService
    role = get_current_role(authorization)
    require_role("viewer", role)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    try:
        file_bytes, mime_type = ExportService.export_tableau(dataset_id, meta.name or dataset_id, db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}") from exc
    emit_event("dataset.exported_tableau", {"dataset_id": dataset_id})
    safe_name = (meta.name or dataset_id).replace('"', "")
    ext = "csv" if mime_type == "text/csv" else "hyper"
    headers = {
        "Content-Disposition": f'attachment; filename="{safe_name}.{ext}"',
    }
    return StreamingResponse(iter([file_bytes]), media_type=mime_type, headers=headers)


class SheetsExportPayload(dict):
    pass


@router.post("/{dataset_id}/export/sheets")
def export_dataset_to_sheets(
    dataset_id: str,
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Sync full dataset to a Google Sheet via service-account credentials."""
    from ..services.export_service import ExportService
    role = get_current_role(authorization)
    require_role("viewer", role)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")

    spreadsheet_url = payload.get("spreadsheet_url", "")
    sheet_name = payload.get("sheet_name", "Sheet1")
    mode = payload.get("mode", "replace")

    if not spreadsheet_url:
        raise HTTPException(status_code=422, detail="spreadsheet_url is required")
    if mode not in ("replace", "append"):
        raise HTTPException(status_code=422, detail="mode must be 'replace' or 'append'")

    try:
        result = ExportService.export_sheets(dataset_id, spreadsheet_url, sheet_name, mode, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Google Sheets sync failed: {exc}") from exc

    emit_event("dataset.exported_sheets", {"dataset_id": dataset_id, "rows_written": result.get("rows_written", 0)})
    return result


@router.get("/{dataset_id}/schema")
def get_dataset_schema(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return column names and types for a dataset (lightweight, no row scan)."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    raw_schema = DuckDBService.get_schema(dataset_id)
    # schema values may be a nested dict {"type": "int64", "nullable": True}
    # (from DataConversionService) or a plain string (from _infer_schema_from_rows)
    def _extract_type(v: object) -> str:
        if isinstance(v, dict):
            return str(v.get("type", "string"))
        return str(v) if v is not None else "string"
    columns = [{"name": col, "type": _extract_type(col_type)} for col, col_type in raw_schema.items()]
    return {"columns": columns}


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

    # ── Fast path: DuckDB reads only the requested page from Parquet ──────────
    # This avoids loading all rows into RAM regardless of dataset size.
    if meta.storage_path and getattr(meta, "import_mode", "cached") != "live":
        try:
            page_rows, total = DuckDBService.preview_page(
                meta.storage_path,
                offset=offset,
                limit=limit,
                allowed_columns=list(meta.columns or []),
                sort_by=sort_by,
                sort_dir=sort_dir,
                filter_col=filter_col,
                filter_op=filter_op,
                filter_val=filter_val,
            )
            # Avoid a full COUNT scan when no filter is active — use stored metadata
            if not filter_col:
                total = meta.row_count or total
            return DatasetPage(
                dataset_id=dataset_id,
                columns=meta.columns,
                offset=offset,
                limit=limit,
                rows=page_rows,
                total_rows=total,
            )
        except Exception as exc:
            logger.warning(
                "DuckDB preview_page failed for %s, falling back to chunk path: %s",
                dataset_id, exc,
            )
            # Fall through to chunk/live paths below

    # ── Live federation path ───────────────────────────────────────────────────
    if getattr(meta, "import_mode", "cached") == "live":
        try:
            from ..services.live_dataset import LiveDatasetService
            df = LiveDatasetService.get_live_data(meta, db)
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Source database unavailable for live dataset: {exc}",
            ) from exc
    else:
        # ── Chunk / DB fallback — hard cap at 10K rows to prevent OOM ─────────
        df = get_dataset_from_db(dataset_id, db)

    _PREVIEW_RAM_CAP = 10_000
    rows: list[dict] = df.to_dict(orient="records")[:_PREVIEW_RAM_CAP]

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


# ── Write-back: export a dataset to any SQL connector ─────────────────────────

@router.post("/{dataset_id}/export/connector")
def export_dataset_to_connector(
    dataset_id: str,
    payload: DatasetExportConnectorRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """
    Write the rows of a dataset directly into a SQL database table.

    The caller supplies either:
    - credential_id  → use a previously saved encrypted credential, OR
    - connector_config → inline credentials (not saved)

    mode: 'append' (default) | 'replace' | 'fail'
    """
    from ..services.connectors import connector_registry
    from ..services.plan_guard import resolve_user_plan, enforce_connector_access

    role = get_current_role(authorization)
    require_role("editor", role)
    user_plan = resolve_user_plan(db, authorization)
    enforce_connector_access(user_plan, payload.connector_type)

    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # ── Resolve credentials ──────────────────────────────────────────────────
    if payload.credential_id:
        cred_row = (
            db.query(ConnectorCredentialDB)
            .filter(ConnectorCredentialDB.id == payload.credential_id)
            .first()
        )
        if not cred_row:
            raise HTTPException(status_code=404, detail="Credential not found")
        config = decrypt_connector_config(cred_row.encrypted_config)
    elif payload.connector_config:
        config = dict(payload.connector_config)
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide credential_id or connector_config",
        )

    # ── Load dataset rows ────────────────────────────────────────────────────
    try:
        df = get_dataset(dataset_id)
    except KeyError:
        df = get_dataset_from_db(dataset_id, db)

    if df.empty:
        raise HTTPException(status_code=400, detail="Dataset is empty — nothing to write")

    # ── Resolve connector and write ──────────────────────────────────────────
    connector = connector_registry.get(payload.connector_type)
    if not connector:
        raise HTTPException(status_code=404, detail=f"Connector '{payload.connector_type}' not found")

    if not hasattr(connector, "write"):
        raise HTTPException(
            status_code=400,
            detail=f"Connector '{payload.connector_type}' does not support write-back",
        )

    # Safety: default to 'append' unless the user explicitly chose 'replace'
    mode = payload.mode if payload.mode in ("append", "replace", "fail") else "append"

    try:
        rows_written = connector.write(config=config, df=df, table=payload.table_name, mode=mode)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Write-back failed: {exc}") from exc

    return {
        "ok": True,
        "dataset_id": dataset_id,
        "connector_type": payload.connector_type,
        "table": payload.table_name,
        "mode": mode,
        "rows_written": rows_written,
    }
