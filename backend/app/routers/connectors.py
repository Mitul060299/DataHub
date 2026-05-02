from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session
import pandas as pd
import uuid
from ..models import (
    ConnectorImportRequest,
    ConnectorCredentialCreate,
    ConnectorCredentialOut,
    DatasetPreview,
)
from ..models_db import ImportConnectionDB, ConnectorCredentialDB, DatasetMetaDB
from ..services.connectors import connector_registry, CREDENTIAL_KEYS
from .datasets import save_dataset
from .datasets import get_dataset, get_dataset_from_db
from ..db import get_db
from ..services.sync_store import sync_store
from ..security import (
    get_current_role,
    get_current_user_id,
    require_role,
    encrypt_connector_config,
    decrypt_connector_config,
)
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

    # ── Resolve / save connector credentials ──────────────────────────────
    credential_id: str | None = None
    effective_config = dict(payload.config)

    if payload.credential_id:
        # Use a previously saved credential. Scope strictly to the requesting
        # user so user A cannot reuse user B's saved DB credentials.
        cred_row = (
            db.query(ConnectorCredentialDB)
            .filter(
                ConnectorCredentialDB.id == payload.credential_id,
                ConnectorCredentialDB.user_id == user_id,
            )
            .first()
        )
        if not cred_row:
            raise HTTPException(status_code=404, detail="Credential not found")
        credential_id = cred_row.id
        effective_config = decrypt_connector_config(cred_row.encrypted_config)
    elif payload.save_credential and payload.config:
        # Encrypt and persist the supplied config
        cred_row = ConnectorCredentialDB(
            id=str(uuid.uuid4()),
            user_id=user_id,
            workspace_id="default",
            connector_type=payload.connector,
            label=payload.credential_label or payload.connector,
            encrypted_config=encrypt_connector_config(dict(payload.config)),
        )
        db.add(cred_row)
        db.flush()  # get the id without committing yet
        credential_id = cred_row.id

    # ── Read data from source ──────────────────────────────────────────────
    if payload.import_mode == "live":
        # Live mode: skip data pull — just save metadata
        if not credential_id:
            raise HTTPException(
                status_code=400,
                detail="import_mode='live' requires save_credential=true or a credential_id",
            )
        # We need a minimal DataFrame to get column info for the dataset record
        df = connector.read(effective_config)
        estimated_original_size = int(df.memory_usage(deep=True).sum())
    else:
        df = connector.read(effective_config)
        estimated_original_size = int(df.memory_usage(deep=True).sum())

    if df.empty:
        raise HTTPException(status_code=400, detail="No data returned from connector")

    enforce_file_constraints(
        plan=user_plan,
        billing_user_id=user_id or "",
        file_format="parquet",
        upload_size_bytes=max(estimated_original_size, 1),
        db=db,
    )

    # ── Persist dataset (always — even for live, we store schema/preview info) ──
    save_df = df.head(10) if payload.import_mode == "live" else df
    dataset_id = save_dataset(
        save_df,
        db,
        workspace_id="default",
        user_id=user_id,
    )

    # ── Attach fold/live metadata to DatasetMetaDB ─────────────────────────
    meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    if meta:
        meta.connector_credential_id = credential_id
        meta.import_mode = payload.import_mode
        meta.source_type = payload.connector
        # Strip credential-bearing fields before persisting: passwords and keys
        # are already encrypted in ConnectorCredentialDB.  Storing them again
        # in plaintext on dataset_meta would expose them to any reader of the
        # JSONB column (DB dumps, logs, admin UIs).
        meta.connector_config = {
            k: v for k, v in dict(payload.config).items()
            if k.lower() not in CREDENTIAL_KEYS
        }
        db.commit()

    return DatasetPreview(
        dataset_id=dataset_id,
        columns=list(df.columns),
        file_format=payload.connector,
        row_count=int(df.shape[0]),
        sample_rows=df.head(10).to_dict(orient="records"),
    )


# ── Connector Credential Management ────────────────────────────────────────

@router.post("/credentials", response_model=ConnectorCredentialOut)
def save_connector_credential(
    payload: ConnectorCredentialCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ConnectorCredentialOut:
    """Encrypt and persist a connector config as a reusable credential."""
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_user_id(authorization)
    user_plan = resolve_user_plan(db, authorization)
    enforce_connector_access(user_plan, payload.connector_type)

    row = ConnectorCredentialDB(
        id=str(uuid.uuid4()),
        user_id=user_id,
        workspace_id="default",
        connector_type=payload.connector_type,
        label=payload.label or payload.connector_type,
        encrypted_config=encrypt_connector_config(dict(payload.config)),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ConnectorCredentialOut(
        id=row.id,
        connector_type=row.connector_type,
        label=row.label,
        created_at=row.created_at.isoformat(),
    )


@router.get("/credentials", response_model=dict)
def list_connector_credentials(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """List saved credentials for the current user."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization)
    rows = (
        db.query(ConnectorCredentialDB)
        .filter(ConnectorCredentialDB.user_id == user_id)
        .order_by(ConnectorCredentialDB.created_at.desc())
        .all()
    )
    return {
        "credentials": [
            {
                "id": r.id,
                "connector_type": r.connector_type,
                "label": r.label,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }


@router.delete("/credentials/{credential_id}")
def delete_connector_credential(
    credential_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Revoke a saved credential.  Datasets using it will lose fold/live capability."""
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_user_id(authorization)
    row = (
        db.query(ConnectorCredentialDB)
        .filter(
            ConnectorCredentialDB.id == credential_id,
            ConnectorCredentialDB.user_id == user_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Credential not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/sync")
def sync_connector(
    payload: dict,
    authorization: str | None = Header(default=None),
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
            billing_user_id=user_id or "",
            file_format="parquet",
            upload_size_bytes=max(estimated_original_size, 1),
            db=db,
        )
        new_id = save_dataset(df, db, parent_id=dataset_id, workspace_id="default", user_id=user_id)
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
            df = get_dataset_from_db(dataset_id, db, user_id=user_id or "anonymous")
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
        workspace_id="default",
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
    db: Session = Depends(get_db),
) -> dict:
    """List saved connections."""
    role = get_current_role(authorization)
    require_role("viewer", role)
    rows = (
        db.query(ImportConnectionDB)
        .filter(ImportConnectionDB.workspace_id == "default")
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
