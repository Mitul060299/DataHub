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

from ..config.plan_limits import get_limits, USAGE_FIELD_LABELS

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
            "SELECT api_calls, pipeline_runs, datasets_uploaded, storage_bytes_used "
            "FROM user_usage WHERE user_id = :uid AND period = :period"
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
        }
    return {
        "period": period,
        "api_calls": row.api_calls,
        "pipeline_runs": row.pipeline_runs,
        "datasets_uploaded": row.datasets_uploaded,
        "storage_bytes_used": row.storage_bytes_used,
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
