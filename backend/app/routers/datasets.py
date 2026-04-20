from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header, Depends, BackgroundTasks, Request, Query
from fastapi.responses import StreamingResponse
from typing import Dict
import json
import logging
import threading
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
from ..services.usage_service import enforce_usage_limit, increment_usage, update_storage_bytes
from ..services.plan_guard import resolve_user_plan, resolve_workspace_plan
from ..services.audit import audit_store
from ..models import AuditEntry
from ..models_db import ArtifactDB, DatasetMetaDB, DatasetDataDB, DatasetChunkDB, DataSourceDB, PipelineScheduleDB, ConnectorCredentialDB, DatasetSessionDB
from ..services.pipeline_runner import run_pipeline as _run_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/datasets", tags=["datasets"])

# _DATASETS in-process LRU cache removed (Phase 5 statelessness).
# All dataset reads go via DB chunks or DuckDB-over-S3 so the backend
# has no per-process dataframe state and can be horizontally scaled.

# Per-dataset locks serialise concurrent DB-chunk loads for the same
# dataset — prevents N threads each issuing the same query in parallel.
_DATASET_LOADING_LOCK = threading.Lock()  # guards _DATASET_LOADING dict
_DATASET_LOADING: Dict[str, threading.Lock] = {}

# Hard row-cap for DB-chunk loads into pandas. Callers needing full data
# (exports, transforms) should use DuckDB directly against S3 Parquet.
_STORAGE_DATASET_CAP = 50_000

_CHUNK_SIZE = 1000
_DATASET_META_SCHEMA_CHECKED = False


def _get_dataset_lock(dataset_id: str) -> threading.Lock:
    """Return (creating if absent) the per-dataset loading lock."""
    with _DATASET_LOADING_LOCK:
        if dataset_id not in _DATASET_LOADING:
            _DATASET_LOADING[dataset_id] = threading.Lock()
        return _DATASET_LOADING[dataset_id]


def dataset_cache_stats() -> dict:
    """Stub kept for API compatibility — in-process cache removed (Phase 5)."""
    return {
        "cached_datasets": 0,
        "max_cached": 0,
        "ttl_seconds": 0,
        "oldest_access": None,
        "newest_access": None,
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

    _MAX_VALIDATE_BYTES = 200 * 1024 * 1024  # 200 MB hard cap
    file_bytes = await file.read(_MAX_VALIDATE_BYTES + 1)
    if len(file_bytes) > _MAX_VALIDATE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File too large to validate (max 200 MB). Convert to Parquet for large files.",
        )
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
    project_id: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    project_id_header: str | None = Header(default=None, alias="X-Project-Id"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
) -> DatasetPreview:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization)
    _ensure_dataset_meta_schema(db)
    # Usage limit check — billing goes to workspace owner for collab workspaces
    user_plan = resolve_user_plan(db, authorization)
    billing_user_id, billing_plan = resolve_workspace_plan(workspace_id or "default", user_id or "", db)
    enforce_usage_limit(billing_user_id, billing_plan, "datasets_uploaded", db)
    # Hard cap before pandas ever touches the bytes — prevents OOM on 512 MB instances.
    # The per-plan size check below still fires for smaller plan limits.
    _UPLOAD_HARD_CAP = 500 * 1024 * 1024  # 500 MB absolute ceiling
    content = await file.read(_UPLOAD_HARD_CAP + 1)
    if len(content) > _UPLOAD_HARD_CAP:
        raise HTTPException(
            status_code=413,
            detail={
                "error": "file_too_large",
                "message": (
                    "File exceeds the 500 MB hard limit. "
                    "Convert large datasets to Parquet format for 5\u201310\u00d7 smaller files: "
                    "df.to_parquet('file.parquet')"
                ),
                "plan": user_plan,
            },
        )
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
    initial_tier = storage_tier_service.assign_initial_tier(
        file_size_bytes=len(content),
        row_count=int(df.shape[0]),
    )
    # ── Best-effort: convert CSV to Parquet and persist to object storage ─────
    # This makes the dataset first-class: DuckDB can stream pages directly from
    # S3 without loading the full file, and preview_dataset takes the fast path.
    _parquet_s3_path: str | None = None
    _compressed_size: int | None = None
    try:
        import io as _io
        _parquet_buf = _io.BytesIO()
        df.to_parquet(_parquet_buf, index=False, engine="pyarrow")
        _parquet_bytes = _parquet_buf.getvalue()
        _compressed_size = len(_parquet_bytes)
        _parquet_s3_path = StorageService.upload(
            user_id=user_id or "anonymous",
            dataset_id=dataset_id,
            buffer=_parquet_bytes,
            file_name=f"{dataset_id}.parquet",
        )
        del _parquet_bytes  # free early
    except Exception:
        pass  # Degraded to DB-chunk fallback — preview still works via get_dataset_from_db
    # ─────────────────────────────────────────────────────────────────────────
    from ..services.persistence_policy import materialize_dataset
    materialize_dataset(
        db,
        triggered_by="user_upload",
        id=dataset_id,
        user_id=user_id,
        workspace_id=workspace_id or "default",
        name=resolved_name,
        columns=list(df.columns),
        row_count=int(df.shape[0]),
        access_tier=initial_tier,
        storage_path=_parquet_s3_path,
        parent_id=None,
        project_id=(project_id or project_id_header or None),
        file_size_bytes=len(content),
        compressed_size_bytes=_compressed_size,
    )
    # Only persist DB chunks as fallback when Parquet upload failed.
    # When storage_path is set, DuckDB reads directly from S3 — chunks are redundant.
    rows = df.to_dict(orient="records")
    if not _parquet_s3_path:
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
    # Track monthly dataset upload usage + refresh storage byte count
    increment_usage(billing_user_id, "datasets_uploaded", db)
    update_storage_bytes(billing_user_id, db)
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
    from ..services.persistence_policy import materialize_dataset
    materialize_dataset(db, triggered_by="user_upload", **meta_kwargs)

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
    """Legacy shim — callers should migrate to get_dataset_from_db."""
    raise KeyError("Dataset not found — use get_dataset_from_db")


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
        return pd.DataFrame(rows)

    data = db.query(DatasetDataDB).filter(DatasetDataDB.id == dataset_id).first()
    if data:
        return pd.DataFrame(data.rows)

    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta or not meta.storage_path:
        raise KeyError("Dataset not found")

    # Serialise concurrent loads for the same S3-backed dataset so only
    # one thread calls DuckDB at a time — prevents stampede OOM.
    ds_lock = _get_dataset_lock(dataset_id)
    with ds_lock:
        rows, _ = DuckDBService.preview_page(
            meta.storage_path,
            offset=0,
            limit=_STORAGE_DATASET_CAP,
            skip_count=True,
        )
        return pd.DataFrame(rows)


