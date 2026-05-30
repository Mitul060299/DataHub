from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging
import uuid
from ..db import get_db
from ..models import UserCreate, UserOut, UserProfileOut, UserUsage
from ..models_db import User, DatasetMetaDB, ImportTableDB
from ..security import get_current_role, get_current_subject, get_current_user_id, require_role
from ..services.plan_guard import resolve_user_plan

router = APIRouter(prefix="/users", tags=["users"])

logger = logging.getLogger(__name__)


@router.post("/", response_model=UserOut)
def create_user(
    payload: UserCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> UserOut:
    role = get_current_role(authorization)
    require_role("admin", role)
    user = User(id=str(uuid.uuid4()), username=payload.username, role=payload.role, plan=payload.plan)
    db.add(user)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="User already exists")
    db.refresh(user)
    return UserOut(id=user.id, username=user.username, role=user.role, plan=user.plan)


@router.get("/", response_model=list[UserOut])
def list_users(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    role = get_current_role(authorization)
    require_role("admin", role)
    users = db.query(User).all()
    return [UserOut(id=u.id, username=u.username, role=u.role, plan=u.plan) for u in users]


@router.get("/me", response_model=UserProfileOut)
def get_me(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> UserProfileOut:
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized - no subject found")
    role = get_current_role(authorization)
    user_id = get_current_user_id(authorization)
    
    # Try to find user by username (email) first
    user = db.query(User).filter(User.username == subject).first()
    if not user:
        # New user — they authenticated themselves so they own their account → admin.
        user_id_to_use = user_id if user_id else str(uuid.uuid4())
        user = User(id=user_id_to_use, username=subject, role="admin", plan="Free")
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except Exception as e:
            # Handle duplicate ID edge case
            db.rollback()
            logger.error("Failed to create user with ID %s: %s", user_id_to_use, str(e))
            user = User(id=str(uuid.uuid4()), username=subject, role="admin", plan="Free")
            db.add(user)
            db.commit()
            db.refresh(user)
    # Do NOT auto-upgrade roles. Role is set at creation and can only be changed
    # by an admin via the admin API. Silent promotion was a security bug.
    datasets_used = db.execute(
        text("SELECT COUNT(*) FROM dataset_meta WHERE user_id = :uid AND deleted_at IS NULL"),
        {"uid": user_id or ""},
    ).scalar() or 0
    storage_rows = (
        db.query(DatasetMetaDB.file_size_bytes, DatasetMetaDB.compressed_size_bytes)
        .filter(DatasetMetaDB.user_id == (user_id or ""), DatasetMetaDB.deleted_at.is_(None))
        .all()
    )
    storage_total = sum((r[0] or r[1] or 0) for r in storage_rows)
    usage = UserUsage(
        datasetsUsed=datasets_used,
        storageUsed=storage_total,
        aiMessagesUsed=0,
    )
    effective_plan = resolve_user_plan(db, authorization)

    # Milestone columns are NOT mapped on the User model — fetch via raw SQL.
    # If migration 0070 hasn't applied, the SELECT will fail and we just
    # return None for all four (the profile still loads).
    milestones: dict[str, str | None] = {
        "first_dataset_at": None,
        "first_ai_answer_at": None,
        "first_pipeline_step_at": None,
        "first_export_at": None,
    }
    try:
        from sqlalchemy import text as _sql
        row = db.execute(
            _sql(
                "SELECT first_dataset_at, first_ai_answer_at, "
                "first_pipeline_step_at, first_export_at "
                "FROM users WHERE id = :uid"
            ),
            {"uid": user.id},
        ).first()
        if row:
            for key, value in zip(milestones.keys(), row):
                milestones[key] = value.isoformat() if value else None
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass

    return UserProfileOut(
        id=user.id,
        username=user.username,
        role=user.role,
        plan=effective_plan,
        usage=usage,
        has_completed_onboarding=getattr(user, "has_completed_onboarding", False) or False,
        has_uploaded_first_file=getattr(user, "has_uploaded_first_file", False) or False,
        first_dataset_at=milestones["first_dataset_at"],
        first_ai_answer_at=milestones["first_ai_answer_at"],
        first_pipeline_step_at=milestones["first_pipeline_step_at"],
        first_export_at=milestones["first_export_at"],
    )


@router.patch("/me/onboarding")
def update_onboarding(
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user = db.query(User).filter(User.username == subject).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if "completed" in payload:
        user.has_completed_onboarding = bool(payload["completed"])
    if "uploaded_first_file" in payload:
        user.has_uploaded_first_file = bool(payload["uploaded_first_file"])
    db.commit()
    return {
        "has_completed_onboarding": user.has_completed_onboarding,
        "has_uploaded_first_file": user.has_uploaded_first_file,
    }


@router.post("/me/milestones/{name}")
def record_user_milestone(
    name: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Idempotent endpoint to record an activation milestone for the current user.

    Called by the frontend ``lib/activation.ts`` wrapper so server-side PostHog
    events survive adblockers.  Returns ``{"first_time": true}`` when this is the
    first occurrence, ``{"first_time": false}`` if already recorded.
    """
    from ..services.activation_service import record_milestone, VALID_MILESTONES

    if name not in VALID_MILESTONES:
        raise HTTPException(status_code=400, detail=f"Unknown milestone: {name!r}")

    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = get_current_user_id(authorization) or ""
    # Resolve the actual DB user so we can pass the correct user_id to the service.
    user = db.query(User).filter(User.username == subject).first()
    if user:
        user_id = user.id

    first_time = record_milestone(user_id, name, db, email=subject)
    return {"ok": True, "milestone": name, "first_time": first_time}


def update_my_plan(
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    raise HTTPException(
        status_code=403,
        detail="Direct plan updates are disabled. Use billing checkout to change plans.",
    )


@router.get("/me/usage-stats")
def get_my_usage_stats(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return monthly usage counters + plan caps for the current user."""
    from ..services.usage_service import get_usage
    from ..services.plan_limits import get_limits

    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = get_current_user_id(authorization)
    plan = resolve_user_plan(db, authorization)
    usage = get_usage(user_id, db)
    limits = get_limits(plan)
    return {
        "plan": plan,
        "period": usage["period"],
        "usage": {
            "api_calls": usage["api_calls"],
            "pipeline_runs": usage["pipeline_runs"],
            "datasets_uploaded": usage["datasets_uploaded"],
            "storage_bytes_used": usage["storage_bytes_used"],
            "data_scanned_bytes": usage.get("data_scanned_bytes", 0),
        },
        "limits": {
            "api_calls_per_month": limits["api_calls_per_month"],
            "pipeline_runs_per_month": limits["pipeline_runs_per_month"],
            "datasets_per_month": limits["datasets_per_month"],
            "storage_bytes": limits["storage_bytes"],
            "data_scan_bytes_per_month": limits.get("data_scan_bytes_per_month", -1),
        },
    }


@router.get("/me/audit-log")
def get_my_audit_log(
    action: str | None = None,
    resource_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return paginated audit log entries for the current user, optionally
    filtered by action (e.g. 'dataset.upload') or resource_type ('dataset',
    'pipeline', 'auth')."""
    from ..models_db import AuditLogDB
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")

    query = db.query(AuditLogDB).filter(AuditLogDB.actor == subject)
    if action:
        query = query.filter(AuditLogDB.action == action)
    if resource_type:
        query = query.filter(AuditLogDB.target.like(f"{resource_type}:%"))

    total = query.count()
    rows = (
        query
        .order_by(AuditLogDB.created_at.desc())
        .offset(offset)
        .limit(min(limit, 200))
        .all()
    )

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "entries": [
            {
                "id": r.id,
                "action": r.action,
                "actor": r.actor,
                "target": r.target,
                "metadata": r.metadata_,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


# ── Notification Preferences ──────────────────────────────────────────────────

_DEFAULT_PREFS = {
    "pipeline_complete": True,
    "usage_warning": True,
    "weekly_digest": True,
}


@router.get("/me/notification-preferences")
def get_notification_preferences(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return the current user's email notification preferences."""
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user = db.query(User).filter(User.id == get_current_user_id(authorization)).first()
    stored: dict = (user.notification_prefs or {}) if user else {}
    return {**_DEFAULT_PREFS, **stored}


@router.put("/me/notification-preferences")
def update_notification_preferences(
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Update email notification preferences.

    Accepts any subset of keys; unknown keys are ignored.
    Example body: {"pipeline_complete": false, "usage_warning": true}
    """
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = get_current_user_id(authorization)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    allowed_keys = set(_DEFAULT_PREFS.keys())
    current: dict = dict(user.notification_prefs or {})
    for key in allowed_keys:
        if key in payload:
            current[key] = bool(payload[key])

    user.notification_prefs = current
    db.commit()
    return {**_DEFAULT_PREFS, **current}


@router.delete("/me", status_code=204)
def delete_me(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> None:
    """Permanently delete the current user record and write an audit event."""
    from ..services.audit import audit_store
    from ..models import AuditEntry

    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user = db.query(User).filter(User.username == subject).first()
    if user:
        try:
            audit_store.add(AuditEntry(
                action="account.delete",
                actor=subject,
                target=f"user:{user.id}",
                metadata={"user_id": user.id},
            ))
        except Exception:
            pass
        db.delete(user)
        db.commit()

# -- Email preferences ----------------------------------------------------------

@router.get("/me/email-preferences")
def get_email_preferences(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return the current user's lifecycle email preferences."""
    from ..models_db import EmailPreferencesDB

    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    pref = db.query(EmailPreferencesDB).filter(EmailPreferencesDB.user_id == subject).first()
    if pref is None:
        return {"lifecycle_emails": True, "weekly_digest": True}
    return {"lifecycle_emails": bool(pref.lifecycle_emails), "weekly_digest": bool(pref.weekly_digest)}


@router.patch("/me/email-preferences")
def update_email_preferences(
    body: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Update lifecycle / weekly-digest email opt-in flags."""
    from ..models_db import EmailPreferencesDB
    from datetime import datetime, timezone

    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Resolve email for the prefs row
    from ..models_db import User
    user = db.query(User).filter(User.id == subject).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    pref = db.query(EmailPreferencesDB).filter(EmailPreferencesDB.user_id == subject).first()
    if pref is None:
        pref = EmailPreferencesDB(user_id=subject, email=user.username)
        db.add(pref)

    if "lifecycle_emails" in body:
        pref.lifecycle_emails = bool(body["lifecycle_emails"])
    if "weekly_digest" in body:
        pref.weekly_digest = bool(body["weekly_digest"])
    pref.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.commit()
    return {"ok": True, "lifecycle_emails": bool(pref.lifecycle_emails), "weekly_digest": bool(pref.weekly_digest)}


@router.get("/me/gdpr-export")
def gdpr_export(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return a complete machine-readable export of all data held for the current user.

    GDPR Article 20 — Right to Data Portability.
    The response is a single JSON object with one key per data category.
    """
    from ..models_db import (
        ProjectDB, DatasetMetaDB as _DS, AuditLogDB,
        FeedbackDB, SupportChatSessionDB, SupportChatMessageDB,
        UserUsageDB, ChatSessionDB,
    )
    from ..models_db import PipelineDB, PipelineV2DB, DashboardV2DB
    import datetime

    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = get_current_user_id(authorization) or ""

    user = db.query(User).filter(User.username == subject).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    def _iso(dt):
        return dt.isoformat() if dt else None

    # Profile
    profile = {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "plan": user.plan,
        "has_completed_onboarding": user.has_completed_onboarding,
        "trial_plan": user.trial_plan,
        "trial_started_at": _iso(user.trial_started_at),
        "trial_ends_at": _iso(user.trial_ends_at),
    }

    # Projects
    projects = [
        {"id": p.id, "name": p.name, "description": p.description, "created_at": _iso(p.created_at)}
        for p in db.query(ProjectDB).filter(ProjectDB.user_id == user.id).all()
    ]

    # Datasets (metadata only — no raw data)
    datasets = [
        {
            "id": d.id, "name": d.name, "original_filename": getattr(d, "original_filename", None),
            "file_size_bytes": d.file_size_bytes, "row_count": d.row_count,
            "created_at": _iso(d.created_at), "deleted_at": _iso(d.deleted_at),
        }
        for d in db.query(_DS).filter(_DS.user_id == user.id).all()
    ]

    # Pipelines V1
    try:
        pipelines_v1 = [
            {"id": p.id, "name": p.name, "created_at": _iso(p.created_at)}
            for p in db.query(PipelineDB).filter(PipelineDB.user_id == user.id).all()
        ]
    except Exception:
        pipelines_v1 = []

    # Pipelines V2
    try:
        pipelines_v2 = [
            {"id": p.id, "name": p.name, "created_at": _iso(p.created_at)}
            for p in db.query(PipelineV2DB).filter(PipelineV2DB.user_id == user.id).all()
        ]
    except Exception:
        pipelines_v2 = []

    # Dashboards
    try:
        dashboards = [
            {"id": d.id, "name": d.name, "created_at": _iso(d.created_at)}
            for d in db.query(DashboardV2DB).filter(DashboardV2DB.user_id == user.id).all()
        ]
    except Exception:
        dashboards = []

    # Audit log (own actions)
    audit = [
        {"action": r.action, "target": r.target, "created_at": _iso(r.created_at)}
        for r in (
            db.query(AuditLogDB)
            .filter(AuditLogDB.actor == subject)
            .order_by(AuditLogDB.created_at.desc())
            .limit(1000)
            .all()
        )
    ]

    # Feedback
    try:
        feedback = [
            {"message": r.message, "created_at": _iso(r.created_at)}
            for r in db.query(FeedbackDB).filter(FeedbackDB.user_id == user.id).all()
        ]
    except Exception:
        feedback = []

    # Support chat
    try:
        sessions = db.query(SupportChatSessionDB).filter(SupportChatSessionDB.user_id == user.id).all()
        support_chats = []
        for s in sessions:
            msgs = db.query(SupportChatMessageDB).filter(SupportChatMessageDB.session_id == s.id).all()
            support_chats.append({
                "session_id": s.id,
                "created_at": _iso(s.created_at),
                "messages": [{"role": m.role, "content": m.content, "created_at": _iso(m.created_at)} for m in msgs],
            })
    except Exception:
        support_chats = []

    # Monthly usage history
    try:
        usage_history = [
            {
                "period": r.period,
                "api_calls": r.api_calls,
                "pipeline_runs": r.pipeline_runs,
                "datasets_uploaded": r.datasets_uploaded,
                "storage_bytes_used": r.storage_bytes_used,
            }
            for r in db.query(UserUsageDB).filter(UserUsageDB.user_id == user.id).all()
        ]
    except Exception:
        usage_history = []

    return {
        "exported_at": datetime.datetime.utcnow().isoformat() + "Z",
        "profile": profile,
        "projects": projects,
        "datasets": datasets,
        "pipelines_v1": pipelines_v1,
        "pipelines_v2": pipelines_v2,
        "dashboards": dashboards,
        "audit_log": audit,
        "feedback": feedback,
        "support_chats": support_chats,
        "usage_history": usage_history,
    }


@router.delete("/me/gdpr-erase", status_code=204)
def gdpr_erase(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> None:
    """Permanently erase all data for the current user across every table.

    GDPR Article 17 — Right to Erasure ('right to be forgotten').
    This is irreversible. The caller is required to be authenticated.
    Storage objects (S3/R2) are queued via pending_storage_deletes.
    """
    from ..services.audit import audit_store
    from ..models import AuditEntry

    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user = db.query(User).filter(User.username == subject).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    uid = user.id
    # Write audit event before deleting (uses separate audit service)
    try:
        audit_store.add(AuditEntry(
            action="account.gdpr_erase",
            actor=subject,
            target=f"user:{uid}",
            metadata={"user_id": uid, "username": subject},
        ))
    except Exception:
        pass

    # Queue S3 objects for async deletion before wiping DB rows
    try:
        from ..models_db import DatasetMetaDB as _DS, PendingStorageDeleteDB
        import uuid as _uuid, datetime as _dt
        datasets_to_delete = db.query(_DS).filter(_DS.user_id == uid, _DS.storage_path.isnot(None)).all()
        for d in datasets_to_delete:
            if d.storage_path and not d.storage_path.startswith("local://"):
                db.add(PendingStorageDeleteDB(
                    id=str(_uuid.uuid4()),
                    storage_path=d.storage_path,
                    created_at=_dt.datetime.utcnow(),
                ))
    except Exception:
        pass

    # Delete from all user-owned tables via raw SQL for reliability
    _tables_uid = [
        "pipeline_steps", "pipeline_runs_v2", "pipeline_schedules", "pipelines_v2",
        "pipeline_runs", "pipelines",
        "dashboard_tiles", "dashboards_v2", "viz_dashboard_widgets", "viz_dashboard_filters",
        "viz_dashboards",
        "dataset_lineage_edges", "dataset_chunks", "dataset_data", "dataset_sessions",
        "calculated_columns", "transformation_history", "transformation_steps",
        "import_tables", "import_connections",
        "connector_credentials",
        "artifacts",
        "pipeline_events",
        "webhooks", "scheduled_jobs",
        "data_sources",
        "chat_sessions",
        "table_snapshots",
        "contexts",
        "feedback",
        "agent_feedback",
        "support_chat_sessions",
        "approval_requests",
        "user_usage",
        "project_members",
        "projects",
        "dataset_meta",
    ]
    for table in _tables_uid:
        try:
            db.execute(text(f"DELETE FROM {table} WHERE user_id = :uid"), {"uid": uid})
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass

    # Audit logs — anonymise instead of hard-delete to preserve audit trail integrity
    try:
        db.execute(
            text("UPDATE audit_logs SET actor = '[deleted]' WHERE actor = :subject"),
            {"subject": subject},
        )
    except Exception:
        pass

    # Tables keyed by owner_user_id
    try:
        db.execute(text("DELETE FROM organizations WHERE owner_user_id = :uid"), {"uid": uid})
    except Exception:
        pass

    # Finally delete the user row
    try:
        db.delete(user)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erasure failed — partial deletion may have occurred")


@router.get("/me/unsubscribe/{token}", include_in_schema=False)
def unsubscribe_via_token(
    token: str,
    db: Session = Depends(get_db),
) -> dict:
    """Public one-click unsubscribe endpoint (no auth required, uses opaque token)."""
    from ..models_db import EmailPreferencesDB
    from datetime import datetime, timezone

    if not token:
        raise HTTPException(status_code=400, detail="Missing token")

    pref = db.query(EmailPreferencesDB).filter(EmailPreferencesDB.unsubscribe_token == token).first()
    if pref is None:
        raise HTTPException(status_code=404, detail="Invalid or expired unsubscribe token")

    pref.lifecycle_emails = False
    pref.weekly_digest = False
    pref.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"ok": True, "message": "You have been unsubscribed from all marketing emails."}