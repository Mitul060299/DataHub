from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from ..models import AuditEntry, UsageSummary, ActionCount, TargetCount
from ..services.audit import audit_store
from ..services.cache import profile_cache
from ..routers.datasets import dataset_cache_stats
from ..db import get_db
from ..models_db import AuditLogDB
from ..security import get_current_role, require_role
from ..config import settings

router = APIRouter(prefix="/governance", tags=["governance"])


@router.post("/audit")
def add_audit(entry: AuditEntry) -> dict:
    audit_store.add(entry)
    return {"status": "logged"}


@router.get("/audit")
def list_audit(
    action: str | None = None,
    actor: str | None = None,
    target: str | None = None,
    since_minutes: int | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
) -> list[AuditEntry]:
    query = db.query(AuditLogDB)
    if action:
        query = query.filter(AuditLogDB.action == action)
    if actor:
        query = query.filter(AuditLogDB.actor == actor)
    if target:
        query = query.filter(AuditLogDB.target == target)
    if since_minutes:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)
        query = query.filter(AuditLogDB.created_at >= cutoff)
    safe_limit = max(1, min(limit, 1000))
    rows = query.order_by(AuditLogDB.created_at.desc()).limit(safe_limit).all()
    if rows:
        return [
            AuditEntry(
                action=r.action,
                actor=r.actor,
                target=r.target,
                metadata=r.metadata_,
                created_at=str(r.created_at) if r.created_at else None,
            )
            for r in rows
        ]
    return audit_store.list()


@router.get("/usage", response_model=UsageSummary)
def usage_summary(db: Session = Depends(get_db)) -> UsageSummary:
    rows = db.query(AuditLogDB).all()
    total_events = len(rows)
    unique_actors = len({row.actor for row in rows})
    action_counts: dict[str, int] = {}
    target_counts: dict[str, int] = {}
    for row in rows:
        action_counts[row.action] = action_counts.get(row.action, 0) + 1
        target_counts[row.target] = target_counts.get(row.target, 0) + 1
    actions = [ActionCount(action=k, count=v) for k, v in sorted(action_counts.items(), key=lambda item: item[1], reverse=True)]
    targets = [TargetCount(target=k, count=v) for k, v in sorted(target_counts.items(), key=lambda item: item[1], reverse=True)[:10]]
    return UsageSummary(
        total_events=total_events,
        unique_actors=unique_actors,
        actions=actions,
        targets=targets,
    )


@router.get("/share-settings")
def share_settings(authorization: str | None = Header(default=None)) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    return {
        "public_base_url": settings.public_base_url,
        "shared_rate_limit_per_minute": settings.shared_rate_limit_per_minute,
        "share_signing_required": bool(settings.share_signing_secret),
        "share_scope_allowlist": settings.share_scope_allowlist,
        "share_scope_policy": settings.share_scope_policy,
    }


@router.get("/cache-stats")
def cache_stats(authorization: str | None = Header(default=None)) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    return {
        "profile_cache": profile_cache.stats(),
        "dataset_cache": dataset_cache_stats(),
    }
