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
    # Use raw SQL because the milestone columns are NOT mapped on the User
    # model (see models_db.py for rationale). All errors (including missing
    # column when migration 0070 hasn't applied) are swallowed so the
    # PostHog emit still fires.
    col = _MILESTONE_COLUMNS.get(milestone)
    if col:
        # Resolve user_id from email if needed
        resolved_user_id = user_id
        if not resolved_user_id and email:
            try:
                from sqlalchemy import text as _sql
                row = db.execute(
                    _sql("SELECT id FROM users WHERE username = :u LIMIT 1"),
                    {"u": email},
                ).first()
                resolved_user_id = row[0] if row else ""
            except Exception:
                try:
                    db.rollback()
                except Exception:
                    pass

        if resolved_user_id:
            try:
                from sqlalchemy import text as _sql
                # Only set if currently NULL (idempotent + tells us first_time)
                result = db.execute(
                    _sql(f"UPDATE users SET {col} = now() WHERE id = :uid AND {col} IS NULL"),
                    {"uid": resolved_user_id},
                )
                db.commit()
                # rowcount == 0 means the column was already set (or row missing)
                if getattr(result, "rowcount", 0) == 0:
                    first_time = False
            except Exception as exc:
                logger.warning(
                    "activation: raw UPDATE failed for %s/%s (migration 0070 not applied?): %s",
                    resolved_user_id, milestone, exc,
                )
                try:
                    db.rollback()
                except Exception:
                    pass
                # Don't suppress the PostHog event — emit anyway as first_time

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
