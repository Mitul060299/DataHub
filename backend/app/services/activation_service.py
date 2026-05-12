"""Activation milestone tracking service.

Records the first time a user completes a key funnel step, both in the
database (for email cohort queries) and via a server-side PostHog event
(so adblockers don't drop activation data).

Usage
-----
>>> from app.services.activation_service import record_milestone
>>> record_milestone(user_id, "dataset_loaded", db, email="user@example.com")

Idempotent: calling with the same milestone twice is a no-op after the
first call has written a non-null timestamp.

Milestones
----------
  workspace_first_visit   — user opened /workspace for the first time
  dataset_loaded          — first dataset loaded (upload or sample)
  ai_prompt_submitted     — first AI chat message sent
  aha_first_ai_answer     — first AI response rendered (activation event)
  pipeline_step_approved  — first pipeline step approved/saved
  result_exported         — first export or share action
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Maps milestone name → users column name
_MILESTONE_COLUMNS: dict[str, str] = {
    "dataset_loaded":          "first_dataset_at",
    "aha_first_ai_answer":     "first_ai_answer_at",
    "pipeline_step_approved":  "first_pipeline_step_at",
    "result_exported":         "first_export_at",
}

# Milestones that don't have a dedicated column but we still emit to PostHog
_POSTHOG_ONLY = {"workspace_first_visit", "ai_prompt_submitted"}

VALID_MILESTONES = set(_MILESTONE_COLUMNS) | _POSTHOG_ONLY


def record_milestone(
    user_id: str,
    milestone: str,
    db: Session,
    email: str | None = None,
) -> bool:
    """Record *milestone* for *user_id*.

    Returns True if this was the first time (column was NULL / new event),
    False if already recorded (no-op).
    """
    if milestone not in VALID_MILESTONES:
        logger.warning("activation: unknown milestone %r for user %s", milestone, user_id)
        return False

    first_time = True

    # ── Persist to DB if there's a column for this milestone ─────────────────
    col = _MILESTONE_COLUMNS.get(milestone)
    if col:
        from ..models_db import User
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            # Fallback: look up by username (for auth flows that pass email)
            if email:
                user = db.query(User).filter(User.username == email).first()
        if user:
            try:
                existing = getattr(user, col, None)
            except Exception as exc:
                # Migration 0070 hasn't applied yet — column is missing.
                # Silently skip the DB write but still emit the PostHog event.
                logger.warning("activation: column %s missing (migration 0070 not applied?): %s", col, exc)
                try:
                    db.rollback()
                except Exception:
                    pass
                existing = None
                col = None  # prevent the setattr/commit branch below
            if col is None:
                pass
            elif existing is not None:
                first_time = False  # already recorded
            else:
                setattr(user, col, datetime.now(timezone.utc))
                try:
                    db.commit()
                except Exception as exc:
                    db.rollback()
                    logger.warning("activation: db commit failed for %s/%s: %s", user_id, milestone, exc)
                    first_time = False

    # ── Server-side PostHog event ─────────────────────────────────────────────
    # Only emit for first-time events so the funnel doesn't get inflated.
    if first_time:
        _emit_posthog(user_id, milestone, email)

    return first_time


def _emit_posthog(user_id: str, milestone: str, email: str | None) -> None:
    """Fire a server-side PostHog capture.  Never raises."""
    api_key = os.getenv("VITE_POSTHOG_API_KEY") or os.getenv("POSTHOG_API_KEY", "")
    if not api_key:
        return
    try:
        import posthog as ph  # type: ignore

        ph.api_key = api_key
        ph.host = "https://app.posthog.com"
        props: dict = {"milestone": milestone, "$lib": "datahub-server"}
        if email:
            props["email"] = email
        ph.capture(distinct_id=user_id, event=milestone, properties=props)
    except Exception as exc:
        logger.debug("activation: posthog emit failed for %s/%s: %s", user_id, milestone, exc)
