from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from ..models import (
    AuditEntry,
    UsageSummary,
    ActionCount,
    TargetCount,
    TenantIsolationReport,
    AutomationGuardrailPolicyOut,
    AutomationGuardrailPolicyUpdate,
    AIOperatingControlsOut,
    AIOperatingControlsUpdate,
)
from ..services.audit import audit_store
from ..services.cache import profile_cache
from ..services.query_cache import QueryCacheService
from ..services.tenant_isolation_audit import generate_tenant_isolation_report
from ..services.tenant_isolation_monitor import (
    get_tenant_isolation_monitor_status,
    run_tenant_isolation_verification_job,
)
from ..services.automation_guardrails import (
    get_automation_guardrail_policy,
    update_automation_guardrail_policy,
)
from ..services.ai_operating_controls import (
    get_ai_operating_controls,
    update_ai_operating_controls,
    get_prompt_starters_for_role,
)
from ..routers.datasets import dataset_cache_stats
from ..db import get_db
from ..models_db import AuditLogDB
from ..security import get_current_role, require_role
from ..config import settings

router = APIRouter(prefix="/governance", tags=["governance"])


@router.post("/audit")
def add_audit(
    entry: AuditEntry,
    authorization: str | None = Header(default=None),
) -> dict:
    role = get_current_role(authorization)
    require_role("editor", role)
    audit_store.add(entry)
    return {"status": "logged"}


@router.get("/audit")
def list_audit(
    action: str | None = None,
    actor: str | None = None,
    target: str | None = None,
    since_minutes: int | None = None,
    limit: int = 200,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[AuditEntry]:
    role = get_current_role(authorization)
    require_role("admin", role)
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
def usage_summary(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> UsageSummary:
    role = get_current_role(authorization)
    require_role("admin", role)
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
def cache_stats(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    return {
        "profile_cache": profile_cache.stats(),
        "dataset_cache": dataset_cache_stats(),
        "query_cache": QueryCacheService.stats_last_24h(db),
    }


@router.get("/tenant-isolation-report", response_model=TenantIsolationReport)
def tenant_isolation_report(
    workspace_id: str | None = None,
    limit: int = 200,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> TenantIsolationReport:
    role = get_current_role(authorization)
    require_role("admin", role)
    return generate_tenant_isolation_report(db, scope_workspace_id=workspace_id, limit=limit)


@router.get("/tenant-isolation-monitor/status")
def tenant_isolation_monitor_status(authorization: str | None = Header(default=None)) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    return get_tenant_isolation_monitor_status()


@router.post("/tenant-isolation-monitor/run")
def run_tenant_isolation_monitor(authorization: str | None = Header(default=None)) -> dict:
    role = get_current_role(authorization)
    require_role("admin", role)
    result = run_tenant_isolation_verification_job()
    audit_store.add(
        AuditEntry(
            action="tenant.isolation.monitor.run",
            actor=authorization or "unknown",
            target="tenant_isolation_monitor",
            metadata={
                "status": result.get("status"),
                "total_violations": result.get("total_violations", 0),
                "webhook_deliveries": result.get("webhook_deliveries", 0),
            },
        )
    )
    return result


@router.get("/automation-guardrails", response_model=AutomationGuardrailPolicyOut)
def get_automation_guardrails(authorization: str | None = Header(default=None)) -> AutomationGuardrailPolicyOut:
    role = get_current_role(authorization)
    require_role("admin", role)
    return get_automation_guardrail_policy()


@router.put("/automation-guardrails", response_model=AutomationGuardrailPolicyOut)
def put_automation_guardrails(
    payload: AutomationGuardrailPolicyUpdate,
    authorization: str | None = Header(default=None),
) -> AutomationGuardrailPolicyOut:
    role = get_current_role(authorization)
    require_role("admin", role)
    policy = update_automation_guardrail_policy(payload)
    audit_store.add(
        AuditEntry(
            action="automation.guardrails.update",
            actor=authorization or "unknown",
            target="automation_guardrails",
            metadata=policy.dict(),
        )
    )
    return policy


@router.get("/ai-operating-controls", response_model=AIOperatingControlsOut)
def get_ai_controls(authorization: str | None = Header(default=None)) -> AIOperatingControlsOut:
    role = get_current_role(authorization)
    require_role("admin", role)
    return get_ai_operating_controls()


@router.put("/ai-operating-controls", response_model=AIOperatingControlsOut)
def put_ai_controls(
    payload: AIOperatingControlsUpdate,
    authorization: str | None = Header(default=None),
) -> AIOperatingControlsOut:
    role = get_current_role(authorization)
    require_role("admin", role)
    policy = update_ai_operating_controls(payload)
    audit_store.add(
        AuditEntry(
            action="ai.controls.update",
            actor=authorization or "unknown",
            target="ai_operating_controls",
            metadata=policy.dict(),
        )
    )
    return policy


@router.get("/ai-prompt-starters")
def get_ai_prompt_starters(
    role_name: str = "viewer",
    authorization: str | None = Header(default=None),
) -> dict:
    role = get_current_role(authorization)
    require_role("viewer", role)
    return {"role": role_name, "starters": get_prompt_starters_for_role(role_name)}
