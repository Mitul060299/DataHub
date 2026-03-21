"""Weekly digest email service.

Builds a per-user summary of the last 7 days and sends it via Resend.
Called by POST /api/cron/weekly-digest (protected by X-Cron-Secret).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _week_ago() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=7)


def _build_digest_for_user(user_id: str, db: Session) -> Optional[dict]:
    """Collect stats for one user over the last 7 days. Returns None if nothing to report."""
    from ..models_db import DatasetMetaDB, PipelineRunV2DB

    since = _week_ago()

    # Datasets uploaded
    datasets = (
        db.query(DatasetMetaDB)
        .filter(
            DatasetMetaDB.user_id == user_id,
            DatasetMetaDB.created_at >= since,
        )
        .all()
    )
    dataset_count = len(datasets)
    total_rows = sum((d.row_count or 0) for d in datasets)

    # Pipeline runs
    runs = (
        db.query(PipelineRunV2DB)
        .filter(
            PipelineRunV2DB.user_id == user_id,
            PipelineRunV2DB.started_at >= since,
        )
        .all()
    )
    run_count = len(runs)
    runs_ok = sum(1 for r in runs if r.status == "completed")
    runs_fail = sum(1 for r in runs if r.status == "failed")

    if dataset_count == 0 and run_count == 0:
        return None  # Nothing to report — skip email

    return {
        "dataset_count": dataset_count,
        "total_rows": total_rows,
        "run_count": run_count,
        "runs_ok": runs_ok,
        "runs_fail": runs_fail,
    }


def _build_html(username: str, stats: dict, app_url: str = "https://datahub.org.in") -> str:
    ds = stats["dataset_count"]
    rows = stats["total_rows"]
    runs = stats["run_count"]
    ok = stats["runs_ok"]
    fail = stats["runs_fail"]

    def _row(label: str, value: str, color: str = "#e8e8f0") -> str:
        return (
            f"<tr>"
            f"<td style='padding:8px 12px;color:#8888a0;font-size:13px;border-bottom:1px solid #1a1a22'>{label}</td>"
            f"<td style='padding:8px 12px;color:{color};font-size:13px;font-weight:600;border-bottom:1px solid #1a1a22;text-align:right'>{value}</td>"
            f"</tr>"
        )

    return f"""<!DOCTYPE html>
<html>
<body style="background:#0a0a0c;color:#e8e8f0;font-family:Inter,sans-serif;padding:32px;margin:0">
  <div style="max-width:540px;margin:0 auto">
    <h2 style="color:#5B6AF0;font-size:20px;margin-bottom:4px">DataHub</h2>
    <p style="color:#44445a;font-size:12px;margin-top:0 margin-bottom:24px">Your weekly activity digest</p>

    <h3 style="color:#e8e8f0;font-size:16px;margin-bottom:12px">Last 7 days — {username}</h3>

    <table style="width:100%;border-collapse:collapse;background:#111115;border:1px solid #22222a;border-radius:8px;overflow:hidden">
      {_row("Datasets uploaded", str(ds))}
      {_row("Total rows ingested", f"{rows:,}")}
      {_row("Pipeline runs", str(runs))}
      {_row("Successful runs", str(ok), "#22b573")}
      {_row("Failed runs", str(fail), "#c94040" if fail else "#8888a0")}
    </table>

    <a href="{app_url}/home"
       style="display:inline-block;margin-top:20px;background:#5B6AF0;color:#fff;text-decoration:none;
              padding:10px 22px;border-radius:7px;font-size:13px;font-weight:600">
      Open DataHub →
    </a>

    <p style="color:#2a2a38;font-size:11px;margin-top:28px">
      You are receiving this because weekly digest is enabled.
      Visit <a href="{app_url}/settings" style="color:#44445a">settings</a> to opt out.
    </p>
  </div>
</body>
</html>"""


def send_weekly_digests(db: Session) -> dict:
    """Send weekly digest to every active user who has opted in (default: on).

    Returns a summary dict: {sent, skipped_no_activity, skipped_opted_out, errors}.
    """
    from ..models_db import User as UserDB
    from ..services.email_service import send_email

    users = db.query(UserDB).all()

    sent = 0
    skipped_no_activity = 0
    skipped_opted_out = 0
    errors = 0

    for user in users:
        try:
            prefs: dict = dict(user.notification_prefs or {})
            if not prefs.get("weekly_digest", True):  # default ON
                skipped_opted_out += 1
                continue

            to_email = user.username or user.id
            if not to_email or "@" not in to_email:
                skipped_no_activity += 1
                continue

            stats = _build_digest_for_user(user.id, db)
            if stats is None:
                skipped_no_activity += 1
                continue

            html = _build_html(to_email, stats)
            ok = send_email(
                to=to_email,
                subject="DataHub — Your weekly activity digest",
                html=html,
            )
            if ok:
                sent += 1
            else:
                errors += 1
        except Exception as exc:
            logger.warning("Weekly digest error for user %s: %s", user.id, exc)
            errors += 1

    return {
        "sent": sent,
        "skipped_no_activity": skipped_no_activity,
        "skipped_opted_out": skipped_opted_out,
        "errors": errors,
    }
