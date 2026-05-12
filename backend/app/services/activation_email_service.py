"""Activation lifecycle email service.

Computes which users belong to each retention cohort and sends the
appropriate email.  Called hourly by POST /api/cron/activation-nudge.

Cohorts
-------
  ghost              — signed up but never opened workspace (first_dataset_at IS NULL AND
                       created_at < 24h ago... but we don't have created_at on user;
                       we use absence of workspace_first_visit milestone)
  stalled_upload     — loaded a dataset but first_ai_answer_at IS NULL, 24-48h since
                       first_dataset_at
  day3_no_aha        — first_ai_answer_at IS NULL, 3 days since signup (approximated by
                       first_dataset_at or email log sent_at for welcome email)
  day7_winback       — first_ai_answer_at IS NULL, 7 days since welcome email sent
  activated_dormant  — has first_ai_answer_at but no event in last 7 days (approximated
                       by first_ai_answer_at > 7 days ago and no login record)

Idempotency
-----------
  Before sending, we check email_log for the (user_id, template) pair.
  If a row already exists we skip.  This means each template is sent at most
  once per user.

Email preferences
-----------------
  Users with email_preferences.lifecycle_emails = FALSE are skipped entirely.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _has_been_sent(user_id: str, template: str, db: Session) -> bool:
    """Return True if this template has already been sent to this user."""
    from ..models_db import EmailLogDB

    row = (
        db.query(EmailLogDB)
        .filter(EmailLogDB.user_id == user_id, EmailLogDB.template == template)
        .first()
    )
    return row is not None


def _record_sent(user_id: str, email: str, template: str, db: Session) -> None:
    """Insert a row into email_log to mark this template as sent."""
    from ..models_db import EmailLogDB

    log = EmailLogDB(user_id=user_id, email=email, template=template)
    db.add(log)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("activation_email: could not record send for %s/%s: %s", user_id, template, exc)


def _opted_in(user_id: str, db: Session) -> bool:
    """Return True unless the user has explicitly opted out of lifecycle emails."""
    from ..models_db import EmailPreferencesDB

    pref = db.query(EmailPreferencesDB).filter(EmailPreferencesDB.user_id == user_id).first()
    if pref is None:
        return True  # default: opted in
    return bool(pref.lifecycle_emails)


def run_activation_nudge(db: Session) -> dict:
    """Main entry-point called by the cron endpoint.

    Returns a summary dict with counts for observability.
    """
    from ..models_db import User, DatasetMetaDB
    from ..services.email_service import (
        send_welcome_email,
        send_ghost_nudge_email,
        send_stalled_upload_email,
        send_day3_education_email,
        send_day7_winback_email,
        send_dormant_email,
    )

    now = _now()
    counts: dict[str, int] = {
        "ghost": 0,
        "stalled_upload": 0,
        "day3_no_aha": 0,
        "day7_winback": 0,
        "dormant": 0,
        "skipped": 0,
    }

    # Load all non-anonymous users
    users = (
        db.query(User)
        .filter(User.username.notlike("anon_%"))
        .all()
    )

    for user in users:
        email = user.username  # username is the email for Supabase-registered users
        if not email or "@" not in email:
            continue
        if not _opted_in(user.id, db):
            counts["skipped"] += 1
            continue

        first_dataset_at = getattr(user, "first_dataset_at", None)
        first_ai_answer_at = getattr(user, "first_ai_answer_at", None)
        display_name = email.split("@")[0]

        # ── GHOST: never loaded a dataset, welcome email sent > 24h ago ────────
        if first_dataset_at is None:
            if _has_been_sent(user.id, "welcome", db):
                # Check if welcome was sent > 24h ago and no dataset yet → ghost nudge
                from ..models_db import EmailLogDB
                welcome_row = (
                    db.query(EmailLogDB)
                    .filter(EmailLogDB.user_id == user.id, EmailLogDB.template == "welcome")
                    .first()
                )
                if welcome_row and (now - welcome_row.sent_at.replace(tzinfo=None)) > timedelta(hours=24):
                    if not _has_been_sent(user.id, "ghost_nudge", db):
                        ok = send_ghost_nudge_email(to=email, username=display_name)
                        if ok:
                            _record_sent(user.id, email, "ghost_nudge", db)
                            counts["ghost"] += 1
            continue  # nothing more to do for this user if no dataset

        # ── STALLED UPLOAD: dataset loaded 24-48h ago, no AI answer yet ────────
        if first_ai_answer_at is None:
            age = now - first_dataset_at.replace(tzinfo=None)
            if timedelta(hours=24) <= age < timedelta(hours=72):
                if not _has_been_sent(user.id, "stalled_upload", db):
                    # Find most recent dataset name
                    latest_ds = (
                        db.query(DatasetMetaDB.name)
                        .filter(DatasetMetaDB.user_id == user.id, DatasetMetaDB.deleted_at.is_(None))
                        .order_by(DatasetMetaDB.created_at.desc())
                        .first()
                    )
                    ds_name = (latest_ds[0] if latest_ds else None) or "your dataset"
                    ok = send_stalled_upload_email(to=email, username=display_name, dataset_name=ds_name)
                    if ok:
                        _record_sent(user.id, email, "stalled_upload", db)
                        counts["stalled_upload"] += 1

            # ── DAY-3: 3 days since first dataset, still no AI answer ──────────
            if age >= timedelta(days=3) and not _has_been_sent(user.id, "day3_education", db):
                ok = send_day3_education_email(to=email, username=display_name)
                if ok:
                    _record_sent(user.id, email, "day3_education", db)
                    counts["day3_no_aha"] += 1

            # ── DAY-7 WIN-BACK: 7 days since first dataset, still no AI answer ─
            if age >= timedelta(days=7) and not _has_been_sent(user.id, "day7_winback", db):
                ok = send_day7_winback_email(to=email, username=display_name)
                if ok:
                    _record_sent(user.id, email, "day7_winback", db)
                    counts["day7_winback"] += 1

        # ── DORMANT: activated but > 7 days since aha (no return login) ────────
        if first_ai_answer_at is not None:
            aha_age = now - first_ai_answer_at.replace(tzinfo=None)
            if aha_age >= timedelta(days=7) and not _has_been_sent(user.id, "dormant", db):
                # Find most recent dataset for the deep-link text
                latest_ds = (
                    db.query(DatasetMetaDB.name)
                    .filter(DatasetMetaDB.user_id == user.id, DatasetMetaDB.deleted_at.is_(None))
                    .order_by(DatasetMetaDB.created_at.desc())
                    .first()
                )
                ds_name = (latest_ds[0] if latest_ds else None) or "your dataset"
                ok = send_dormant_email(to=email, username=display_name, last_dataset=ds_name)
                if ok:
                    _record_sent(user.id, email, "dormant", db)
                    counts["dormant"] += 1

    total = sum(v for k, v in counts.items() if k != "skipped")
    logger.info("activation_nudge: sent=%d counts=%s", total, counts)
    return counts
