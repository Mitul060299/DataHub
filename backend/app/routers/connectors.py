from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session
import pandas as pd
from ..models import ConnectorImportRequest, DatasetPreview
from ..services.connectors import connector_registry
from .datasets import save_dataset
from .datasets import get_dataset, get_dataset_from_db
from ..db import get_db
from ..services.sync_store import sync_store
from ..security import get_current_role, require_role
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
    dataset_id = save_dataset(df, db, workspace_id=workspace_id)
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
        new_id = save_dataset(df, db, parent_id=dataset_id, workspace_id=workspace_id)
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