@router.get("", response_model=list[DatasetMeta])
def list_datasets(
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    project_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[DatasetMeta]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization)
    query = db.query(DatasetMetaDB).filter(DatasetMetaDB.user_id == user_id)
    # Hide soft-deleted (trashed) datasets from the main list. Use /datasets/trash
    # to see trashed items and POST /datasets/{id}/restore to recover them.
    query = query.filter(DatasetMetaDB.deleted_at.is_(None))
    if workspace_id:
        # Include exact matches, legacy NULL workspace_id rows, AND legacy
        # "default"-tagged rows so datasets uploaded before workspaces existed
        # are always visible regardless of which personal workspace is active.
        query = query.filter(
            (DatasetMetaDB.workspace_id == workspace_id)
            | (DatasetMetaDB.workspace_id == "default")
            | DatasetMetaDB.workspace_id.is_(None)
        )
    # Project scoping (migration 0057): when the caller asks for a specific
    # project, return ONLY datasets bound to that project. We deliberately do
    # NOT include legacy NULL-project rows here — if we did, deleting a
    # project and recreating one with the same name (or any new project) would
    # surface every workspace-level dataset the user ever uploaded, which is
    # exactly the "ghost dataset" bug users have reported. Workspace-level
    # datasets (project_id IS NULL) are visible only when no project_id
    # filter is sent (the workspace-wide "All datasets" view).
    if project_id:
        query = query.filter(DatasetMetaDB.project_id == project_id)
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


# ── Pipeline Steps persistence endpoints ─────────────────────────────────────

