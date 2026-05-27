from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..models_db import DatasetMetaDB, ProjectDB, ProjectMemberDB, User
from ..security import get_current_subject, get_current_user_id
from . import billing_repository
from .plan_limits import get_limits as _get_usage_limits


@dataclass(frozen=True)
class PlanLimits:
    max_file_size_bytes: int
    max_storage_bytes: int
    max_datasets: int
    # Deprecated: workspace concept replaced by project-level collaboration.
    # Kept for backward-compat; set to 0 for all current tiers.
    max_collab_workspaces: int
    max_projects_per_workspace: int  # -1 = unlimited
    # Project-level collaboration limits.
    max_project_members: int         # max members per project (-1 = unlimited)
    max_collaborative_projects: int  # distinct projects allowed to have >=1 member (-1 = unlimited)
    allowed_formats: set[str]
    allowed_connectors: set[str]
    sso_enabled: bool
    webhooks_enabled: bool
    scheduling_enabled: bool
    dashboard_sharing_enabled: bool
    audit_log_enabled: bool = False  # Expert-only


PLAN_ORDER = {
    # New 3-tier pricing (effective when BILLING_ENABLED=true).
    "Starter": 1,       # free forever
    "Professional": 2,  # $49/mo (₹1,999)
    "Expert": 3,        # $99/mo (₹3,999)
    # Beta is the open-beta universal plan used while BILLING_ENABLED=false.
    # Ranked highest so it satisfies every enforce_min_plan() check.
    "Beta": 99,
}


PLAN_LIMITS: dict[str, PlanLimits] = {
    # Beta plan: assigned to every user while BILLING_ENABLED=false.
    # Unlocks every single-user feature so users can fully evaluate the product.
    "Beta": PlanLimits(
        max_file_size_bytes=2 * 1024 * 1024 * 1024,      # 2 GB
        max_storage_bytes=20 * 1024 * 1024 * 1024,       # 20 GB
        max_datasets=-1,
        max_collab_workspaces=0,
        max_projects_per_workspace=-1,
        max_project_members=1,
        max_collaborative_projects=0,
        allowed_formats={"csv", "excel", "json", "parquet"},
        allowed_connectors={"*"},
        sso_enabled=False,
        webhooks_enabled=True,
        scheduling_enabled=True,
        dashboard_sharing_enabled=True,
    ),
    # Starter — free forever, solo use.
    "Starter": PlanLimits(
        max_file_size_bytes=100 * 1024 * 1024,           # 100 MB
        max_storage_bytes=2 * 1024 * 1024 * 1024,        # 2 GB
        max_datasets=5,
        max_collab_workspaces=0,
        max_projects_per_workspace=-1,
        max_project_members=1,                           # solo only
        max_collaborative_projects=0,
        allowed_formats={"csv", "excel"},
        allowed_connectors={"csv", "excel"},
        sso_enabled=False,
        webhooks_enabled=False,
        scheduling_enabled=False,
        dashboard_sharing_enabled=False,
    ),
    # Professional — $49/mo (₹1,999). Up to 5 collaborators per project.
    "Professional": PlanLimits(
        max_file_size_bytes=1024 * 1024 * 1024,          # 1 GB
        max_storage_bytes=25 * 1024 * 1024 * 1024,       # 25 GB
        max_datasets=100,
        max_collab_workspaces=0,
        max_projects_per_workspace=-1,
        max_project_members=6,                           # owner + up to 5
        max_collaborative_projects=-1,                   # unlimited collab projects
        allowed_formats={"csv", "excel", "json", "parquet"},
        allowed_connectors={"csv", "excel", "postgresql", "mysql", "sqlite"},
        sso_enabled=False,
        webhooks_enabled=False,
        scheduling_enabled=True,                         # daily scheduling
        dashboard_sharing_enabled=True,
    ),
    # Expert — $99/mo (₹3,999). Up to 20 collaborators + audit log.
    "Expert": PlanLimits(
        max_file_size_bytes=5 * 1024 * 1024 * 1024,      # 5 GB
        max_storage_bytes=100 * 1024 * 1024 * 1024,      # 100 GB
        max_datasets=500,
        max_collab_workspaces=0,
        max_projects_per_workspace=-1,
        max_project_members=21,                          # owner + up to 20
        max_collaborative_projects=-1,
        allowed_formats={"csv", "excel", "json", "parquet"},
        allowed_connectors={"*"},
        sso_enabled=False,
        webhooks_enabled=True,
        scheduling_enabled=True,
        dashboard_sharing_enabled=True,
        audit_log_enabled=True,
    ),
}


