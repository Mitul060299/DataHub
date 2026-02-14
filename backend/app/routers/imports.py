from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, HTTPException, Header, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime
from io import StringIO
import re
import uuid
import pandas as pd

from ..db import get_db
from ..security import get_current_role, require_role
from ..services.file_parser import FileParserService
from ..models_db import DatasetMetaDB, DatasetDataDB, DatasetChunkDB, ImportTableDB, ImportConnectionDB
from .datasets import save_dataset, get_dataset_from_db

router = APIRouter(prefix="/import", tags=["import"])

_PLAN_LIMITS = {
    "free": 10 * 1024 * 1024,
    "professional": 100 * 1024 * 1024,
    "team": 1024 * 1024 * 1024,
}


def _format_size(bytes_count: int | None) -> str:
    if not bytes_count:
        return "0 B"
    if bytes_count < 1024:
        return f"{bytes_count} B"
    if bytes_count < 1024 * 1024:
        return f"{bytes_count / 1024:.2f} KB"
    if bytes_count < 1024 * 1024 * 1024:
        return f"{bytes_count / (1024 * 1024):.2f} MB"
    return f"{bytes_count / (1024 * 1024 * 1024):.2f} GB"


def _sanitize_table_name(value: str) -> str:
    base = value.rsplit(".", 1)[0]
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", base).strip("_").lower()
    return cleaned or "imported_data"


def _ensure_unique_table_name(db: Session, name: str) -> str:
    current = name
    suffix = 1
    while db.query(ImportTableDB).filter(ImportTableDB.name == current).first():
        current = f"{name}_{suffix}"
        suffix += 1
    return current


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
    plan: str | None = Header(default=None, alias="X-Plan"),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("viewer", role)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="No file content received")

    plan_key = (plan or "professional").lower()
    max_size = _PLAN_LIMITS.get(plan_key, _PLAN_LIMITS["professional"])
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds {plan_key.capitalize()} plan limit",
        )

    try:
        df = FileParserService.parse_file(content, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    df = df.astype(object).where(pd.notnull(df), None)
    dataset_id = save_dataset(df, db, workspace_id=workspace_id)

    table_name = _ensure_unique_table_name(db, _sanitize_table_name(file.filename))
    table_id = str(uuid.uuid4())

    db.add(
        ImportTableDB(
            id=table_id,
            name=table_name,
            dataset_id=dataset_id,
            workspace_id=workspace_id or "default",
            source_type="file",
            source_name=file.filename,
            size_bytes=len(content),
        )
    )
    db.commit()

    return {
        "success": True,
        "tableName": table_name,
        "rowCount": int(df.shape[0]),
        "tableCount": 1,
    }


@router.post("/test-connection")
async def test_connection(payload: dict) -> dict:
    db_type = payload.get("type")
    if not db_type:
        raise HTTPException(status_code=400, detail="Database type is required")
    return {"success": True, "message": "Connection parameters look valid"}


@router.post("/connect")
async def connect_database(
    payload: dict,
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    db_type = payload.get("type")
    if not db_type:
        raise HTTPException(status_code=400, detail="Database type is required")

    connection_id = str(uuid.uuid4())
    name = payload.get("name") or payload.get("database") or "Connection"
    host = payload.get("host") or ""
    database_name = payload.get("database") or ""

    db.add(
        ImportConnectionDB(
            id=connection_id,
            name=name,
            type=db_type,
            workspace_id=workspace_id or "default",
            host=host,
            database=database_name,
            status="connected",
            config=payload,
        )
    )
    db.commit()

    return {
        "success": True,
        "connectionId": connection_id,
        "tableCount": 0,
    }


@router.post("/disconnect/{connection_id}")
async def disconnect_database(connection_id: str, db: Session = Depends(get_db)) -> dict:
    connection = db.query(ImportConnectionDB).filter(ImportConnectionDB.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    connection.status = "disconnected"
    connection.last_sync_at = datetime.utcnow()
    db.commit()
    return {"success": True}


@router.get("/tables")
async def list_tables(
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(ImportTableDB)
    if workspace_id:
        query = query.filter(ImportTableDB.workspace_id == workspace_id)
    tables = query.order_by(ImportTableDB.created_at.desc()).all()
    results = []
    for table in tables:
        meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == table.dataset_id).first()
        row_count = meta.row_count if meta else 0
        column_count = len(meta.columns) if meta and meta.columns else 0
        results.append(
            {
                "name": table.name,
                "rowCount": row_count,
                "columnCount": column_count,
                "size": _format_size(table.size_bytes),
                "lastUpdated": table.created_at.isoformat() if table.created_at else "",
            }
        )
    return {"tables": results}


@router.get("/tables/{table_name}/preview")
async def table_preview(
    table_name: str,
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(ImportTableDB).filter(ImportTableDB.name == table_name)
    if workspace_id:
        query = query.filter(ImportTableDB.workspace_id == workspace_id)
    table = query.first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    try:
        df = get_dataset_from_db(table.dataset_id, db)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Dataset not found") from exc
    rows = df.head(100).to_dict(orient="records")
    columns = [{"name": col} for col in df.columns]

    return {"rows": rows, "columns": columns}


@router.delete("/tables/{table_name}")
async def delete_table(
    table_name: str,
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(ImportTableDB).filter(ImportTableDB.name == table_name)
    if workspace_id:
        query = query.filter(ImportTableDB.workspace_id == workspace_id)
    table = query.first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    db.query(DatasetChunkDB).filter(DatasetChunkDB.dataset_id == table.dataset_id).delete()
    db.query(DatasetDataDB).filter(DatasetDataDB.id == table.dataset_id).delete()
    db.query(DatasetMetaDB).filter(DatasetMetaDB.id == table.dataset_id).delete()
    db.delete(table)
    db.commit()

    return {"success": True}


@router.post("/tables/{table_name}/export")
async def export_table(
    table_name: str,
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    query = db.query(ImportTableDB).filter(ImportTableDB.name == table_name)
    if workspace_id:
        query = query.filter(ImportTableDB.workspace_id == workspace_id)
    table = query.first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    try:
        df = get_dataset_from_db(table.dataset_id, db)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Dataset not found") from exc
    csv_buffer = StringIO()
    df.to_csv(csv_buffer, index=False)
    csv_buffer.seek(0)

    headers = {
        "Content-Disposition": f"attachment; filename={table_name}.csv",
    }
    return StreamingResponse(csv_buffer, media_type="text/csv", headers=headers)
