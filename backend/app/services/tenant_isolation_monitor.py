from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from apscheduler.triggers.cron import CronTrigger

from ..config import settings
from ..db import SessionLocal
from ..services.events import emit_event
from ..services.tenant_isolation_audit import generate_tenant_isolation_report


_last_run_status: dict[str, Any] = {
    "status": "never",
    "started_at": None,
    "finished_at": None,
    "total_records_scanned": 0,
    "total_violations": 0,
    "violations_by_category": {},
    "webhook_deliveries": 0,
    "error": None,
}


def schedule_tenant_isolation_job(scheduler) -> None:
    if not settings.tenant_isolation_monitor_enabled:
        return
    hour = max(0, min(23, int(settings.tenant_isolation_monitor_hour)))
    minute = max(0, min(59, int(settings.tenant_isolation_monitor_minute)))
    scheduler.add_job(
        run_tenant_isolation_verification_job,
        CronTrigger(hour=hour, minute=minute, timezone=timezone.utc),
        id="tenant-isolation-monitor",
        replace_existing=True,
    )


def run_tenant_isolation_verification_job() -> dict[str, Any]:
    started_at = datetime.now(timezone.utc)
    _last_run_status.update(
        {
            "status": "running",
            "started_at": started_at.isoformat(),
            "finished_at": None,
            "error": None,
        }
    )

    db = SessionLocal()
    try:
        sample_limit = max(1, min(500, int(settings.tenant_isolation_monitor_violation_sample_limit)))
        report = generate_tenant_isolation_report(db, limit=sample_limit)

        deliveries: list[str] = []
        if report.total_violations > 0:
            deliveries = emit_event(
                "governance.tenant_isolation.violation",
                {
                    "checked_at": report.checked_at,
                    "total_records_scanned": report.total_records_scanned,
                    "total_violations": report.total_violations,
                    "violations_by_category": report.violations_by_category,
                    "violations": [violation.dict() for violation in report.violations],
                },
            )

        finished_at = datetime.now(timezone.utc)
        _last_run_status.update(
            {
                "status": "ok",
                "finished_at": finished_at.isoformat(),
                "total_records_scanned": report.total_records_scanned,
                "total_violations": report.total_violations,
                "violations_by_category": report.violations_by_category,
                "webhook_deliveries": len(deliveries),
                "error": None,
            }
        )
        return dict(_last_run_status)
    except Exception as exc:
        _last_run_status.update(
            {
                "status": "error",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "error": str(exc),
            }
        )
        return dict(_last_run_status)
    finally:
        db.close()


def get_tenant_isolation_monitor_status() -> dict[str, Any]:
    return dict(_last_run_status)