"""Router for cross-pipeline step operations.

Endpoints
---------
GET  /users/me/pipeline-steps/snapshots
    All pipeline steps with a saved Parquet snapshot owned by the current
    user. Powers the cross-input picker and branch UI.

POST /datasets/{datasetId}/cross-inputs
GET  /datasets/{datasetId}/cross-inputs
DEL  /datasets/{datasetId}/cross-inputs/{inputId}
    CRUD for the cross-pipeline inputs attached to a dataset. Each record
    links a source step's snapshot to a DuckDB alias name the agent can use
    when the dataset is active.

POST /pipeline-steps/{stepId}/fork-to-dataset
    Create a new dataset whose raw data is the named step's Parquet snapshot
    *and* whose pipeline history is a copy of all steps up to (and including)
    that step. The fork is a branch continuation, not a clean slate.

GET  /pipeline-steps/{stepId}/forks
    List child datasets that were forked from the given step (for the graph
    "forked-from-here" outgoing edge).
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    CrossPipelineInputCreate,
    CrossPipelineInputOut,
    ForkChildOut,
    ForkFromStepOut,
    ForkFromStepRequest,
    StepSnapshotOut,
)
from ..models_db import (
    CrossPipelineInputDB,
    DatasetMetaDB,
    DatasetSessionDB,
    PipelineStepDB,
)
from ..security import get_current_role, get_current_user_id, require_role
from ..services.persistence_policy import materialize_dataset

router = APIRouter(tags=["pipeline_steps"])
logger = logging.getLogger(__name__)


def _slugify(text: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_]", "_", text.strip()).lower()
    s = re.sub(r"_+", "_", s).strip("_")
    if not s or s[0].isdigit():
        s = "ds_" + s
    return s or "step"


def _require_step(db: Session, step_id: str, user_id: str) -> PipelineStepDB:
    step = db.query(PipelineStepDB).filter(PipelineStepDB.id == step_id).first()
    if not step:
        raise HTTPException(status_code=404, detail="Pipeline step not found")
    if step.user_id != user_id:
        raise HTTPException(status_code=404, detail="Pipeline step not found")
    return step


def _require_dataset(db: Session, dataset_id: str, user_id: str) -> DatasetMetaDB:
    ds = (
        db.query(DatasetMetaDB)
        .filter(
            DatasetMetaDB.id == dataset_id,
            DatasetMetaDB.user_id == user_id,
            DatasetMetaDB.deleted_at.is_(None),
        )
        .first()
    )
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return ds


# ── 1. Snapshot index ─────────────────────────────────────────────────────────

@router.get("/users/me/pipeline-steps/snapshots", response_model=list[StepSnapshotOut])
def list_user_step_snapshots(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[StepSnapshotOut]:
    """Return all pipeline steps owned by the current user that have a saved
    Parquet snapshot. Used by the cross-input picker and fork UI."""
    require_role("viewer", get_current_role(authorization))
    user_id = get_current_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    steps = (
        db.query(PipelineStepDB)
        .filter(
            PipelineStepDB.user_id == user_id,
            PipelineStepDB.snapshot_path.isnot(None),
            PipelineStepDB.status == "completed",
        )
        .order_by(PipelineStepDB.created_at.desc())
        .limit(500)
        .all()
    )

    # Build dataset name lookup
    ds_ids = {s.session_id for s in steps if s.session_id}
    # session_id == f"{user_id}:{chat_session_id}" — can't directly join to
    # dataset_meta on it.  Resolve via DatasetSessionDB instead.
    sessions = (
        db.query(DatasetSessionDB)
        .filter(DatasetSessionDB.user_id == user_id)
        .all()
    )
    sess_to_ds: dict[str, str] = {
        f"{s.user_id}:{s.chat_session_id}": s.dataset_id
        for s in sessions
        if s.chat_session_id
    }
    ds_id_set = set(sess_to_ds.values())
    datasets = (
        db.query(DatasetMetaDB)
        .filter(DatasetMetaDB.id.in_(ds_id_set), DatasetMetaDB.deleted_at.is_(None))
        .all()
    )
    ds_name: dict[str, str] = {d.id: (d.name or d.id) for d in datasets}

    out: list[StepSnapshotOut] = []
    for s in steps:
        ds_id = sess_to_ds.get(s.session_id or "", "")
        out.append(
            StepSnapshotOut(
                step_id=s.id,
                step_number=s.step_number,
                operation=s.operation,
                description=s.description,
                row_count_after=s.row_count_after,
                snapshot_path=s.snapshot_path or "",
                dataset_id=ds_id,
                dataset_name=ds_name.get(ds_id),
                created_at=s.created_at.isoformat() if s.created_at else None,
            )
        )
    return out


# ── 2. Cross-pipeline inputs CRUD ─────────────────────────────────────────────

@router.post(
    "/datasets/{dataset_id}/cross-inputs",
    response_model=CrossPipelineInputOut,
    status_code=201,
)
def add_cross_input(
    dataset_id: str,
    body: CrossPipelineInputCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> CrossPipelineInputOut:
    """Link a step snapshot to a dataset so the agent can JOIN across pipelines."""
    require_role("editor", get_current_role(authorization))
    user_id = get_current_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    _require_dataset(db, dataset_id, user_id)
    step = _require_step(db, body.source_step_id, user_id)

    if not step.snapshot_path:
        raise HTTPException(
            status_code=422,
            detail="Source step has no saved snapshot. Run the pipeline first.",
        )

    # Validate alias is a safe SQL identifier
    alias = _slugify(body.alias)
    if not alias:
        raise HTTPException(status_code=422, detail="alias must be a non-empty string")

    # Resolve source_dataset_id from the step's session
    session = (
        db.query(DatasetSessionDB)
        .filter(
            DatasetSessionDB.user_id == user_id,
            DatasetSessionDB.chat_session_id == (step.session_id or "").split(":")[-1],
        )
        .first()
    )
    source_dataset_id = session.dataset_id if session else ""

    row = CrossPipelineInputDB(
        id=str(uuid.uuid4()),
        consumer_dataset_id=dataset_id,
        source_step_id=body.source_step_id,
        source_dataset_id=source_dataset_id,
        alias=alias,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail="An input with this alias already exists")

    src_ds = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == source_dataset_id).first()

    return CrossPipelineInputOut(
        id=row.id,
        consumer_dataset_id=row.consumer_dataset_id,
        source_step_id=row.source_step_id,
        source_dataset_id=row.source_dataset_id,
        alias=row.alias,
        source_dataset_name=src_ds.name if src_ds else None,
        step_number=step.step_number,
        step_description=step.description,
        snapshot_path=step.snapshot_path,
    )


@router.get(
    "/datasets/{dataset_id}/cross-inputs",
    response_model=list[CrossPipelineInputOut],
)
def list_cross_inputs(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[CrossPipelineInputOut]:
    """Return all cross-pipeline inputs attached to this dataset."""
    require_role("viewer", get_current_role(authorization))
    user_id = get_current_user_id(authorization)
    _require_dataset(db, dataset_id, user_id)

    rows = (
        db.query(CrossPipelineInputDB)
        .filter(CrossPipelineInputDB.consumer_dataset_id == dataset_id)
        .all()
    )

    out = []
    for row in rows:
        step = db.query(PipelineStepDB).filter(PipelineStepDB.id == row.source_step_id).first()
        src_ds = (
            db.query(DatasetMetaDB)
            .filter(DatasetMetaDB.id == row.source_dataset_id)
            .first()
        )
        out.append(
            CrossPipelineInputOut(
                id=row.id,
                consumer_dataset_id=row.consumer_dataset_id,
                source_step_id=row.source_step_id,
                source_dataset_id=row.source_dataset_id,
                alias=row.alias,
                source_dataset_name=src_ds.name if src_ds else None,
                step_number=step.step_number if step else None,
                step_description=step.description if step else None,
                snapshot_path=step.snapshot_path if step else None,
            )
        )
    return out


@router.delete(
    "/datasets/{dataset_id}/cross-inputs/{input_id}",
    status_code=204,
)
def remove_cross_input(
    dataset_id: str,
    input_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> None:
    """Remove a cross-pipeline input from a dataset."""
    require_role("editor", get_current_role(authorization))
    user_id = get_current_user_id(authorization)
    _require_dataset(db, dataset_id, user_id)

    row = (
        db.query(CrossPipelineInputDB)
        .filter(
            CrossPipelineInputDB.id == input_id,
            CrossPipelineInputDB.consumer_dataset_id == dataset_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Cross-pipeline input not found")

    db.delete(row)
    db.commit()


# ── 3. Fork step to new dataset ───────────────────────────────────────────────

@router.post(
    "/pipeline-steps/{step_id}/fork-to-dataset",
    response_model=ForkFromStepOut,
    status_code=201,
)
def fork_step_to_dataset(
    step_id: str,
    body: ForkFromStepRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ForkFromStepOut:
    """Create a new dataset that is a branch continuation from the given step.

    The new dataset's raw data is the step's Parquet snapshot (no file copy —
    same storage_path).  All pipeline steps up to and including the source
    step are copied into the new dataset's pipeline history so the graph shows
    the full inherited lineage.
    """
    require_role("editor", get_current_role(authorization))
    user_id = get_current_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    fork_step = _require_step(db, step_id, user_id)

    if not fork_step.snapshot_path:
        raise HTTPException(
            status_code=422,
            detail="Step has no saved snapshot. Run the pipeline to generate one.",
        )

    # Resolve source dataset via DatasetSessionDB
    session_key = fork_step.session_id or ""
    chat_session_part = session_key.split(":")[-1] if ":" in session_key else session_key
    source_session = (
        db.query(DatasetSessionDB)
        .filter(
            DatasetSessionDB.user_id == user_id,
            DatasetSessionDB.chat_session_id == chat_session_part,
        )
        .first()
    )
    source_dataset_id = source_session.dataset_id if source_session else ""
    source_ds = (
        db.query(DatasetMetaDB)
        .filter(DatasetMetaDB.id == source_dataset_id)
        .first()
    )

    # Build new dataset name
    source_name = source_ds.name if source_ds else "Dataset"
    default_name = f"{source_name} → step {fork_step.step_number}"
    new_name = (body.name or default_name).strip() or default_name

    # Create the new dataset row — points at the same snapshot file as raw data
    new_ds_id = str(uuid.uuid4())
    new_ds = materialize_dataset(
        db,
        triggered_by="pipeline_step",
        id=new_ds_id,
        user_id=user_id,
        name=new_name,
        description=f"Forked from {source_name} at step {fork_step.step_number}: {fork_step.description or ''}",
        source_type="fork",
        storage_provider=source_ds.storage_provider if source_ds else "s3",
        storage_path=fork_step.snapshot_path,
        file_format="parquet",
        schema_json=source_ds.schema_json if source_ds else {},
        stats_json={},
        columns=source_ds.columns if source_ds else [],
        row_count=fork_step.row_count_after or 0,
        file_size_bytes=None,
        status="ready",
        project_id=body.project_id or (source_ds.project_id if source_ds else None),
        version_number=1,
        # Cross-pipeline lineage pointer
        forked_from_step_id=step_id,
    )

    # Copy all pipeline steps from the source pipeline up to fork_step.step_number
    prior_steps = (
        db.query(PipelineStepDB)
        .filter(
            PipelineStepDB.user_id == user_id,
            PipelineStepDB.session_id == fork_step.session_id,
            PipelineStepDB.status == "completed",
            PipelineStepDB.step_number <= fork_step.step_number,
        )
        .order_by(PipelineStepDB.step_number)
        .all()
    )

    # We need a new session_id for the forked dataset — use the new dataset id
    # as a placeholder; the real session is created when the user opens it.
    new_session_id = f"{user_id}:fork_{new_ds_id[:8]}"

    copied_steps: list[dict] = []
    import uuid as _uuid_mod
    for ps in prior_steps:
        copied_id = str(_uuid_mod.uuid4())
        new_step = PipelineStepDB(
            id=copied_id,
            user_id=user_id,
            session_id=new_session_id,
            step_number=ps.step_number,
            intent=ps.intent,
            operation=ps.operation,
            description=ps.description,
            input_tables=ps.input_tables,
            output_table=ps.output_table,
            duckdb_sql=ps.duckdb_sql,
            parameters=ps.parameters,
            status="completed",
            execution_time_ms=ps.execution_time_ms,
            row_count_before=ps.row_count_before,
            row_count_after=ps.row_count_after,
            # Keep snapshot paths — these are the same files; replay reads them
            snapshot_path=ps.snapshot_path,
            parent_step_id=None,  # copied steps are linear in the new pipeline
        )
        db.add(new_step)
        copied_steps.append(
            {
                "id": copied_id,
                "stepNumber": ps.step_number,
                "operation": ps.operation,
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
                "parentStepId": None,
            }
        )

    # Pre-create a DatasetSessionDB so the pipeline step lookup works on first
    # open without the user needing to trigger a new chat.
    new_chat_id = f"fork_{new_ds_id[:8]}"
    db.add(
        DatasetSessionDB(
            id=str(_uuid_mod.uuid4()),
            dataset_id=new_ds_id,
            user_id=user_id,
            chat_session_id=new_chat_id,
        )
    )

    try:
        db.commit()
        db.refresh(new_ds)
    except Exception as exc:
        db.rollback()
        logger.error("fork_step_to_dataset DB commit failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create forked dataset")

    return ForkFromStepOut(
        dataset_id=new_ds_id,
        dataset_name=new_name,
        forked_from_step_id=step_id,
        steps=copied_steps,
    )


# ── 4. List forks from a step ─────────────────────────────────────────────────

@router.get(
    "/pipeline-steps/{step_id}/forks",
    response_model=list[ForkChildOut],
)
def list_step_forks(
    step_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[ForkChildOut]:
    """Return datasets that were branched off the given step.
    Used by the pipeline graph to draw outgoing 'fork' edges."""
    require_role("viewer", get_current_role(authorization))
    user_id = get_current_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    children = (
        db.query(DatasetMetaDB)
        .filter(
            DatasetMetaDB.user_id == user_id,
            DatasetMetaDB.forked_from_step_id == step_id,
            DatasetMetaDB.deleted_at.is_(None),
        )
        .all()
    )

    return [
        ForkChildOut(
            dataset_id=c.id,
            dataset_name=c.name,
            forked_at=c.created_at.isoformat() if c.created_at else None,
        )
        for c in children
    ]