@router.get("/{dataset_id}/pipeline-steps")
def get_pipeline_steps(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return the pipeline steps for a dataset.

    Architecture (post-2026-04 simplification):
    -------------------------------------------
    ``pipeline_steps`` (DB rows) is the authoritative source.  Each row is
    committed immediately by ``pipeline_recorder`` after a successful agent
    step — no debounce, no format drift, no in-memory state to lose on a
    server restart.

    ``dataset_meta.pipeline_steps_json`` is a legacy column kept ONLY for
    backward compatibility with datasets created before this refactor that
    have JSON written but no ``pipeline_steps`` rows.  New writes do not
    touch this column.
    """
    role = get_current_role(authorization)
    require_role("viewer", role)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # ── PRIMARY: read from pipeline_steps rows ──────────────────────────
    from ..models_db import PipelineStepDB as _PSdb, DatasetSessionDB as _DSess
    user_id = get_current_user_id(authorization) or "anonymous"
    ds_session = (
        db.query(_DSess)
        .filter(_DSess.dataset_id == dataset_id, _DSess.user_id == user_id)
        .first()
    )
    sess_id = ds_session.chat_session_id if ds_session else None

    db_rows: list = []
    if sess_id:
        db_rows = (
            db.query(_PSdb)
            .filter(
                _PSdb.user_id == user_id,
                _PSdb.session_id == sess_id,
                _PSdb.status == "completed",
                _PSdb.output_table.isnot(None),
            )
            .order_by(_PSdb.step_number)
            .limit(100)
            .all()
        )

    if db_rows:
        import uuid as _uuid_mod
        steps = [
            {
                "id": str(_uuid_mod.uuid4()),
                "stepNumber": ps.step_number,
                "operation": ps.operation,
                "intent": ps.intent or ps.operation,
                "description": ps.description,
                "sql": ps.duckdb_sql,
                "affectedRows": str(ps.row_count_after or ""),
                "appliedAt": ps.created_at.isoformat() if ps.created_at else None,
                "output_table": ps.output_table,
                "input_tables": ps.input_tables or [],
                "row_count_before": ps.row_count_before,
                "row_count_after": ps.row_count_after,
                "execution_time_ms": ps.execution_time_ms,
                "snapshot_path": ps.snapshot_path,
            }
            for ps in db_rows
        ]
        return {"dataset_id": dataset_id, "steps": steps}

    # ── LEGACY FALLBACK: pipeline_steps_json on dataset_meta ────────────
    # Only for datasets created before pipeline_steps rows became the source
    # of truth.  No new writes happen to this column — once these legacy
    # datasets get a fresh agent run, pipeline_steps rows take over.
    try:
        result = db.execute(
            text("SELECT pipeline_steps_json FROM dataset_meta WHERE id = :id"),
            {"id": dataset_id},
        ).fetchone()
        raw = result[0] if result else None
        legacy_steps = json.loads(raw) if raw else []
        if isinstance(legacy_steps, list) and legacy_steps:
            # Tolerate both camelCase (recent) and snake_case (older) shapes.
            import uuid as _uuid_mod
            normalized = []
            for s in legacy_steps:
                if not isinstance(s, dict):
                    continue
                normalized.append({
                    "id": s.get("id") or str(_uuid_mod.uuid4()),
                    "stepNumber": s.get("stepNumber") or s.get("step_number") or 0,
                    "operation": s.get("operation", "transform"),
                    "intent": s.get("intent") or s.get("operation", "transform"),
                    "description": s.get("description", ""),
                    "sql": s.get("sql"),
                    "affectedRows": str(s.get("affectedRows") or s.get("rows_affected") or ""),
                    "appliedAt": s.get("appliedAt") or s.get("timestamp"),
                    "output_table": s.get("output_table"),
                    "input_tables": s.get("input_tables") or [],
                    "row_count_before": s.get("row_count_before"),
                    "row_count_after": s.get("row_count_after"),
                    "execution_time_ms": s.get("execution_time_ms"),
                })
            return {"dataset_id": dataset_id, "steps": normalized}
    except Exception:
        pass

    return {"dataset_id": dataset_id, "steps": []}


@router.put("/{dataset_id}/pipeline-steps")
def save_pipeline_steps(
    dataset_id: str,
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Persist client-side cosmetic edits to the steps list.

    DEPRECATED for source-of-truth: ``pipeline_steps`` rows are authoritative
    (written by the agent recorder).  This endpoint persists the JSON payload
    only as a side cache for client-side mutations the recorder doesn't see
    (rename, reorder, remove).  After the next agent run, ``pipeline_steps``
    rows take precedence in ``GET`` and the JSON is ignored.

    Plan: replace this with a proper diff endpoint (DELETE/REORDER on
    ``pipeline_steps`` rows) once we add ``client_step_id`` to that table.
    """
    role = get_current_role(authorization)
    require_role("editor", role)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    steps = payload.get("steps", [])
    if not isinstance(steps, list):
        raise HTTPException(status_code=422, detail="steps must be a list")
    # Safety cap: don't persist more than 100 steps per dataset
    steps = steps[:100]
    try:
        db.execute(
            text(
                "UPDATE dataset_meta SET pipeline_steps_json = :v WHERE id = :id"
            ),
            {"v": json.dumps(steps), "id": dataset_id},
        )
        db.commit()
    except Exception:
        db.rollback()
        return {"dataset_id": dataset_id, "saved": 0}
    return {"dataset_id": dataset_id, "saved": len(steps)}


# ── Step Preview / Materialize (Power Query pattern) ──────────────────────────

@router.post("/{dataset_id}/step-preview")
def step_preview(
    dataset_id: str,
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Preview a pipeline step's output using lazy evaluation (sampled rows).

    Power Query pattern: LIMIT pushes through the entire view chain, so
    DuckDB only scans the minimum rows needed from the base Parquet file.

    Body: { "session_id": str, "table_name": str, "limit": int?, "offset": int? }
    """
    role = get_current_role(authorization)
    require_role("viewer", role)
    session_id = payload.get("session_id", "")
    table_name = payload.get("table_name", "")
    limit = min(int(payload.get("limit", 200)), 1000)  # cap at 1000
    offset = max(int(payload.get("offset", 0)), 0)
    # Optional: client-known pipeline_steps with sql + output_table.  Used to
    # replay views without depending on the previous request's PipelineStepDB
    # commit having landed yet (race-immune restore after refresh).
    raw_client_steps = payload.get("pipeline_steps") or []
    client_steps = [s for s in raw_client_steps if isinstance(s, dict)] or None
    if not session_id or not table_name:
        raise HTTPException(status_code=422, detail="session_id and table_name required")
    try:
        from ..services.duckdb_session import table_exists
        # Replay views from PipelineStepDB if the session was evicted
        # (server restart, TTL, memory pressure).  Idempotent.
        if not table_exists(session_id, table_name):
            import logging as _sp_log
            _sp_log.getLogger(__name__).info(
                "step-preview: view %s missing — replaying from DB", table_name,
            )
            from ..models_db import DatasetMetaDB as _DSMeta
            _ds = db.query(_DSMeta).filter(_DSMeta.id == dataset_id).first()
            if _ds:
                from ..services.ai_agent_service import AIAgentService
                AIAgentService._replay_session_views(
                    session_id, _ds, client_steps=client_steps,
                )
            else:
                raise HTTPException(
                    status_code=404,
                    detail="Dataset not found — cannot replay session views.",
                )
        from ..services.step_engine import StepEngine
        engine = StepEngine(session_id, {})
        rows = engine.preview(table_name, limit=limit, offset=offset)
        columns = list(rows[0].keys()) if rows else []
        return {"rows": rows, "columns": columns, "count": len(rows)}
    except HTTPException:
        raise  # pass through 404 already raised above
    except Exception as exc:
        # If the preview failed because the view couldn't be restored after
        # session eviction, give the frontend a clear 422 instead of a
        # cryptic "table not found" 500.
        detail = str(exc)
        if "not found" in detail.lower() or "does not exist" in detail.lower():
            raise HTTPException(
                status_code=422,
                detail=(
                    f"View '{table_name}' could not be restored.  The DuckDB "
                    f"session was evicted (server restart or timeout).  "
                    f"Re-run the pipeline to recreate this view."
                ),
            )
        raise HTTPException(status_code=500, detail=detail)


@router.post("/{dataset_id}/step-materialize")
def step_materialize(
    dataset_id: str,
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Materialize a lazy view into a TABLE (Power Query 'Full Refresh').

    This converts the zero-RAM view chain into a concrete in-memory table.
    Use sparingly — this is the expensive operation (equivalent to PQ Refresh).

    Body: { "session_id": str, "table_name": str, "snapshot": bool? }
    """
    role = get_current_role(authorization)
    require_role("editor", role)
    session_id = payload.get("session_id", "")
    table_name = payload.get("table_name", "")
    snapshot = bool(payload.get("snapshot", False))
    if not session_id or not table_name:
        raise HTTPException(status_code=422, detail="session_id and table_name required")
    try:
        from ..services.step_engine import StepEngine
        engine = StepEngine(session_id, {})
        row_count = engine.materialize(table_name)
        snapshot_url = None
        if snapshot:
            user_id = get_current_user_id(authorization)
            snapshot_url = engine.snapshot_to_parquet(table_name, dataset_id, user_id)
        return {"table_name": table_name, "row_count": row_count, "materialized": True, "snapshot_url": snapshot_url}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Version History endpoints ─────────────────────────────────────────────────

@router.get("/{dataset_id}/versions")
def list_dataset_versions(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return the full version chain for a dataset (walk lineage edges)."""
    role = get_current_role(authorization)
    require_role("viewer", role)

    from ..services.persistence_policy import lineage_parents, lineage_children

    # Walk backwards through parent chain (via edges) to find the root.
    chain: list[DatasetMetaDB] = []
    current_id: str | None = dataset_id
    visited: set[str] = set()
    while current_id and current_id not in visited:
        visited.add(current_id)
        row = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == current_id).first()
        if not row:
            break
        chain.append(row)
        parents = lineage_parents(db, current_id)
        current_id = parents[0] if parents else None

    # Walk forward from the root to collect all descendants of the root
    if chain:
        root = chain[-1]
        # Collect descendants using BFS over the edges table.
        to_visit = [root.id]
        expanded_ids: list[str] = []
        visited_forward: set[str] = set()
        while to_visit:
            cur = to_visit.pop(0)
            if cur in visited_forward:
                continue
            visited_forward.add(cur)
            for child_id in lineage_children(db, cur):
                if child_id not in visited_forward:
                    expanded_ids.append(child_id)
                    to_visit.append(child_id)
        expanded: list[DatasetMetaDB] = []
        if expanded_ids:
            expanded = (
                db.query(DatasetMetaDB)
                .filter(DatasetMetaDB.id.in_(expanded_ids))
                .all()
            )
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
    _MAX_VERSION_BYTES = 200 * 1024 * 1024  # 200 MB hard cap
    file_bytes = await file.read(_MAX_VERSION_BYTES + 1)
    if len(file_bytes) > _MAX_VERSION_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File too large (max 200 MB). Convert to Parquet for large files.",
        )
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

    from ..services.persistence_policy import materialize_dataset
    materialize_dataset(
        db,
        triggered_by="user_upload",
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
    rows = df.to_dict(orient="records")
    if rows:
        db.add(DatasetDataDB(id=new_id, rows=rows))
    db.commit()
    increment_usage(user_id, "datasets_uploaded", db)
    update_storage_bytes(user_id, db)

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
    from ..services.persistence_policy import lineage_parents
    lineage: list[DatasetMeta] = []
    current_id = dataset_id
    visited = set()
    while current_id and current_id not in visited:
        visited.add(current_id)
        row = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == current_id).first()
        if not row:
            break
        parents = lineage_parents(db, current_id)
        next_parent = parents[0] if parents else None
        lineage.append(
            DatasetMeta(
                dataset_id=row.id,
                name=row.name,
                file_format=row.file_format,
                columns=row.columns,
                row_count=row.row_count,
                parent_id=next_parent,
            )
        )
        current_id = next_parent
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

    from ..services.persistence_policy import lineage_parents

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

        for pid in lineage_parents(db, current_id):
            edges.append(
                DatasetLineageEdge(
                    from_dataset_id=pid,
                    to_dataset_id=row.id,
                    relationship="transformed_from",
                )
            )
        # Continue walking up the first parent chain (legacy behaviour:
        # graph traversal is single-parent today; multi-parent edges are
        # still emitted above but the walker doesn't fork).
        parents = lineage_parents(db, current_id)
        current_id = parents[0] if parents else None

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
def delete_dataset(
    dataset_id: str,
    hard: bool = False,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Delete a dataset.

    Default behaviour is a **soft delete** (move to Trash): the row is kept and
    its ``deleted_at`` is set to ``now``. The dataset disappears from the main
    list but can be restored via ``POST /datasets/{id}/restore`` for 30 days.
    A nightly retention sweep purges items whose ``deleted_at`` exceeds the
    retention window.

    Pass ``?hard=true`` to bypass Trash and permanently delete immediately
    (legacy destructive behaviour, used by tests and explicit "purge" actions).
    """
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()

    if not hard:
        # ── Soft delete: mark deleted_at on this dataset and any descendants
        # so the user's mental model of "delete" still hides children, but
        # nothing is destroyed and storage is preserved during the retention
        # window. Restore happens per-row via /restore.
        if not meta:
            raise HTTPException(status_code=404, detail="Dataset not found")
        if meta.deleted_at is not None:
            return {"status": "already_trashed", "dataset_id": dataset_id}
        from datetime import datetime as _dt, timezone as _tz
        now = _dt.now(_tz.utc)
        meta.deleted_at = now
        # Cascade soft-delete to direct children (one level — sufficient for
        # the typical parent/derived pair; deeper chains can be trashed
        # individually and restored individually).
        from ..services.persistence_policy import lineage_children
        child_ids = lineage_children(db, dataset_id)
        child_metas = (
            db.query(DatasetMetaDB)
            .filter(
                DatasetMetaDB.id.in_(child_ids),
                DatasetMetaDB.deleted_at.is_(None),
            )
            .all()
            if child_ids
            else []
        )
        for child in child_metas:
            child.deleted_at = now
        try:
            from ..services.event_log import emit_event as _emit_log_event
            _emit_log_event(
                db,
                event_type="dataset_soft_deleted",
                user_id=user_id,
                workspace_id=getattr(meta, "workspace_id", None),
                payload={
                    "dataset_id": dataset_id,
                    "name": getattr(meta, "name", None),
                    "child_count": len(child_metas),
                    "retention_days": 30,
                },
            )
        except Exception:
            pass
        db.commit()
        invalidate_profile_cache(dataset_id)
        emit_event("dataset.trashed", {"dataset_id": dataset_id})
        try:
            audit_store.add(AuditEntry(
                action="dataset.trash",
                actor=user_id or "anonymous",
                target=f"dataset:{dataset_id}",
                metadata={"child_count": len(child_metas)},
            ))
        except Exception:
            pass
        return {
            "status": "trashed",
            "dataset_id": dataset_id,
            "child_count": len(child_metas),
            "deleted_at": now.isoformat(),
        }

    # ── Hard delete (?hard=true): original destructive behaviour ──────────
    # Collect every storage path we need to delete BEFORE touching the DB so
    # the queue insert (on failure) and the row delete commit together.
    storage_paths_to_delete: list[tuple[str, str]] = []  # (path, source)
    if meta and meta.storage_path:
        storage_paths_to_delete.append((meta.storage_path, "dataset"))
        # Linked ArtifactDB rows that point at the same s3_key.
        db.query(ArtifactDB).filter(
            ArtifactDB.s3_key == meta.storage_path
        ).delete(synchronize_session=False)

    # Cascade: delete child derived datasets (lineage edges → child)
    from ..services.persistence_policy import lineage_children
    child_ids_from_edges = lineage_children(db, dataset_id)
    child_metas = (
        db.query(DatasetMetaDB).filter(DatasetMetaDB.id.in_(child_ids_from_edges)).all()
        if child_ids_from_edges
        else []
    )
    if child_metas:
        child_ids = [c.id for c in child_metas]
        for child in child_metas:
            if child.storage_path:
                storage_paths_to_delete.append((child.storage_path, "child"))
                db.query(ArtifactDB).filter(
                    ArtifactDB.s3_key == child.storage_path
                ).delete(synchronize_session=False)
        db.query(DatasetDataDB).filter(DatasetDataDB.id.in_(child_ids)).delete(synchronize_session=False)
        db.query(DatasetChunkDB).filter(DatasetChunkDB.dataset_id.in_(child_ids)).delete(synchronize_session=False)
        db.query(DatasetMetaDB).filter(DatasetMetaDB.id.in_(child_ids)).delete(synchronize_session=False)

    # Delete the parent dataset records.
    db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).delete()
    db.query(DatasetDataDB).filter(DatasetDataDB.id == dataset_id).delete()
    db.query(DatasetChunkDB).filter(DatasetChunkDB.dataset_id == dataset_id).delete()

    # Clean up lineage edges that reference any of the deleted datasets so we
    # don't leave dangling edge rows behind.
    from ..models_db import DatasetLineageEdgeDB
    all_deleted_ids = [dataset_id] + [c.id for c in child_metas]
    db.query(DatasetLineageEdgeDB).filter(
        (DatasetLineageEdgeDB.child_id.in_(all_deleted_ids))
        | (DatasetLineageEdgeDB.parent_id.in_(all_deleted_ids))
    ).delete(synchronize_session=False)

    # Now attempt the storage deletes.  Any failure is enqueued in the same
    # transaction so the commit either persists both the row delete AND the
    # retry queue entry, or rolls both back together -- no orphans.
    from ..services.storage_cleanup import safe_storage_delete
    for path, source in storage_paths_to_delete:
        safe_storage_delete(path, source=source, db=db)

    # Persistent audit row in pipeline_events (joins the same transaction).
    try:
        from ..services.event_log import emit_event as _emit_log_event
        _emit_log_event(
            db,
            event_type="dataset_deleted",
            user_id=user_id,
            workspace_id=getattr(meta, "workspace_id", None) if meta else None,
            payload={
                "dataset_id": dataset_id,
                "name": getattr(meta, "name", None) if meta else None,
                "child_count": len(child_metas),
                "storage_paths": [p for p, _ in storage_paths_to_delete],
            },
        )
    except Exception:
        pass

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


@router.get("/trash", response_model=list[DatasetMeta])
def list_trashed_datasets(
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> list[DatasetMeta]:
    """List soft-deleted (trashed) datasets for the current user/workspace."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization)
    query = db.query(DatasetMetaDB).filter(
        DatasetMetaDB.user_id == user_id,
        DatasetMetaDB.deleted_at.isnot(None),
    )
    if workspace_id:
        query = query.filter(
            (DatasetMetaDB.workspace_id == workspace_id)
            | (DatasetMetaDB.workspace_id == "default")
            | DatasetMetaDB.workspace_id.is_(None)
        )
    rows = query.all()
    out: list[DatasetMeta] = []
    for row in rows:
        dataset_id = str(row.id or "").strip()
        if not dataset_id:
            continue
        raw_columns = row.columns if isinstance(row.columns, (list, tuple)) else []
        columns = [str(c) for c in raw_columns if c is not None]
        try:
            row_count = int(row.row_count or 0)
        except (TypeError, ValueError):
            row_count = 0
        out.append(
            DatasetMeta(
                dataset_id=dataset_id,
                name=str(row.name) if row.name is not None else None,
                file_format=str(row.file_format) if row.file_format is not None else None,
                columns=columns,
                row_count=row_count,
                parent_id=str(row.parent_id) if row.parent_id is not None else None,
            )
        )
    return out


@router.post("/{dataset_id}/restore")
def restore_dataset(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Restore a soft-deleted dataset back to the active list."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization)
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if meta.deleted_at is None:
        return {"status": "not_trashed", "dataset_id": dataset_id}
    meta.deleted_at = None
    try:
        from ..services.event_log import emit_event as _emit_log_event
        _emit_log_event(
            db,
            event_type="dataset_restored",
            user_id=user_id,
            workspace_id=getattr(meta, "workspace_id", None),
            payload={
                "dataset_id": dataset_id,
                "name": getattr(meta, "name", None),
            },
        )
    except Exception:
        pass
    db.commit()
    invalidate_profile_cache(dataset_id)
    emit_event("dataset.restored", {"dataset_id": dataset_id})
    try:
        audit_store.add(AuditEntry(
            action="dataset.restore",
            actor=user_id or "anonymous",
            target=f"dataset:{dataset_id}",
            metadata={},
        ))
    except Exception:
        pass
    return {"status": "restored", "dataset_id": dataset_id}


# ── Server-side live workspace state (arch #2) ────────────────────────────
# Replaces browser-localStorage-only state for the AI chat session binding
# and the "live artifact" preview pointer so refresh / multi-tab / multi-device
# all see the same in-progress workspace.

def _serialize_session(row: DatasetSessionDB | None) -> dict:
    if row is None:
        return {
            "chat_session_id": None,
            "live_table_name": None,
            "live_row_count": None,
            "live_step_label": None,
            "live_rows_changed": None,
            "updated_at": None,
        }
    return {
        "chat_session_id": row.chat_session_id,
        "live_table_name": row.live_table_name,
        "live_row_count": row.live_row_count,
        "live_step_label": row.live_step_label,
        "live_rows_changed": row.live_rows_changed,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/{dataset_id}/session")
def get_dataset_session(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return the live workspace state for the current user on this dataset.

    If the stored ``live_table_name`` references a DuckDB session that no
    longer exists (server restart, TTL eviction), the stale session fields
    are cleared so the frontend doesn't render a ghost artifact card.
    """
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization) or "anonymous"
    row = (
        db.query(DatasetSessionDB)
        .filter(
            DatasetSessionDB.user_id == user_id,
            DatasetSessionDB.dataset_id == dataset_id,
        )
        .first()
    )
    # ── Validate liveness: if the DuckDB session was evicted the row is stale.
    # Clear the transient session fields so the frontend sees a clean slate
    # instead of a ghost "clean · LIVE" artifact that can't be queried.
    if row and row.live_table_name and row.chat_session_id:
        try:
            from ..services.duckdb_session import session_is_alive
            alive = session_is_alive(row.chat_session_id)
            # Only clear when we are *certain* the session is dead (False).
            # If alive is None (DuckDB not available / test env), leave the
            # row untouched — the frontend will discover the failure on
            # step-preview and show a user-friendly error.
            if alive is False:
                import logging as _ds_log
                _ds_log.getLogger(__name__).info(
                    "dataset-session: clearing stale session for dataset %s "
                    "(DuckDB session %s / table %s no longer exists)",
                    dataset_id[:8], row.chat_session_id[:8], row.live_table_name,
                )
                row.live_table_name = None
                row.live_row_count = None
                row.live_step_label = None
                row.live_rows_changed = None
                try:
                    db.commit()
                except Exception:
                    db.rollback()
        except Exception:
            # If the check itself fails (import error, connection issue),
            # don't block the response — the frontend will handle a failed
            # step-preview gracefully.
            pass
    return {"dataset_id": dataset_id, **_serialize_session(row)}


@router.put("/{dataset_id}/session")
def upsert_dataset_session(
    dataset_id: str,
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Upsert the live workspace state for the current user on this dataset.

    Accepted keys (all optional, ``null`` clears the field):
    ``chat_session_id``, ``live_table_name``, ``live_row_count``,
    ``live_step_label``, ``live_rows_changed``.

    Only the keys present in ``payload`` are updated -- omitted keys are
    left untouched. Pass ``{"key": null}`` to explicitly clear a field.
    """
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_user_id(authorization) or "anonymous"

    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="payload must be an object")

    row = (
        db.query(DatasetSessionDB)
        .filter(
            DatasetSessionDB.user_id == user_id,
            DatasetSessionDB.dataset_id == dataset_id,
        )
        .first()
    )
    created = False
    if row is None:
        row = DatasetSessionDB(
            id=str(uuid.uuid4()),
            user_id=user_id,
            dataset_id=dataset_id,
        )
        db.add(row)
        created = True

    # Only mutate keys explicitly present so callers can patch one field.
    for field in (
        "chat_session_id",
        "live_table_name",
        "live_step_label",
    ):
        if field in payload:
            value = payload[field]
            setattr(row, field, str(value) if value is not None else None)
    for field in ("live_row_count", "live_rows_changed"):
        if field in payload:
            value = payload[field]
            if value is None:
                setattr(row, field, None)
            else:
                try:
                    setattr(row, field, int(value))
                except (TypeError, ValueError):
                    raise HTTPException(
                        status_code=422,
                        detail=f"{field} must be an integer or null",
                    )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save session state")
    db.refresh(row)
    return {
        "dataset_id": dataset_id,
        "created": created,
        **_serialize_session(row),
    }


@router.delete("/{dataset_id}/session")
def clear_dataset_session(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Clear the live workspace state for the current user on this dataset."""
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_user_id(authorization) or "anonymous"
    deleted = (
        db.query(DatasetSessionDB)
        .filter(
            DatasetSessionDB.user_id == user_id,
            DatasetSessionDB.dataset_id == dataset_id,
        )
        .delete()
    )
    db.commit()
    return {"dataset_id": dataset_id, "deleted": int(deleted)}


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
        import csv as _csv
        import io as _sio
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

            buf = _sio.StringIO()
            writer = _csv.writer(buf, lineterminator='\n')
            writer.writerow(col_names)
            yield buf.getvalue()

            for batch in result.fetch_arrow_reader(1000):
                buf = _sio.StringIO()
                writer = _csv.writer(buf, lineterminator='\n')
                for row in batch.to_pylist():
                    writer.writerow(row.get(c, "") or "" for c in col_names)
                yield buf.getvalue()
        else:
            # Legacy fallback: stream from DatasetChunkDB chunks (no bulk load)
            col_names_raw = meta.columns or []
            # meta.columns may be list[str] or list[dict]
            if col_names_raw and isinstance(col_names_raw[0], dict):
                col_names = [c.get("name", "") for c in col_names_raw]
            else:
                col_names = list(col_names_raw)

            buf = _sio.StringIO()
            writer = _csv.writer(buf, lineterminator='\n')
            writer.writerow(col_names)
            yield buf.getvalue()

            chunks = (
                db.query(DatasetChunkDB)
                .filter(DatasetChunkDB.dataset_id == dataset_id)
                .order_by(DatasetChunkDB.chunk_index.asc())
                .all()
            )
            for chunk in chunks:
                buf = _sio.StringIO()
                writer = _csv.writer(buf, lineterminator='\n')
                for row in (chunk.rows or []):
                    writer.writerow(str(row.get(c, "") or "") for c in col_names)
                yield buf.getvalue()

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


# ── Phase 3: presigned URL — lets DuckDB-WASM load Parquet directly from S3 ──
@limiter.limit("60/minute")
@router.get("/{dataset_id}/presigned-url")
def get_presigned_url(
    request: Request,
    dataset_id: str,
    expires_in: int = 900,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """
    Return a short-lived presigned URL for the dataset's Parquet file.
    The browser DuckDB-WASM runtime can fetch this directly, offloading
    all query computation to the client and zeroing server RAM usage for
    read queries.

    Only datasets with a storage_path (S3-backed Parquet) are supported.
    """
    role = get_current_role(authorization)
    require_role("viewer", role)
    if expires_in > 3600:
        expires_in = 3600
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if not meta.storage_path or str(meta.storage_path).startswith("local://"):
        raise HTTPException(
            status_code=404,
            detail="This dataset does not have an S3-backed Parquet file available.",
        )
    try:
        url = StorageService.get_signed_url(meta.storage_path, expires_in=expires_in)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not generate presigned URL: {exc}")

    import datetime
    expires_at = (
        datetime.datetime.now(datetime.timezone.utc)
        + datetime.timedelta(seconds=expires_in)
    ).isoformat()
    return {
        "url": url,
        "expires_in": expires_in,
        "expires_at": expires_at,
        "dataset_id": dataset_id,
        "row_count": meta.row_count,
        "columns": meta.columns or [],
    }


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
            # skip_count=True when no filter: caller uses meta.row_count instead,
            # avoiding a redundant full-file COUNT scan that spikes DuckDB memory.
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
                skip_count=not bool(filter_col),
            )
            # Use stored row_count when no filter (skip_count=True returns 0)
            if not filter_col:
                total = meta.row_count or total
            # If DuckDB returned zero rows but the dataset metadata says it has
            # data, try the DB-chunk fallback before returning an empty response.
            # This covers CSV uploads where the Parquet conversion produced an
            # empty file while the raw rows were persisted to DatasetChunkDB.
            if not page_rows and (meta.row_count or 0) > 0:
                try:
                    df_fallback = get_dataset_from_db(dataset_id, db)
                    if not df_fallback.empty:
                        rows_fb = df_fallback.to_dict(orient="records")
                        sliced = rows_fb[offset: offset + limit]
                        return DatasetPage(
                            dataset_id=dataset_id,
                            columns=list(df_fallback.columns),
                            offset=offset,
                            limit=limit,
                            rows=sliced,
                            total_rows=len(rows_fb),
                        )
                except Exception:
                    pass
            return DatasetPage(
                dataset_id=dataset_id,
                columns=list(meta.columns or []),
                offset=offset,
                limit=limit,
                rows=page_rows,
                total_rows=total,
            )
        except Exception as exc:
            logger.warning(
                "DuckDB preview_page failed for %s: %s",
                dataset_id, exc,
            )
            # For storage-path datasets do NOT fall back to pd.read_parquet — that
            # loads the entire file into Python RAM with no memory cap, which is
            # worse than the DuckDB failure and will OOM-kill the process.
            raise HTTPException(
                status_code=503,
                detail="Preview temporarily unavailable. Please try again shortly.",
            ) from exc

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
