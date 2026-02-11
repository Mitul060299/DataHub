from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session
from ..models import ConnectorImportRequest, DatasetPreview
from ..services.connectors import connector_registry
from .datasets import save_dataset
from .datasets import get_dataset, get_dataset_from_db
from ..db import get_db
from ..services.sync_store import sync_store
from ..security import get_current_role, require_role

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
    db: Session = Depends(get_db),
) -> DatasetPreview:
    role = get_current_role(authorization)
    require_role("editor", role)
    connector = connector_registry.get(payload.connector)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    df = connector.read(payload.config)
    dataset_id = save_dataset(df, db)
    return DatasetPreview(
        dataset_id=dataset_id,
        columns=list(df.columns),
        row_count=int(df.shape[0]),
        sample_rows=df.head(10).to_dict(orient="records"),
    )


@router.post("/sync")
def sync_connector(
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    connector_name = payload.get("connector")
    config = payload.get("config", {})
    mode = payload.get("mode", "pull")
    dataset_id = payload.get("dataset_id")

    connector = connector_registry.get(connector_name)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    key = f"{connector_name}:{config.get('table') or config.get('url') or config.get('connection_url') or 'default'}"

    if mode == "pull":
        df = connector.read(config)
        new_id = save_dataset(df, db, parent_id=dataset_id)
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
