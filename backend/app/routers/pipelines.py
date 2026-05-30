from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import PipelineCreate, PipelineUpdate, PipelineSchedule, PipelineRun
from ..models_db import PipelineDB, PipelineRunDB, PipelineRunV2DB, PipelineV2DB
from ..security import get_current_role, get_current_user_id, require_role
from ..services.plan_guard import resolve_user_plan, enforce_scheduling
from ..services.pipelines import schedule_pipeline, run_pipeline_job
from ..services.pipeline_runner import run_pipeline as run_pipeline_v2

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


def _to_pipeline_out(row: PipelineDB) -> PipelineSchedule:
    return PipelineSchedule(
        pipeline_id=row.id,
        name=row.name,
        cadence=row.cadence,
        time_of_day=row.time_of_day,
        day_of_week=row.day_of_week,
        day_of_month=row.day_of_month,
        dataset_id=row.dataset_id,
        connector=row.connector,
        connector_config=row.connector_config or {},
        apply_recipe=bool(row.apply_recipe),
        run_profile=bool(row.run_profile),
        run_insights=bool(row.run_insights),
        enabled=bool(row.enabled),
        last_run_at=row.last_run_at.isoformat() if row.last_run_at else None,
        next_run_at=row.next_run_at.isoformat() if row.next_run_at else None,
        last_run_metadata=row.last_run_metadata or {},
        created_at=row.created_at.isoformat() if row.created_at else None,
    )


