"""
usage_service.py
================
Tracks and enforces monthly per-user usage counters stored in Postgres.

Counters reset at the start of each calendar month (period = YYYY-MM).
All functions accept a SQLAlchemy Session and raise HTTPException(403)
when a hard limit is exceeded so callers need no extra conditional logic.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Literal

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from .plan_limits import get_limits, USAGE_FIELD_LABELS

logger = logging.getLogger(__name__)

UsageField = Literal[
    "api_calls",
    "pipeline_runs",
    "datasets_uploaded",
]

# Maps local counter name → plan_limits key
_FIELD_TO_LIMIT_KEY: dict[str, str] = {
    "api_calls": "api_calls_per_month",
    "pipeline_runs": "pipeline_runs_per_month",
    "datasets_uploaded": "datasets_per_month",
}


def _current_period() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m")


def get_usage(user_id: str, db: Session, period: str | None = None) -> dict:
    """Return current usage counters for a user in the given period."""
    period = period or _current_period()
    row = db.execute(
        text(
            "SELECT api_calls, pipeline_runs, datasets_uploaded, storage_bytes_used,"
            " COALESCE(data_scanned_bytes, 0) AS data_scanned_bytes"
            " FROM user_usage WHERE user_id = :uid AND period = :period"
        ),
        {"uid": user_id, "period": period},
    ).fetchone()
    if row is None:
        return {
            "period": period,
            "api_calls": 0,
            "pipeline_runs": 0,
            "datasets_uploaded": 0,
            "storage_bytes_used": 0,
            "data_scanned_bytes": 0,
        }
    return {
        "period": period,
        "api_calls": row.api_calls,
        "pipeline_runs": row.pipeline_runs,
        "datasets_uploaded": row.datasets_uploaded,
        "storage_bytes_used": row.storage_bytes_used,
        "data_scanned_bytes": row.data_scanned_bytes,
    }


def increment_usage(
    user_id: str,
    field: UsageField,
    db: Session,
    amount: int = 1,
) -> None:
    """Atomically increment a usage counter. Creates the row if absent."""
    period = _current_period()
    try:
        db.execute(
            text(
                f"""
                INSERT INTO user_usage (user_id, period, {field})
                VALUES (:uid, :period, :amount)
                ON CONFLICT (user_id, period)
                DO UPDATE SET {field} = user_usage.{field} + :amount,
                              updated_at = NOW()
                """
            ),
            {"uid": user_id, "period": period, "amount": amount},
        )
        db.commit()
    except Exception as exc:
        logger.warning("Failed to increment usage %s for %s: %s", field, user_id, exc)
        db.rollback()


def update_storage_bytes(user_id: str, db: Session) -> None:
    """Recalculate and store the current cumulative storage used by this user.

    Reads the actual sum from DatasetMetaDB (file_size_bytes, falling back to
    compressed_size_bytes). This covers all upload paths including CSV/Parquet
    uploads and connector-sourced datasets.
    """
    from ..models_db import DatasetMetaDB
    period = _current_period()
    try:
        rows = (
            db.query(DatasetMetaDB.file_size_bytes, DatasetMetaDB.compressed_size_bytes)
            .filter(DatasetMetaDB.user_id == user_id)
            .all()
        )
        total_bytes = sum(
            (r.file_size_bytes or r.compressed_size_bytes or 0) for r in rows
        )
        db.execute(
            text(
                """
                INSERT INTO user_usage (user_id, period, storage_bytes_used)
                VALUES (:uid, :period, :total)
                ON CONFLICT (user_id, period)
                DO UPDATE SET storage_bytes_used = :total,
                              updated_at = NOW()
                """
            ),
            {"uid": user_id, "period": period, "total": total_bytes},
        )
        db.commit()
    except Exception as exc:
        logger.warning("Failed to update storage bytes for %s: %s", user_id, exc)
        db.rollback()


def enforce_usage_limit(
    user_id: str,
    plan: str,
    field: UsageField,
    db: Session,
) -> None:
    """
    Check whether the user has hit the monthly limit for *field*.
    Raises HTTPException(403) with a structured payload if exceeded.
    """
    limit_key = _FIELD_TO_LIMIT_KEY[field]
    limits = get_limits(plan)
    cap: int = limits[limit_key]  # type: ignore[literal-required]
    if cap == -1:
        return  # unlimited

    usage = get_usage(user_id, db)
    current: int = usage.get(field, 0)  # type: ignore[arg-type]

    # Fire a 80% usage warning email (best-effort, non-blocking)
    if cap > 0 and current >= int(cap * 0.80) and current < cap:
        try:
            from ..services.email_service import send_usage_warning
            from ..models_db import User as UserDB
            user_row = db.query(UserDB).filter(UserDB.id == user_id).first()
            prefs: dict = dict(user_row.notification_prefs or {}) if user_row else {}
            if prefs.get("usage_warning", True):  # default ON
                to_email = (user_row.username if user_row else None) or user_id
                send_usage_warning(
                    to=to_email,
                    username=to_email,
                    field=field,
                    used=current,
                    cap=cap,
                    plan=plan,
                )
        except Exception as exc:
            logger.debug("Usage warning email skipped: %s", exc)

    if current >= cap:
        label = USAGE_FIELD_LABELS.get(limit_key, field)
        raise HTTPException(
            status_code=403,
            detail={
                "error": "usage_limit_exceeded",
                "field": field,
                "limit": cap,
                "used": current,
                "plan": plan,
                "message": (
                    f"You have reached your {plan} plan limit of {cap} {label} "
                    f"this month. Upgrade to continue."
                ),
            },
        )


def increment_scan_bytes(user_id: str, bytes_scanned: int, db: Session) -> None:
    """Atomically add bytes_scanned to data_scanned_bytes for the current period."""
    if bytes_scanned <= 0:
        return
    period = _current_period()
    try:
        db.execute(
            text(
                """
                INSERT INTO user_usage (user_id, period, data_scanned_bytes)
                VALUES (:uid, :period, :amount)
                ON CONFLICT (user_id, period)
                DO UPDATE SET data_scanned_bytes = user_usage.data_scanned_bytes + :amount,
                              updated_at = NOW()
                """
            ),
            {"uid": user_id, "period": period, "amount": bytes_scanned},
        )
        db.commit()
    except Exception as exc:
        logger.warning("Failed to increment scan bytes for %s: %s", user_id, exc)
        db.rollback()


def enforce_scan_limit(user_id: str, plan: str, db: Session) -> None:
    """Raise HTTP 403 if the user has exhausted their monthly data scan quota."""
    limits = get_limits(plan)
    cap: int = limits.get("data_scan_bytes_per_month", -1)  # type: ignore[call-overload]
    if cap == -1:
        return  # unlimited

    period = _current_period()
    row = db.execute(
        text(
            "SELECT COALESCE(data_scanned_bytes, 0) AS scanned "
            "FROM user_usage WHERE user_id = :uid AND period = :period"
        ),
        {"uid": user_id, "period": period},
    ).fetchone()
    current = row.scanned if row else 0

    cap_gb = round(cap / (1024 ** 3))

    # 80% warning email — same pattern as enforce_usage_limit
    if cap > 0 and current >= int(cap * 0.80) and current < cap:
        try:
            from ..services.email_service import send_usage_warning
            from ..models_db import User as UserDB
            user_row = db.query(UserDB).filter(UserDB.id == user_id).first()
            prefs: dict = dict(user_row.notification_prefs or {}) if user_row else {}
            if prefs.get("usage_warning", True):
                to_email = (user_row.username if user_row else None) or user_id
                send_usage_warning(
                    to=to_email,
                    username=to_email,
                    field="data_scanned_bytes",
                    used=current,
                    cap=cap,
                    plan=plan,
                )
        except Exception as exc:
            logger.debug("Scan warning email skipped: %s", exc)

    if current >= cap:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "scan_limit_exceeded",
                "limit_bytes": cap,
                "used_bytes": current,
                "plan": plan,
                "message": (
                    f"You have reached your {plan} plan data scan limit of {cap_gb} GB "
                    f"this month. Upgrade to increase your limit."
                ),
            },
        )
