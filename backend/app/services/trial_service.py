"""
trial_service.py
================
15-day opt-in free trial state machine.

Trial rules (per product spec):
  1. Trial is NEVER auto-activated on signup. The user must explicitly opt in
     by clicking "Start free trial" on the Upgrade screen.
  2. Trial duration is 15 days from activation timestamp.
  3. While active, the trial grants the chosen paid plan's full feature set
     (with the same monthly fair-usage limits as the paid plan itself).
  4. Exactly ONE trial per account (``users.trial_used`` is sticky-true once
     a trial starts; cannot be re-used even after expiry).
  5. Disposable / throwaway email domains are blocked from starting trials.
  6. On expiry: if a payment method is on file the user is auto-converted
     to the paid plan via the normal subscription flow; otherwise they fall
     back to Free. This module only flips the local flags — payment capture
     is handled by ``billing.py``.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models_db import User as UserDB
from . import billing_repository
from .disposable_emails import is_disposable_email

logger = logging.getLogger(__name__)

TRIAL_DURATION_DAYS = 15
TRIAL_ELIGIBLE_PLANS: frozenset[str] = frozenset({"Starter", "Professional", "Team", "Business"})


def _now() -> datetime:
    return datetime.now(timezone.utc)


def active_trial_plan(user_id: str, db: Session) -> str | None:
    """Return the canonical plan name granted by an active trial, or None."""
    if not user_id:
        return None
    row = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not row or not row.trial_plan or not row.trial_ends_at:
        return None
    ends_at = row.trial_ends_at
    # SQLAlchemy returns naive datetimes from some Postgres drivers; normalise.
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    if ends_at <= _now():
        return None
    return billing_repository.to_canonical_plan(row.trial_plan)


def get_trial_status(user_id: str, db: Session) -> dict[str, Any]:
    """Return a JSON-serialisable trial status block for the given user."""
    row = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not row:
        return {
            "active": False,
            "used": False,
            "plan": None,
            "started_at": None,
            "ends_at": None,
            "days_remaining": 0,
            "payment_method_on_file": False,
        }
    ends_at = row.trial_ends_at
    started_at = row.trial_started_at
    if ends_at and ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    if started_at and started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)

    active = bool(ends_at and ends_at > _now() and row.trial_plan)
    days_remaining = 0
    if active and ends_at:
        delta = ends_at - _now()
        days_remaining = max(0, delta.days + (1 if delta.seconds > 0 else 0))

    return {
        "active": active,
        "used": bool(row.trial_used),
        "plan": row.trial_plan if active else None,
        "started_at": started_at.isoformat() if started_at else None,
        "ends_at": ends_at.isoformat() if ends_at else None,
        "days_remaining": days_remaining,
        "payment_method_on_file": bool(row.payment_method_on_file),
    }


def start_trial(user_id: str, plan: str, db: Session) -> dict[str, Any]:
    """Activate a 15-day trial for ``user_id`` on ``plan``.

    Raises HTTPException on:
      * unknown user
      * plan not eligible for trial
      * trial already used (one-per-user)
      * already on a paid subscription
      * disposable email address
    """
    canonical = billing_repository.to_canonical_plan(plan)
    if canonical not in TRIAL_ELIGIBLE_PLANS:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "trial_plan_invalid",
                "message": (
                    "Trials are available for Starter, Professional and Team "
                    "plans only."
                ),
            },
        )

    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.trial_used:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "trial_already_used",
                "message": "You have already used your free trial.",
            },
        )

    # Block users who already have a real paid subscription — they don't
    # need (and shouldn't game) a trial.
    existing = billing_repository.get_active_subscription(user_id)
    if existing:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "subscription_exists",
                "message": "You already have an active subscription.",
            },
        )

    # Abuse prevention — disposable email domain check.
    if is_disposable_email(user.username or ""):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "disposable_email_blocked",
                "message": (
                    "Free trials are not available for disposable email "
                    "addresses. Please use a permanent business or personal "
                    "email."
                ),
            },
        )

    now = _now()
    user.trial_plan = canonical
    user.trial_started_at = now
    user.trial_ends_at = now + timedelta(days=TRIAL_DURATION_DAYS)
    user.trial_used = True
    db.commit()
    db.refresh(user)

    logger.info(
        "trial.started user=%s plan=%s ends_at=%s",
        user_id, canonical, user.trial_ends_at.isoformat(),
    )

    return get_trial_status(user_id, db)


def mark_payment_method_on_file(user_id: str, db: Session) -> None:
    """Idempotent flip used by billing webhooks once a card is captured."""
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user or user.payment_method_on_file:
        return
    user.payment_method_on_file = True
    db.commit()