@router.post("/", response_model=PipelineSchedule)
def create_pipeline(
    payload: PipelineCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> PipelineSchedule:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_plan = resolve_user_plan(db, authorization)
    enforce_scheduling(user_plan)
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Pipeline name is required")
    user_id = get_current_user_id(authorization)
    pipeline_id = str(uuid.uuid4())
    row = PipelineDB(
        id=pipeline_id,
        name=payload.name.strip(),
        cadence=payload.cadence,
        time_of_day=payload.time_of_day,
        day_of_week=payload.day_of_week,
        day_of_month=payload.day_of_month,
        dataset_id=payload.dataset_id,
        connector=payload.connector,
        connector_config=payload.connector_config,
        apply_recipe=payload.apply_recipe,
        run_profile=payload.run_profile,
        run_insights=payload.run_insights,
        enabled=payload.enabled,
        user_id=user_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    schedule_pipeline(pipeline_id)
    db.refresh(row)
    return _to_pipeline_out(row)


@router.get("/", response_model=list[PipelineSchedule])
def list_pipelines(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[PipelineSchedule]:
    role = get_current_role(authorization)
    # Admin-only: this legacy endpoint has no user_id column on PipelineDB.
    # Regular users access their pipelines via /api/pipelines (pipeline_workflows).
    require_role("admin", role)
    rows = db.query(PipelineDB).order_by(PipelineDB.created_at.desc()).all()
    return [_to_pipeline_out(row) for row in rows]


@router.get("/{pipeline_id}", response_model=PipelineSchedule)
def get_pipeline(
    pipeline_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> PipelineSchedule:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization)
    row = db.query(PipelineDB).filter(
        PipelineDB.id == pipeline_id,
        (PipelineDB.user_id == user_id) | (PipelineDB.user_id.is_(None)),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return _to_pipeline_out(row)


@router.put("/{pipeline_id}", response_model=PipelineSchedule)
def update_pipeline(
    pipeline_id: str,
    payload: PipelineUpdate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> PipelineSchedule:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_plan = resolve_user_plan(db, authorization)
    enforce_scheduling(user_plan)
    user_id = get_current_user_id(authorization)
    row = db.query(PipelineDB).filter(
        PipelineDB.id == pipeline_id,
        (PipelineDB.user_id == user_id) | (PipelineDB.user_id.is_(None)),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="Pipeline name is required")
        row.name = payload.name.strip()
    if payload.cadence is not None:
        row.cadence = payload.cadence
    if payload.time_of_day is not None:
        row.time_of_day = payload.time_of_day
    if payload.day_of_week is not None:
        row.day_of_week = payload.day_of_week
    if payload.day_of_month is not None:
        row.day_of_month = payload.day_of_month
    if payload.dataset_id is not None:
        row.dataset_id = payload.dataset_id
    if payload.connector is not None:
        row.connector = payload.connector
    if payload.connector_config is not None:
        row.connector_config = payload.connector_config
    if payload.apply_recipe is not None:
        row.apply_recipe = payload.apply_recipe
    if payload.run_profile is not None:
        row.run_profile = payload.run_profile
    if payload.run_insights is not None:
        row.run_insights = payload.run_insights
    if payload.enabled is not None:
        row.enabled = payload.enabled
    db.commit()
    schedule_pipeline(pipeline_id)
    db.refresh(row)
    return _to_pipeline_out(row)


@router.delete("/{pipeline_id}")
def delete_pipeline(
    pipeline_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_id = get_current_user_id(authorization)
    row = db.query(PipelineDB).filter(
        PipelineDB.id == pipeline_id,
        (PipelineDB.user_id == user_id) | (PipelineDB.user_id.is_(None)),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "pipeline_id": pipeline_id}


@router.post("/{pipeline_id}/run")
async def run_pipeline(
    pipeline_id: str,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_plan = resolve_user_plan(db, authorization)
    enforce_scheduling(user_plan)
    user_id = get_current_user_id(authorization)

    # ── V2 pipeline path ─────────────────────────────────────────────────────
    v2 = db.query(PipelineV2DB).filter(
        PipelineV2DB.id == pipeline_id,
        PipelineV2DB.user_id == user_id,
    ).first()
    if v2:
        run_id = str(uuid.uuid4())
        run_record = PipelineRunV2DB(
            id=run_id,
            pipeline_id=pipeline_id,
            user_id=user_id,
            status="pending",
            triggered_by="manual",
            started_at=datetime.now(timezone.utc),
            execution_log=[],
            step_results={},
            metrics={},
        )
        db.add(run_record)
        db.commit()
        background_tasks.add_task(run_pipeline_v2, pipeline_id, "manual", None, run_id)
        return {"run_id": run_id, "status": "running", "pipeline_id": pipeline_id}

    # ── Legacy V1 pipeline path ──────────────────────────────────────────────
    row = db.query(PipelineDB).filter(
        PipelineDB.id == pipeline_id,
        (PipelineDB.user_id == user_id) | (PipelineDB.user_id.is_(None)),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    run_pipeline_job(pipeline_id)
    return {"run_id": str(uuid.uuid4()), "status": "running", "pipeline_id": pipeline_id}


@router.get("/{pipeline_id}/runs")
def list_pipeline_runs(
    pipeline_id: str,
    limit: int = 20,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[dict]:
    role = get_current_role(authorization)
    require_role("viewer", role)

    # ── V2 runs ──────────────────────────────────────────────────────────────
    v2_rows = (
        db.query(PipelineRunV2DB)
        .filter(PipelineRunV2DB.pipeline_id == pipeline_id)
        .order_by(PipelineRunV2DB.started_at.desc())
        .limit(limit)
        .all()
    )
    if v2_rows:
        return [
            {
                "id": r.id,
                "pipeline_id": r.pipeline_id,
                "status": r.status,
                "triggered_by": r.triggered_by,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.completed_at.isoformat() if r.completed_at else None,
                "error_message": r.error_message,
                "output_snapshot_url": r.output_snapshot_url,
            }
            for r in v2_rows
        ]

    # ── Legacy V1 runs ───────────────────────────────────────────────────────
    rows = (
        db.query(PipelineRunDB)
        .filter(PipelineRunDB.pipeline_id == pipeline_id)
        .order_by(PipelineRunDB.started_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": row.id,
            "pipeline_id": row.pipeline_id,
            "status": row.status,
            "triggered_by": "manual",
            "started_at": row.started_at.isoformat() if row.started_at else None,
            "finished_at": row.finished_at.isoformat() if row.finished_at else None,
            "error_message": row.error,
            "output_snapshot_url": None,
        }
        for row in rows
    ]