def normalize_plan(plan: str | None) -> str:
    if not plan:
        return "Starter"
    candidate = str(plan).strip().capitalize()
    if candidate in PLAN_LIMITS:
        return candidate
    # Legacy tier mappings (data migration may not have run yet on all envs)
    _legacy: dict[str, str] = {
        "Free": "Starter",
        "Team": "Expert",
        "Business": "Expert",
        "Enterprise": "Expert",
    }
    legacy_key = str(plan).strip().title()
    if legacy_key in _legacy:
        return _legacy[legacy_key]
    return "Starter"


def default_user_plan() -> str:
    """Plan to assume when billing lookup yields nothing.

    During the open-beta period all users without an explicitly purchased
    paid plan receive Beta, which unlocks every single-user feature so they
    can fully evaluate the product. Users with an active paid subscription
    get their purchased plan tier via billing_repository.
    """
    return "Beta"


def resolve_user_plan_by_id(user_id: str, db: Session) -> str:
    """Return the plan for a known user_id (no JWT needed).

    Org-account aware: if ``user_id`` is an active member of someone else's
    org (i.e. they were invited under a paid Team/Business seat), the org
    owner's plan is returned instead. Lazy: never creates a personal org row.
    """
    # While BILLING_ENABLED is off we give every user the open-beta plan.
    # This bypasses the Free-tier hard caps so people can actually evaluate
    # the product without being throttled on file size, storage, or scan
    # volume. Re-enable billing by setting BILLING_ENABLED=true and the
    # normal per-user lookup resumes.
    if not settings.billing_enabled:
        return "Beta"

    # Resolve to org owner if this user is an org member
    if settings.billing_enabled and user_id:
        effective_plan = billing_repository.get_effective_plan(user_id, db=db)
        if effective_plan:
            return normalize_plan(effective_plan)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return default_user_plan()
    return normalize_plan(user.plan)


def enforce_collab_workspace_limit(plan: str, existing_collab_count: int) -> None:
    """No-op: the workspace concept has been replaced by project-level collaboration.

    Kept for backward-compatibility with existing call sites.
    """
    return


def resolve_project_plan(
    project_id: str,
    calling_user_id: str,
    db: Session,
) -> Tuple[str, str]:
    """Return (billing_user_id, plan) for a project.

    The project owner pays for usage inside their project — invited members
    consume the owner's quota, not their own. This replaces the
    workspace-level billing attribution from ``resolve_workspace_plan``.
    """
    if not project_id:
        return calling_user_id, resolve_user_plan_by_id(calling_user_id, db)

    proj = db.query(ProjectDB).filter(ProjectDB.id == project_id).first()
    if proj is None or not proj.user_id:
        return calling_user_id, resolve_user_plan_by_id(calling_user_id, db)

    billing_user_id = proj.user_id
    return billing_user_id, resolve_user_plan_by_id(billing_user_id, db)


