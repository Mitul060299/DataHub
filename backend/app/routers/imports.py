from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime
from io import StringIO
import re
import uuid
import pandas as pd
import os
import logging

from ..db import get_db
from ..security import get_current_role, require_role
from ..services.file_parser import FileParserService
from ..services.connectors import connector_registry
from ..services.data_conversion import DataConversionService
from ..services.object_storage import StorageService
from ..services.storage_tiering import storage_tier_service
from ..services.plan_guard import resolve_user_plan, enforce_file_constraints, enforce_connector_access
from ..models_db import DatasetMetaDB, DatasetDataDB, DatasetChunkDB, ImportTableDB, ImportConnectionDB
from .datasets import save_dataset, get_dataset_from_db
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/import", tags=["import"])


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


def _connector_type_map(db_type: str) -> str:
    connector_map = {
        "postgresql": "postgresql",
        "mysql": "mysql",
        "mssql": "mssql",
        "mongodb": "mongodb",
        "oracle": "oracle",
        "snowflake": "snowflake",
        "bigquery": "bigquery",
        "redshift": "redshift",
        "azure-sql": "azure-sql",
    }
    return connector_map.get(db_type, db_type)


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    dataset_name: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    logger.info(f"Upload started: file={file.filename}, size={file.size}, workspace={workspace_id}")
    
    try:
        role = get_current_role(authorization)
        require_role("viewer", role)
    except HTTPException as e:
        logger.warning(f"Authorization failed: {e.detail}")
        raise

    if not file.filename:
        logger.error("No filename provided")
        raise HTTPException(status_code=400, detail="File name is required")

    resolved_dataset_name = (dataset_name or "").strip() or file.filename

    content = await file.read()
    if not content:
        logger.error("Empty file content")
        raise HTTPException(status_code=400, detail="No file content received")

    logger.info(f"File read successfully: {len(content)} bytes")

    try:
        source_format = FileParserService.detect_file_format(file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user_plan = resolve_user_plan(db, authorization)
    enforce_file_constraints(
        plan=user_plan,
        workspace_id=workspace_id or "default",
        file_format=source_format,
        upload_size_bytes=len(content),
        db=db,
    )

    try:
        logger.info(f"Parsing file: {file.filename}")
        df = FileParserService.parse_file(content, file.filename)
        if df.empty:
            raise ValueError("CSV file is empty")
        if df.shape[0] == 0:
            raise ValueError("No data rows found in file")
        logger.info(f"File parsed successfully: {df.shape[0]} rows, {df.shape[1]} columns")
    except ValueError as exc:
        logger.error(f"Parse error: {str(exc)}")
        raise HTTPException(status_code=400, detail=f"Invalid file format: {str(exc)}") from exc
    except Exception as exc:
        logger.error(f"Unexpected parse error: {type(exc).__name__}: {str(exc)}")
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(exc)}") from exc

    try:
        df = df.astype(object).where(pd.notnull(df), None)
        store_rows = int(df.shape[0]) <= settings.dataset_inline_max_rows
        logger.info(f"Converting to parquet, store_rows={store_rows}")
        parquet_bytes, schema, row_count, stats, compression_ratio = DataConversionService.dataframe_to_parquet(
            df,
            original_size=len(content),
        )
        logger.info(f"Parquet conversion done: {len(parquet_bytes)} bytes, ratio={compression_ratio:.1f}%")
        dataset_id = save_dataset(
            df,
            db,
            workspace_id=workspace_id,
            store_rows=store_rows,
            meta_extra={"name": resolved_dataset_name},
        )
        logger.info(f"Dataset saved: {dataset_id}")
    except Exception as exc:
        logger.error(f"Processing error: {type(exc).__name__}: {str(exc)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(exc)}") from exc

    try:
        file_base = os.path.splitext(file.filename or "dataset")[0]
        parquet_name = f"{file_base}.parquet"
        initial_tier = storage_tier_service.assign_initial_tier(
            file_size_bytes=len(content),
            row_count=int(df.shape[0]),
        )
        logger.info(f"Uploading to storage: {parquet_name}")
        storage_path = StorageService.upload(
            workspace_id,
            dataset_id,
            parquet_bytes,
            parquet_name,
            storage_tier=initial_tier,
        )
        logger.info(f"Storage upload complete: {storage_path}")

        meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if meta:
            meta.name = resolved_dataset_name
            meta.source_type = "file_upload"
            meta.storage_provider = settings.storage_provider
            meta.storage_path = storage_path
            meta.file_format = source_format
            meta.schema_json = schema
            meta.stats_json = stats
            meta.file_size_bytes = len(content)
            meta.compressed_size_bytes = len(parquet_bytes)
            meta.status = "ready"
            meta.access_tier = initial_tier

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
        logger.info(f"Upload completed successfully: table={table_name}")

        return {
            "success": True,
            "datasetId": dataset_id,
            "tableName": table_name,
            "rowCount": int(df.shape[0]),
            "tableCount": 1,
            "compressionRatio": f"{compression_ratio:.1f}%",
            "originalSize": len(content),
            "compressedSize": len(parquet_bytes),
            "storagePath": storage_path,
            "columns": len(df.columns),
            "fileSize": _format_size(len(content)),
            "format": source_format,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Final save error: {type(exc).__name__}: {str(exc)}")
        db.rollback()
        raise HTTPException(
            status_code=500, 
            detail=f"Error saving file: {str(exc)}"
        ) from exc


@router.post("/test-connection")
async def test_connection(
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Test a database or storage connection before saving."""

    db_type = payload.get("type")
    if not db_type:
        raise HTTPException(status_code=400, detail="Database type is required")

    connector_name = _connector_type_map(db_type)
    connector = connector_registry.get(connector_name)
    
    if not connector:
        raise HTTPException(status_code=400, detail=f"Unsupported connector type: {db_type}")

    user_plan = resolve_user_plan(db, authorization)
    enforce_connector_access(user_plan, connector_name)
    
    # Check if connector has test_connection method
    if not hasattr(connector, "test_connection"):
        return {"success": True, "message": "Connection validation not available for this connector"}
    
    # Build config from payload
    config = {
        "host": payload.get("host"),
        "port": payload.get("port"),
        "database": payload.get("database"),
        "username": payload.get("username"),
        "password": payload.get("password"),
        "server": payload.get("server"),  # For Azure
        "service_name": payload.get("service_name"),  # For Oracle
        "sid": payload.get("sid"),  # For Oracle
        "collection": payload.get("collection"),  # For MongoDB
        "account": payload.get("account"),  # For Snowflake
        "warehouse": payload.get("warehouse"),  # For Snowflake
        "schema": payload.get("schema"),
        "project_id": payload.get("project_id"),  # For BigQuery
        "credentials_json": payload.get("credentials_json"),  # For BigQuery/GCS
        "security_token": payload.get("security_token"),  # For Salesforce
        "domain": payload.get("domain"),  # For Salesforce
    }
    
    # Remove None values
    config = {k: v for k, v in config.items() if v is not None}
    
    try:
        result = connector.test_connection(config)
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/connector-import")
async def connector_import(
    payload: dict,
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    db_type = payload.get("type")
    if not db_type:
        raise HTTPException(status_code=400, detail="Database type is required")

    connector_name = _connector_type_map(db_type)
    user_plan = resolve_user_plan(db, authorization)
    enforce_connector_access(user_plan, connector_name)
    connector = connector_registry.get(connector_name)
    if not connector:
        raise HTTPException(status_code=400, detail=f"Unsupported connector type: {db_type}")

    config_payload = payload.get("config") if isinstance(payload.get("config"), dict) else {}
    config = {
        **config_payload,
        "host": payload.get("host", config_payload.get("host")),
        "port": payload.get("port", config_payload.get("port")),
        "database": payload.get("database", config_payload.get("database")),
        "username": payload.get("username", config_payload.get("username")),
        "password": payload.get("password", config_payload.get("password")),
        "account": payload.get("account", config_payload.get("account")),
        "warehouse": payload.get("warehouse", config_payload.get("warehouse")),
        "schema": payload.get("schema", config_payload.get("schema")),
        "project_id": payload.get("project_id", config_payload.get("project_id")),
        "credentials_json": payload.get("credentials_json", config_payload.get("credentials_json")),
        "query": payload.get("query", config_payload.get("query")),
        "table": payload.get("table", config_payload.get("table")),
        "dataset": payload.get("dataset", config_payload.get("dataset")),
    }
    config = {k: v for k, v in config.items() if v is not None and v != ""}

    try:
        df = connector.read(config)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Connector import failed: {str(exc)}") from exc

    if df.empty or int(df.shape[0]) == 0:
        raise HTTPException(status_code=400, detail="No data returned from connector")

    df = df.astype(object).where(pd.notnull(df), None)
    store_rows = int(df.shape[0]) <= settings.dataset_inline_max_rows
    estimated_original_size = int(df.memory_usage(deep=True).sum())
    enforce_file_constraints(
        plan=user_plan,
        workspace_id=workspace_id or "default",
        file_format="parquet",
        upload_size_bytes=max(estimated_original_size, 1),
        db=db,
    )
    parquet_bytes, schema, _, stats, compression_ratio = DataConversionService.dataframe_to_parquet(
        df,
        original_size=max(estimated_original_size, 1),
    )

    resolved_dataset_name = (
        (payload.get("dataset_name") or "").strip()
        or (payload.get("name") or "").strip()
        or f"{connector_name}_import"
    )

    dataset_id = save_dataset(
        df,
        db,
        workspace_id=workspace_id,
        store_rows=store_rows,
        meta_extra={"name": resolved_dataset_name},
    )

    storage_name = f"{_sanitize_table_name(resolved_dataset_name)}.parquet"
    initial_tier = storage_tier_service.assign_initial_tier(
        row_count=int(df.shape[0]),
    )
    storage_path = StorageService.upload(
        workspace_id,
        dataset_id,
        parquet_bytes,
        storage_name,
        storage_tier=initial_tier,
    )

    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if meta:
        meta.name = resolved_dataset_name
        meta.source_type = "connector_import"
        meta.storage_provider = settings.storage_provider
        meta.storage_path = storage_path
        meta.file_format = connector_name
        meta.schema_json = schema
        meta.stats_json = stats
        meta.file_size_bytes = None
        meta.compressed_size_bytes = len(parquet_bytes)
        meta.status = "ready"
        meta.access_tier = initial_tier

    table_name = _ensure_unique_table_name(db, _sanitize_table_name(resolved_dataset_name))
    table_id = str(uuid.uuid4())
    source_name = payload.get("table") or payload.get("query") or resolved_dataset_name
    db.add(
        ImportTableDB(
            id=table_id,
            name=table_name,
            dataset_id=dataset_id,
            workspace_id=workspace_id or "default",
            source_type="connector",
            source_name=str(source_name),
            size_bytes=None,
        )
    )
    db.commit()

    return {
        "success": True,
        "datasetId": dataset_id,
        "tableName": table_name,
        "rowCount": int(df.shape[0]),
        "tableCount": 1,
        "columns": len(df.columns),
        "compressionRatio": f"{compression_ratio:.1f}%",
        "storagePath": storage_path,
        "format": connector_name,
    }


@router.post("/connect")
async def connect_database(
    payload: dict,
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    db_type = payload.get("type")
    if not db_type:
        raise HTTPException(status_code=400, detail="Database type is required")

    user_plan = resolve_user_plan(db, authorization)
    enforce_connector_access(user_plan, _connector_type_map(db_type))

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
                "datasetId": table.dataset_id,
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
    
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == table.dataset_id).first()
    if meta and meta.storage_path:
        try:
            StorageService.delete(meta.storage_path)
        except Exception:
            pass

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
