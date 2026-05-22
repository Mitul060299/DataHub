"""
pipeline_refresh.py
===================
Endpoints (exposed under /pipelines; the reverse proxy strips the /api prefix
clients send, so any router registered with `/api/...` is unreachable):
  GET  /pipelines/runs/{run_id}/status — poll run status
  GET  /pipelines/{pipeline_id}/schedule — get schedule
  POST /pipelines/{pipeline_id}/schedule — create/update schedule

NOTE: POST /{pipeline_id}/run and GET /{pipeline_id}/runs are handled
by pipelines.py (the original CRUD router) and are not duplicated here.
"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import PipelineRunStatus, PipelineScheduleCreate, PipelineScheduleResponse
from ..models_db import PipelineRunV2DB, PipelineScheduleDB, PipelineV2DB
from ..security import get_current_user_id, get_current_role, require_role

router = APIRouter(prefix="/pipelines", tags=["pipeline_refresh"])

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
        sched.write_back_config = body.write_back_config or None
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
            write_back_config=body.write_back_config or None,
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
        write_back_config=sched.write_back_config or None,
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