def enforce_project_member_limit(
    project_id: str,
    plan: str,
    db: Session,
) -> None:
    """Block project member invites when this project's per-project cap is reached.

    Counts active + pending rows in ``project_members`` for this project. The
    project owner is *implicit* (via projects.user_id) and counts as 1 toward
    the cap.
    """
    limits = limits_for_plan(plan)
    if limits.max_project_members == -1:
        return
    if limits.max_project_members <= 1:
        # Free / Professional: no collaborators allowed
        raise HTTPException(
            status_code=403,
            detail={
                "error": "member_limit_reached",
                "code": "member_limit_reached",
                "plan": normalize_plan(plan),
                "limit": limits.max_project_members,
                "message": format_upgrade_message(
                    "Project members", plan, "Team"
                ),
            },
        )
    current_members = (
        db.query(ProjectMemberDB)
        .filter(
            ProjectMemberDB.project_id == project_id,
            ProjectMemberDB.status.in_(["active", "pending"]),
        )
        .count()
    )
    # Owner counts as 1 (not stored in project_members)
    current_members += 1
    if current_members >= limits.max_project_members:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "member_limit_reached",
                "code": "member_limit_reached",
                "plan": normalize_plan(plan),
                "limit": limits.max_project_members,
                "current": current_members,
                "message": (
                    f"This project already has {current_members} of "
                    f"{limits.max_project_members} members allowed on the "
                    f"{normalize_plan(plan)} plan. Upgrade to invite more."
                ),
            },
        )


def enforce_collaborative_project_limit(
    owner_id: str,
    plan: str,
    db: Session,
) -> None:
    """Block creating a NEW collaborative project when at the owner's plan cap.

    A "collaborative project" is one owned by ``owner_id`` that has at least
    one ``project_members`` row. Should be called only when transitioning a
    project from 0→1 member.
    """
    limits = limits_for_plan(plan)
    if limits.max_collaborative_projects == -1:
        return
    if limits.max_collaborative_projects == 0:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "collaborative_project_limit_reached",
                "code": "collaborative_project_limit_reached",
                "plan": normalize_plan(plan),
                "limit": 0,
                "message": format_upgrade_message(
                    "Shared projects", plan, "Professional"
                ),
            },
        )

    current = (
        db.query(ProjectMemberDB.project_id)
        .join(ProjectDB, ProjectDB.id == ProjectMemberDB.project_id)
        .filter(ProjectDB.user_id == owner_id)
        .distinct()
        .count()
    )
    if current >= limits.max_collaborative_projects:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "collaborative_project_limit_reached",
                "code": "collaborative_project_limit_reached",
                "plan": normalize_plan(plan),
                "limit": limits.max_collaborative_projects,
                "current": current,
                "message": (
                    f"You're already sharing {current} of "
                    f"{limits.max_collaborative_projects} collaborative projects "
                    f"allowed on the {normalize_plan(plan)} plan. Upgrade to "
                    "share more projects."
                ),
            },
        )


def enforce_member_seat_limit(
    billing_user_id: str,
    plan: str,
    db: Session,
) -> None:
    """No-op: the seat-based billing model was removed in the new 3-tier pricing.

    Kept for backward-compatibility with existing call sites.
    """
    return


def enforce_project_limit(plan: str, existing_count: int) -> None:
    limits = limits_for_plan(plan)
    if limits.max_projects_per_workspace > 0 and existing_count >= limits.max_projects_per_workspace:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "project_limit_reached",
                "plan": normalize_plan(plan),
                "limit": limits.max_projects_per_workspace,
                "message": (
                    f"Project limit reached for {normalize_plan(plan)} plan "
                    f"({limits.max_projects_per_workspace} projects per workspace). "
                    "Upgrade to increase your limit."
                ),
            },
        )


def resolve_user_plan(db: Session, authorization: str | None) -> str:
    """Resolve the effective plan for the calling user from their JWT + DB record.

    Signature is (db, authorization) to match all existing call sites across routers.
    For workspace-scoped billing use resolve_workspace_plan() instead.
    """
    # Mirror resolve_user_plan_by_id: while billing is disabled every
    # caller (router guards, usage stats, /me, etc.) sees the open-beta
    # plan so they aren't capped to Free's tiny limits.
    if not settings.billing_enabled:
        return "Beta"

    user_id = get_current_user_id(authorization)
    subject = get_current_subject(authorization)

    if settings.billing_enabled and user_id:
        effective_plan = billing_repository.get_effective_plan(user_id, db=db)
        if effective_plan:
            return normalize_plan(effective_plan)

    user = None
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
    if not user and subject:
        user = db.query(User).filter(User.username == subject).first()
    if not user:
        return default_user_plan()
    return normalize_plan(user.plan)


