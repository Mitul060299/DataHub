from fastapi import APIRouter, UploadFile, File, HTTPException, Header, Depends
from fastapi.responses import StreamingResponse
from typing import Dict
import time
from io import StringIO
import pandas as pd
import uuid
import difflib
from sqlalchemy.orm import Session
from ..models import (
    DatasetPreview,
    DatasetMeta,
    DatasetPage,
    DatasetQueryRequest,
    DatasetQueryResponse,
    StorageTierPolicyOut,
    StorageTierPolicyUpdate,
)
from ..services.events import emit_event
from ..security import get_current_role, require_role
from ..db import get_db
from ..config import settings
from ..services.cache import invalidate_profile_cache
from ..services.duckdb_service import DuckDBService
from ..services.query_cache import QueryCacheService
from ..services.object_storage import StorageService
from ..services.storage_tiering import storage_tier_service
from ..models_db import DatasetMetaDB, DatasetDataDB, DatasetChunkDB

router = APIRouter(prefix="/datasets", tags=["datasets"])

_DATASETS: Dict[str, pd.DataFrame] = {}
_DATASET_LAST_ACCESS: Dict[str, float] = {}

_CHUNK_SIZE = 1000
_MAX_CACHE = settings.dataset_cache_max
_CACHE_TTL = settings.dataset_cache_ttl_seconds


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


@router.post("/upload", response_model=DatasetPreview)
async def upload_dataset(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> DatasetPreview:
    role = get_current_role(authorization)
    require_role("viewer", role)
    content = await file.read()
    df = pd.read_csv(pd.io.common.BytesIO(content))
    df = df.astype(object).where(pd.notnull(df), None)
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
            workspace_id=workspace_id or "default",
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
    preview = DatasetPreview(
        dataset_id=dataset_id,
        columns=list(df.columns),
        row_count=int(df.shape[0]),
        sample_rows=df.head(10).to_dict(orient="records"),
        parent_id=None,
    )
    emit_event("dataset.uploaded", preview.model_dump())
    return preview


def save_dataset(
    df: pd.DataFrame,
    db: Session,
    parent_id: str | None = None,
    workspace_id: str | None = None,
    store_rows: bool = True,
    meta_extra: dict | None = None,
) -> str:
    dataset_id = str(uuid.uuid4())
    df = df.astype(object).where(pd.notnull(df), None)
    if store_rows and int(df.shape[0]) <= 5000:
        _DATASETS[dataset_id] = df
        _touch_cache(dataset_id)
        _evict_cache()
    meta_kwargs = {
        "id": dataset_id,
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
    if not data:
        raise KeyError("Dataset not found")
    df = pd.DataFrame(data.rows)
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
        query = query.filter(DatasetMetaDB.workspace_id == workspace_id)
    rows = query.all()
    return [
        DatasetMeta(
            dataset_id=row.id,
            columns=row.columns,
            row_count=row.row_count,
            parent_id=row.parent_id,
        )
        for row in rows
    ]


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
                columns=row.columns,
                row_count=row.row_count,
                parent_id=row.parent_id,
            )
        )
        current_id = row.parent_id
    return lineage


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
    require_role("editor", role)
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

    chunk_size = _CHUNK_SIZE
    start_chunk = offset // chunk_size
    end_chunk = (offset + limit - 1) // chunk_size

    chunks = (
        db.query(DatasetChunkDB)
        .filter(DatasetChunkDB.dataset_id == dataset_id)
        .filter(DatasetChunkDB.chunk_index >= start_chunk)
        .filter(DatasetChunkDB.chunk_index <= end_chunk)
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

    local_offset = offset - (start_chunk * chunk_size)
    page_rows = rows[local_offset : local_offset + limit]

    return DatasetPage(
        dataset_id=dataset_id,
        columns=meta.columns,
        offset=offset,
        limit=limit,
        rows=page_rows,
        total_rows=meta.row_count,
    )
