from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session
import pandas as pd
import uuid
from ..models import ConnectorImportRequest, DatasetPreview
from ..models_db import ImportConnectionDB
from ..services.connectors import connector_registry
from .datasets import save_dataset
from .datasets import get_dataset, get_dataset_from_db
from ..db import get_db
from ..services.sync_store import sync_store
from ..security import get_current_role, get_current_user_id, require_role
from ..services.plan_guard import resolve_user_plan, enforce_connector_access, enforce_file_constraints

router = APIRouter(prefix="/connectors", tags=["connectors"])


@router.get("/")
def list_connectors(authorization: str | None = Header(default=None)) -> dict:
    role = get_current_role(authorization)
    require_role("viewer", role)
    return {"connectors": connector_registry.list()}


@router.post("/import", response_model=DatasetPreview)
def import_from_connector(
    payload: ConnectorImportRequest,
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> DatasetPreview:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_user_id(authorization)
    user_plan = resolve_user_plan(db, authorization)
    enforce_connector_access(user_plan, payload.connector)
    connector = connector_registry.get(payload.connector)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    df = connector.read(payload.config)
    if df.empty:
        raise HTTPException(status_code=400, detail="No data returned from connector")
    estimated_original_size = int(df.memory_usage(deep=True).sum())
    enforce_file_constraints(
        plan=user_plan,
        workspace_id=workspace_id or "default",
        file_format="parquet",
        upload_size_bytes=max(estimated_original_size, 1),
        db=db,
    )
    dataset_id = save_dataset(df, db, workspace_id=workspace_id, user_id=user_id)
    return DatasetPreview(
        dataset_id=dataset_id,
        columns=list(df.columns),
        file_format=payload.connector,
        row_count=int(df.shape[0]),
        sample_rows=df.head(10).to_dict(orient="records"),
    )


@router.post("/sync")
def sync_connector(
    payload: dict,
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_user_id(authorization)
    user_plan = resolve_user_plan(db, authorization)
    connector_name = payload.get("connector")
    config = payload.get("config", {})
    mode = payload.get("mode", "pull")
    dataset_id = payload.get("dataset_id")

    connector = connector_registry.get(connector_name)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    enforce_connector_access(user_plan, connector_name)

    key = f"{connector_name}:{config.get('table') or config.get('url') or config.get('connection_url') or 'default'}"

    if mode == "pull":
        df = connector.read(config)
        estimated_original_size = int(df.memory_usage(deep=True).sum()) if isinstance(df, pd.DataFrame) else 0
        enforce_file_constraints(
            plan=user_plan,
            workspace_id=workspace_id or "default",
            file_format="parquet",
            upload_size_bytes=max(estimated_original_size, 1),
            db=db,
        )
        new_id = save_dataset(df, db, parent_id=dataset_id, workspace_id=workspace_id, user_id=user_id)
        status = sync_store.update(key=key, mode=mode, dataset_id=new_id)
        return {
            "status": "synced",
            "mode": mode,
            "dataset_id": new_id,
            "last_synced_at": status.last_synced_at,
        }

    if mode == "push":
        if not dataset_id:
            raise HTTPException(status_code=400, detail="dataset_id is required for push")
        try:
            df = get_dataset(dataset_id)
        except KeyError:
            df = get_dataset_from_db(dataset_id, db)
        if not hasattr(connector, "write"):
            raise HTTPException(status_code=400, detail="Connector does not support push")
        rows = df.to_dict(orient="records")
        written = connector.write(config, rows)
        status = sync_store.update(key=key, mode=mode, dataset_id=dataset_id)
        return {
            "status": "synced",
            "mode": mode,
            "dataset_id": dataset_id,
            "written": written,
            "last_synced_at": status.last_synced_at,
        }

    raise HTTPException(status_code=400, detail="Unsupported sync mode")


@router.get("/sync-status")
def list_sync_status(authorization: str | None = Header(default=None)) -> dict:
    role = get_current_role(authorization)
    require_role("viewer", role)
    return {
        "status": [
            {
                "key": item.key,
                "last_synced_at": item.last_synced_at,
                "mode": item.mode,
                "dataset_id": item.dataset_id,
            }
            for item in sync_store.list()
        ]
    }


# ── Connection management ─────────────────────────────────────────────────────

@router.post("/test")
def test_connector_connection(
    payload: dict,
    authorization: str | None = Header(default=None),
) -> dict:
    """Test a connector config without saving credentials."""
    role = get_current_role(authorization)
    require_role("editor", role)
    connector_name = payload.get("connector")
    config = payload.get("config", {})
    connector = connector_registry.get(connector_name)
    if not connector:
        raise HTTPException(status_code=404, detail=f"Connector '{connector_name}' not found")
    if not hasattr(connector, "test_connection"):
        raise HTTPException(status_code=400, detail="This connector does not support connection testing")
    return connector.test_connection(config)


@router.post("/connections")
def save_connection(
    payload: dict,
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    """Persist a named connection (credentials stored in config JSONB)."""
    role = get_current_role(authorization)
    require_role("editor", role)
    user_plan = resolve_user_plan(db, authorization)
    connector_name = payload.get("connector")
    enforce_connector_access(user_plan, connector_name)
    cfg = payload.get("config", {})
    row = ImportConnectionDB(
        id=str(uuid.uuid4()),
        name=payload.get("name") or connector_name,
        type=connector_name,
        workspace_id=workspace_id or "default",
        host=cfg.get("host"),
        database=cfg.get("database"),
        status="connected",
        config=cfg,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "name": row.name,
        "type": row.type,
        "host": row.host,
        "database": row.database,
        "status": row.status,
        "created_at": row.created_at.isoformat(),
    }


@router.get("/connections")
def list_connections(
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> dict:
    """List saved connections for the current workspace."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    rows = (
        db.query(ImportConnectionDB)
        .filter(ImportConnectionDB.workspace_id == (workspace_id or "default"))
        .order_by(ImportConnectionDB.created_at.desc())
        .all()
    )
    return {
        "connections": [
            {
                "id": r.id,
                "name": r.name,
                "type": r.type,
                "host": r.host,
                "database": r.database,
                "status": r.status,
                "last_sync_at": r.last_sync_at.isoformat() if r.last_sync_at else None,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }


@router.delete("/connections/{connection_id}")
def delete_connection(
    connection_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    row = db.query(ImportConnectionDB).filter(ImportConnectionDB.id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/connections/{connection_id}/tables")
def list_connection_tables(
    connection_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Browse tables for a saved connection (schema browser)."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    row = db.query(ImportConnectionDB).filter(ImportConnectionDB.id == connection_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    connector = connector_registry.get(row.type)
    if not connector:
        raise HTTPException(status_code=404, detail=f"Connector '{row.type}' not found")
    if not hasattr(connector, "list_tables"):
        raise HTTPException(status_code=400, detail="This connector does not support schema browsing")
    tables = connector.list_tables(row.config)
    return {"connection_id": connection_id, "tables": tables}