def limits_for_plan(plan: str) -> PlanLimits:
    return PLAN_LIMITS[normalize_plan(plan)]


def has_min_plan(current_plan: str, minimum_plan: str) -> bool:
    current_rank = PLAN_ORDER.get(normalize_plan(current_plan), 1)
    minimum_rank = PLAN_ORDER.get(normalize_plan(minimum_plan), 1)
    return current_rank >= minimum_rank


def enforce_min_plan(plan: str, minimum_plan: str, feature: str) -> None:
    if not has_min_plan(plan, minimum_plan):
        raise HTTPException(
            status_code=403,
            detail=format_upgrade_message(feature, plan, minimum_plan),
        )


def format_upgrade_message(feature: str, current_plan: str, required_plan: str) -> str:
    return f"{feature} requires {required_plan} plan or higher. Current plan: {normalize_plan(current_plan)}."


def enforce_file_constraints(
    *,
    plan: str,
    billing_user_id: str,
    file_format: str,
    upload_size_bytes: int,
    db: Session,
) -> None:
    limits = limits_for_plan(plan)

    if limits.allowed_formats and file_format not in limits.allowed_formats:
        raise HTTPException(
            status_code=403,
            detail=format_upgrade_message(f"{file_format.upper()} uploads", plan, "Professional"),
        )

    if limits.max_file_size_bytes > 0 and upload_size_bytes > limits.max_file_size_bytes:
        _file_mb = round(upload_size_bytes / (1024 * 1024), 1)
        _cap = limits.max_file_size_bytes
        _limit_label = (
            f"{_cap // (1024 ** 3)} GB" if _cap >= 1024 ** 3
            else f"{round(_cap / (1024 * 1024))} MB"
        )
        raise HTTPException(
            status_code=413,
            detail={
                "error": "file_too_large",
                "message": (
                    f"Your file is {_file_mb} MB. The {normalize_plan(plan)} plan supports "
                    f"files up to {_limit_label}. For large files, Parquet format is 5\u201310\u00d7 "
                    "smaller than CSV \u2014 convert with: df.to_parquet('file.parquet')"
                ),
                "file_size_mb": _file_mb,
                "limit_label": _limit_label,
                "plan": plan,
            },
        )

    # Safely fetch quickstart project IDs so their datasets are quota-exempt.
    # Wrapped in try/except so that if the migration hasn't run yet the guard
    # still works — it just treats all datasets as billable.
    quickstart_ids: set[str] = set()
    try:
        rows = (
            db.query(ProjectDB.id)
            .filter(
                ProjectDB.user_id == billing_user_id,
                ProjectDB.is_quickstart.is_(True),
            )
            .all()
        )
        quickstart_ids = {row[0] for row in rows}
    except Exception:
        db.rollback()
        quickstart_ids = set()

    if quickstart_ids:
        dataset_count = (
            db.query(DatasetMetaDB)
            .filter(
                DatasetMetaDB.user_id == billing_user_id,
                DatasetMetaDB.deleted_at.is_(None),
                DatasetMetaDB.project_id.not_in(quickstart_ids),
            )
            .count()
        )
    else:
        dataset_count = (
            db.query(DatasetMetaDB)
            .filter(
                DatasetMetaDB.user_id == billing_user_id,
                DatasetMetaDB.deleted_at.is_(None),
            )
            .count()
        )
    if limits.max_datasets > 0 and dataset_count >= limits.max_datasets:
        raise HTTPException(
            status_code=403,
            detail=f"Dataset limit reached for {normalize_plan(plan)} plan.",
        )

    if quickstart_ids:
        storage_rows = (
            db.query(DatasetMetaDB.file_size_bytes, DatasetMetaDB.compressed_size_bytes)
            .filter(
                DatasetMetaDB.user_id == billing_user_id,
                DatasetMetaDB.deleted_at.is_(None),
                DatasetMetaDB.project_id.not_in(quickstart_ids),
            )
            .all()
        )
    else:
        storage_rows = (
            db.query(DatasetMetaDB.file_size_bytes, DatasetMetaDB.compressed_size_bytes)
            .filter(
                DatasetMetaDB.user_id == billing_user_id,
                DatasetMetaDB.deleted_at.is_(None),
            )
            .all()
        )
    current_storage = sum((row[0] or row[1] or 0) for row in storage_rows)
    projected_storage = current_storage + max(upload_size_bytes, 0)
    if limits.max_storage_bytes > 0 and projected_storage > limits.max_storage_bytes:
        raise HTTPException(
            status_code=403,
            detail=f"Storage limit reached for {normalize_plan(plan)} plan.",
        )


