"""
cron.py
=======
Endpoint called by Render Cron Job every minute.
Protected by X-Cron-Secret header (not user auth).

GET /api/cron/run-scheduled-pipelines
"""

import hmac
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
    Triggered by GitHub Actions every 5 minutes (and optionally Render Cron Job).
    Finds all active schedules where next_run_at <= now() and triggers pipeline_runner.
    """
    if not x_cron_secret or not hmac.compare_digest(x_cron_secret, settings.cron_secret):
        raise HTTPException(status_code=403, detail="Invalid cron secret")

    try:
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
    except Exception as exc:
        logger.exception("cron: run-scheduled-pipelines failed: %s", exc)
        # Return 200 so the GitHub Actions workflow does not fail and spam email.
        # The full traceback is visible in Render logs.
        return {
            "ok": False,
            "triggered_count": 0,
            "triggered": [],
            "error": str(exc),
        }


@router.post("/weekly-digest")
async def send_weekly_digest(
    background_tasks: BackgroundTasks,
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
    db: Session = Depends(get_db),
) -> dict:
    """Triggered once a week (e.g. Monday 09:00 UTC via Render Cron Job).
    Sends a per-user activity digest email to all opted-in users."""
    if not x_cron_secret or not hmac.compare_digest(x_cron_secret, settings.cron_secret):
        raise HTTPException(status_code=403, detail="Invalid cron secret")

    from ..services.weekly_digest_service import send_weekly_digests

    def _run():
        result = send_weekly_digests(db)
        logger.info("weekly-digest: %s", result)

    background_tasks.add_task(_run)
    return {"ok": True, "message": "Weekly digest enqueued"}


@router.post("/activation-nudge")
async def send_activation_nudge(
    background_tasks: BackgroundTasks,
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
    db: Session = Depends(get_db),
) -> dict:
    """Triggered hourly.  Computes retention cohorts and sends lifecycle emails.

    Cohorts handled (each email is idempotent — sent at most once per user):
      ghost              — signed up but never opened workspace
      stalled_upload     — uploaded data but no first AI answer in 24-72 h
      day3_no_aha        — 3 days since first dataset, still no AI answer
      day7_winback       — 7 days since first dataset, still no AI answer
      activated_dormant  — got first AI answer but inactive for 7+ days
    """
    if not x_cron_secret or not hmac.compare_digest(x_cron_secret, settings.cron_secret):
        raise HTTPException(status_code=403, detail="Invalid cron secret")

    from ..services.activation_email_service import run_activation_nudge

    def _run():
        result = run_activation_nudge(db)
        logger.info("activation-nudge: %s", result)

    background_tasks.add_task(_run)
    return {"ok": True, "message": "Activation nudge enqueued"}


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
