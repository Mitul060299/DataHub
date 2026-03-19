"""
pipeline_refresh.py
===================
Endpoints:
  POST /api/pipelines/{pipeline_id}/run   — trigger a manual run
  GET  /api/pipelines/runs/{run_id}/status — poll run status
  GET  /api/pipelines/{pipeline_id}/runs  — run history (last N)
  GET  /api/pipelines/{pipeline_id}/schedule — get schedule
  POST /api/pipelines/{pipeline_id}/schedule — create/update schedule
  PATCH /api/pipelines/{pipeline_id}/schedule — toggle active / update fields
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import PipelineRunOut, PipelineRunStatus, PipelineScheduleCreate, PipelineScheduleResponse
from ..models_db import PipelineRunV2DB, PipelineScheduleDB, PipelineV2DB
from ..security import get_current_user_id, get_current_role, require_role
from ..services.pipeline_runner import run_pipeline

router = APIRouter(prefix="/api/pipelines", tags=["pipeline_refresh"])

# ---------------------------------------------------------------------------
# Trigger a manual run
# ---------------------------------------------------------------------------

@router.post("/{pipeline_id}/run", response_model=PipelineRunOut)
async def trigger_pipeline_run(
    pipeline_id: str,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> PipelineRunOut:
    role = get_current_role(authorization)
    require_role("viewer", role)

    pipeline = db.query(PipelineV2DB).filter(PipelineV2DB.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    # Pre-create the run record so the caller has an id to poll immediately
    run_id = str(uuid.uuid4())
    run = PipelineRunV2DB(
        id=run_id,
        pipeline_id=pipeline_id,
        user_id=get_current_user_id(authorization) or str(pipeline.user_id or "system"),
        status="pending",
        triggered_by="manual",
        started_at=datetime.now(timezone.utc),
        execution_log=[],
        step_results={},
        metrics={},
    )
    db.add(run)
    db.commit()

    # Run in background — the runner will update the existing row
    background_tasks.add_task(_run_with_existing_id, pipeline_id, "manual", run_id)

    return PipelineRunOut(run_id=run_id, message="Pipeline run triggered")


async def _run_with_existing_id(
    pipeline_id: str, triggered_by: str, existing_run_id: str
) -> None:
    """Wrapper that passes an already-allocated run_id to the runner."""
    # The runner allocates its own id; we delete the pre-created row after
    # and swap it with the runner's id — OR we call run_pipeline which creates
    # its own record anyway.  For simplicity, we let the existing record be
    # superseded: delete the placeholder and run normally.
    from ..db import SessionLocal
    db = SessionLocal()
    try:
        placeholder = db.query(PipelineRunV2DB).filter(
            PipelineRunV2DB.id == existing_run_id
        ).first()
        if placeholder:
            db.delete(placeholder)
            db.commit()
    finally:
        db.close()
    # Run pipeline and let it create its own authoritative record
    await run_pipeline(pipeline_id, triggered_by)


# ---------------------------------------------------------------------------
# Poll run status
# ---------------------------------------------------------------------------

@router.get("/runs/{run_id}/status", response_model=PipelineRunStatus)
async def get_run_status(
    run_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> PipelineRunStatus:
    role = get_current_role(authorization)
    require_role("viewer", role)

    run = db.query(PipelineRunV2DB).filter(PipelineRunV2DB.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    execution_log = run.execution_log or []
    steps_completed = len([e for e in execution_log if e.get("status") in {"success", "skipped"}])
    metrics = run.metrics or {}
    total_steps = metrics.get("steps_total", len(execution_log))

    return PipelineRunStatus(
        run_id=run_id,
        pipeline_id=run.pipeline_id,
        status=run.status,
        triggered_by=run.triggered_by,
        started_at=run.started_at.isoformat() if run.started_at else None,
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
        error_message=run.error_message,
        steps_completed=steps_completed,
        total_steps=int(total_steps) if total_steps else 0,
        output_snapshot_url=run.output_snapshot_url,
    )


# ---------------------------------------------------------------------------
# Run history
# ---------------------------------------------------------------------------

@router.get("/{pipeline_id}/runs")
async def list_pipeline_runs(
    pipeline_id: str,
    limit: int = 20,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    role = get_current_role(authorization)
    require_role("viewer", role)

    runs = (
        db.query(PipelineRunV2DB)
        .filter(PipelineRunV2DB.pipeline_id == pipeline_id)
        .order_by(PipelineRunV2DB.created_at.desc())
        .limit(max(1, min(100, limit)))
        .all()
    )

    result = []
    for r in runs:
        log = r.execution_log or []
        steps_ok = len([e for e in log if e.get("status") == "success"])
        result.append(
            {
                "run_id": r.id,
                "status": r.status,
                "triggered_by": r.triggered_by,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "duration_ms": (
                    int(
                        (r.completed_at - r.started_at).total_seconds() * 1000
                    )
                    if r.completed_at and r.started_at
                    else None
                ),
                "steps_completed": steps_ok,
                "error_message": r.error_message,
                "output_snapshot_url": r.output_snapshot_url,
            }
        )
    return result


# ---------------------------------------------------------------------------
# Schedule management
# ---------------------------------------------------------------------------

@router.get("/{pipeline_id}/schedule", response_model=PipelineScheduleResponse | None)
async def get_schedule(
    pipeline_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> PipelineScheduleResponse | None:
    role = get_current_role(authorization)
    require_role("viewer", role)

    sched = (
        db.query(PipelineScheduleDB)
        .filter(PipelineScheduleDB.pipeline_id == pipeline_id)
        .first()
    )
    if not sched:
        return None
    return _sched_to_resp(sched)


@router.post("/{pipeline_id}/schedule", response_model=PipelineScheduleResponse)
async def create_or_update_schedule(
    pipeline_id: str,
    body: PipelineScheduleCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> PipelineScheduleResponse:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization) or "system"

    pipeline = db.query(PipelineV2DB).filter(PipelineV2DB.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    sched = (
        db.query(PipelineScheduleDB)
        .filter(PipelineScheduleDB.pipeline_id == pipeline_id)
        .first()
    )
    next_run = _compute_next_run(body.cron_expression, body.timezone) if body.is_active else None

    if sched:
        sched.cron_expression = body.cron_expression
        sched.timezone = body.timezone
        sched.is_active = body.is_active
        sched.auto_refresh_on_upload = body.auto_refresh_on_upload
        sched.next_run_at = next_run
    else:
        sched = PipelineScheduleDB(
            id=str(uuid.uuid4()),
            pipeline_id=pipeline_id,
            user_id=user_id,
            cron_expression=body.cron_expression,
            timezone=body.timezone,
            is_active=body.is_active,
            auto_refresh_on_upload=body.auto_refresh_on_upload,
            next_run_at=next_run,
        )
        db.add(sched)

    db.commit()
    db.refresh(sched)
    return _sched_to_resp(sched)


def _sched_to_resp(sched: PipelineScheduleDB) -> PipelineScheduleResponse:
    return PipelineScheduleResponse(
        id=sched.id,
        pipeline_id=sched.pipeline_id,
        user_id=sched.user_id,
        cron_expression=sched.cron_expression,
        timezone=sched.timezone,
        is_active=sched.is_active,
        last_run_at=sched.last_run_at.isoformat() if sched.last_run_at else None,
        next_run_at=sched.next_run_at.isoformat() if sched.next_run_at else None,
        auto_refresh_on_upload=sched.auto_refresh_on_upload,
        created_at=sched.created_at.isoformat() if sched.created_at else "",
    )


def _compute_next_run(cron_expression: str, tz_name: str) -> datetime | None:
    try:
        import pytz
        from croniter import croniter
        tz = pytz.timezone(tz_name)
        now_local = datetime.now(tz)
        it = croniter(cron_expression, now_local)
        nxt = it.get_next(datetime)
        return nxt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        return None
