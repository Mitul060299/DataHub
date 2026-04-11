from fastapi import APIRouter, Depends, HTTPException, Header
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
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
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
        # Create new user with Supabase user ID if available, otherwise use UUID
        user_id_to_use = user_id if user_id else str(uuid.uuid4())
        user = User(id=user_id_to_use, username=subject, role=role, plan="Free")
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except Exception as e:
            # Handle duplicate ID edge case
            db.rollback()
            logger.error("Failed to create user with ID %s: %s", user_id_to_use, str(e))
            user = User(id=str(uuid.uuid4()), username=subject, role=role, plan="Free")
            db.add(user)
            db.commit()
            db.refresh(user)
    workspace_filter = workspace_id or "default"
    datasets_used = (
        db.query(DatasetMetaDB)
        .filter(DatasetMetaDB.workspace_id == workspace_filter)
        .count()
    )
    storage_used = (
        db.query(ImportTableDB)
        .filter(ImportTableDB.workspace_id == workspace_filter)
        .with_entities(ImportTableDB.size_bytes)
        .all()
    )
    storage_total = sum(row[0] or 0 for row in storage_used)
    usage = UserUsage(
        datasetsUsed=datasets_used,
        storageUsed=storage_total,
        aiMessagesUsed=0,
    )
    effective_plan = resolve_user_plan(db, authorization)
    return UserProfileOut(
        id=user.id,
        username=user.username,
        role=user.role,
        plan=effective_plan,
        usage=usage,
        has_completed_onboarding=getattr(user, "has_completed_onboarding", False) or False,
        has_uploaded_first_file=getattr(user, "has_uploaded_first_file", False) or False,
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
        },
        "limits": {
            "api_calls_per_month": limits["api_calls_per_month"],
            "pipeline_runs_per_month": limits["pipeline_runs_per_month"],
            "datasets_per_month": limits["datasets_per_month"],
            "storage_bytes": limits["storage_bytes"],
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