def enforce_connector_access(plan: str, connector_name: str) -> None:
    limits = limits_for_plan(plan)
    if "*" in limits.allowed_connectors:
        return
    if connector_name not in limits.allowed_connectors:
        if connector_name in {"postgresql", "mysql", "sqlite", "mssql", "oracle"}:
            required_plan = "Professional"
        elif connector_name in {"snowflake", "redshift", "bigquery"}:
            required_plan = "Team"
        elif connector_name == "custom":
            required_plan = "Business"
        else:
            required_plan = "Enterprise"
        raise HTTPException(
            status_code=403,
            detail=format_upgrade_message(f"{connector_name} connector", plan, required_plan),
        )


def enforce_webhooks(plan: str) -> None:
    limits = limits_for_plan(plan)
    if not limits.webhooks_enabled:
        raise HTTPException(status_code=403, detail=format_upgrade_message("Webhooks", plan, "Business"))


def enforce_sso(plan: str) -> None:
    limits = limits_for_plan(plan)
    if not limits.sso_enabled:
        raise HTTPException(status_code=403, detail=format_upgrade_message("SSO", plan, "Business"))


def enforce_scheduling(plan: str) -> None:
    limits = limits_for_plan(plan)
    if not limits.scheduling_enabled:
        raise HTTPException(status_code=403, detail=format_upgrade_message("Scheduling", plan, "Professional"))


def enforce_dashboard_sharing(plan: str) -> None:
    limits = limits_for_plan(plan)
    if not limits.dashboard_sharing_enabled:
        raise HTTPException(status_code=403, detail=format_upgrade_message("Dashboard sharing", plan, "Professional"))


def enforce_workspace_limit(plan: str, existing_count: int) -> None:
    """Legacy shim kept for backward compat — delegates to enforce_collab_workspace_limit."""
    enforce_collab_workspace_limit(plan, existing_count)


def summarize_plan(plan: str) -> dict[str, Any]:
    normalized = normalize_plan(plan)
    limits = limits_for_plan(normalized)
    return {
        "plan": normalized,
        "max_file_size_bytes": limits.max_file_size_bytes,
        "max_storage_bytes": limits.max_storage_bytes,
        "max_datasets": limits.max_datasets,
        "max_collab_workspaces": limits.max_collab_workspaces,
        "max_projects_per_workspace": limits.max_projects_per_workspace,
        "max_project_members": limits.max_project_members,
        "max_collaborative_projects": limits.max_collaborative_projects,
        "sso_enabled": limits.sso_enabled,
        "webhooks_enabled": limits.webhooks_enabled,
        "scheduling_enabled": limits.scheduling_enabled,
        "dashboard_sharing_enabled": limits.dashboard_sharing_enabled,
    }
