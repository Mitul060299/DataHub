"""
cron.py
=======
Endpoint called by Render Cron Job every minute.
Protected by X-Cron-Secret header (not user auth).

GET /api/cron/run-scheduled-pipelines
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models_db import PipelineScheduleDB
from ..services.pipeline_runner import run_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cron", tags=["cron"])


@router.get("/run-scheduled-pipelines")
async def run_scheduled_pipelines(
    background_tasks: BackgroundTasks,
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
    db: Session = Depends(get_db),
) -> dict:
    """
    Triggered by Render Cron Job every minute.
    Finds all active schedules where next_run_at <= now() and triggers pipeline_runner.
    """
    if not x_cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Invalid cron secret")

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    due_schedules = (
        db.query(PipelineScheduleDB)
        .filter(
            PipelineScheduleDB.is_active == True,  # noqa: E712
            PipelineScheduleDB.next_run_at <= now_utc,
        )
        .all()
    )

    triggered: list[str] = []

    for sched in due_schedules:
        # Update times before triggering so we don't double-fire
        sched.last_run_at = now_utc
        sched.next_run_at = _compute_next_run(sched.cron_expression, sched.timezone)
        triggered.append(sched.pipeline_id)

    if due_schedules:
        db.commit()

    # Kick off background tasks (non-blocking)
    for sched in due_schedules:
        background_tasks.add_task(
            run_pipeline,
            sched.pipeline_id,
            "scheduled",
        )
        logger.info(
            "cron: triggered pipeline %s (schedule %s)",
            sched.pipeline_id,
            sched.id,
        )

    return {
        "ok": True,
        "triggered_count": len(triggered),
        "triggered": triggered,
        "evaluated_at": now_utc.isoformat(),
    }


def _compute_next_run(cron_expression: str, tz_name: str) -> datetime | None:
    try:
        import pytz
        from croniter import croniter
        tz = pytz.timezone(tz_name)
        now_local = datetime.now(tz)
        it = croniter(cron_expression, now_local)
        nxt = it.get_next(datetime)
        return nxt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception as exc:
        logger.warning("cron: could not compute next_run for '%s': %s", cron_expression, exc)
        return None
