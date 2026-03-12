from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..models_db import DatasetMetaDB, User
from ..security import get_current_subject, get_current_user_id
from . import billing_repository


@dataclass(frozen=True)
class PlanLimits:
    max_file_size_bytes: int
    max_storage_bytes: int
    max_datasets: int
    max_workspaces: int
    allowed_formats: set[str]
    allowed_connectors: set[str]
    sso_enabled: bool
    webhooks_enabled: bool
    scheduling_enabled: bool
    dashboard_sharing_enabled: bool


PLAN_ORDER = {
    "Free": 1,
    "Professional": 2,
    "Team": 3,
    "Business": 4,
    "Enterprise": 5,
}


PLAN_LIMITS: dict[str, PlanLimits] = {
    "Free": PlanLimits(
        max_file_size_bytes=50 * 1024 * 1024,
        max_storage_bytes=100 * 1024 * 1024,
        max_datasets=3,
        max_workspaces=1,
        allowed_formats={"csv", "excel"},
        allowed_connectors=set(),
        sso_enabled=False,
        webhooks_enabled=False,
        scheduling_enabled=False,
        dashboard_sharing_enabled=False,
    ),
    "Professional": PlanLimits(
        max_file_size_bytes=1024 * 1024 * 1024,
        max_storage_bytes=10 * 1024 * 1024 * 1024,
        max_datasets=25,
        max_workspaces=3,
        allowed_formats={"csv", "excel", "json", "parquet"},
        allowed_connectors={"postgresql", "mysql", "mongodb", "mssql"},
        sso_enabled=False,
        webhooks_enabled=False,
        scheduling_enabled=True,
        dashboard_sharing_enabled=True,
    ),
    "Team": PlanLimits(
        max_file_size_bytes=5 * 1024 * 1024 * 1024,
        max_storage_bytes=100 * 1024 * 1024 * 1024,
        max_datasets=-1,
        max_workspaces=-1,
        allowed_formats={"csv", "excel", "json", "parquet"},
        allowed_connectors={"postgresql", "mysql", "mongodb", "mssql", "snowflake", "bigquery", "redshift", "azure-sql", "oracle"},
        sso_enabled=False,
        webhooks_enabled=False,
        scheduling_enabled=True,
        dashboard_sharing_enabled=True,
    ),
    "Business": PlanLimits(
        max_file_size_bytes=10 * 1024 * 1024 * 1024,
        max_storage_bytes=1024 * 1024 * 1024 * 1024,
        max_datasets=-1,
        max_workspaces=-1,
        allowed_formats={"csv", "excel", "json", "parquet"},
        allowed_connectors={"*"},
        sso_enabled=True,
        webhooks_enabled=True,
        scheduling_enabled=True,
        dashboard_sharing_enabled=True,
    ),
    "Enterprise": PlanLimits(
        max_file_size_bytes=-1,
        max_storage_bytes=-1,
        max_datasets=-1,
        max_workspaces=-1,
        allowed_formats={"csv", "excel", "json", "parquet"},
        allowed_connectors={"*"},
        sso_enabled=True,
        webhooks_enabled=True,
        scheduling_enabled=True,
        dashboard_sharing_enabled=True,
    ),
}


def normalize_plan(plan: str | None) -> str:
    if not plan:
        return "Free"
    candidate = str(plan).strip().capitalize()
    if candidate in PLAN_LIMITS:
        return candidate
    return "Free"


def resolve_user_plan(db: Session, authorization: str | None) -> str:
    user_id = get_current_user_id(authorization)
    subject = get_current_subject(authorization)

    if settings.billing_enabled and user_id:
        effective_plan = billing_repository.get_effective_plan(user_id)
        if effective_plan:
            return normalize_plan(effective_plan)

    user = None
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
    if not user and subject:
        user = db.query(User).filter(User.username == subject).first()
    if not user:
        return "Free"
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
    workspace_id: str,
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
        raise HTTPException(
            status_code=413,
            detail=f"Upload size exceeds {normalize_plan(plan)} plan file limit.",
        )

    dataset_count = (
        db.query(DatasetMetaDB)
        .filter(DatasetMetaDB.workspace_id == (workspace_id or "default"))
        .count()
    )
    if limits.max_datasets > 0 and dataset_count >= limits.max_datasets:
        raise HTTPException(
            status_code=403,
            detail=f"Dataset limit reached for {normalize_plan(plan)} plan.",
        )

    storage_rows = (
        db.query(DatasetMetaDB.file_size_bytes, DatasetMetaDB.compressed_size_bytes)
        .filter(DatasetMetaDB.workspace_id == (workspace_id or "default"))
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
        required_plan = "Team"
        if connector_name in {"postgresql", "mysql", "mongodb", "mssql"}:
            required_plan = "Professional"
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
    limits = limits_for_plan(plan)
    if limits.max_workspaces > 0 and existing_count >= limits.max_workspaces:
        raise HTTPException(
            status_code=403,
            detail=f"Workspace limit reached for {normalize_plan(plan)} plan.",
        )


def summarize_plan(plan: str) -> dict[str, Any]:
    normalized = normalize_plan(plan)
    limits = limits_for_plan(normalized)
    return {
        "plan": normalized,
        "max_file_size_bytes": limits.max_file_size_bytes,
        "max_storage_bytes": limits.max_storage_bytes,
        "max_datasets": limits.max_datasets,
        "max_workspaces": limits.max_workspaces,
        "sso_enabled": limits.sso_enabled,
        "webhooks_enabled": limits.webhooks_enabled,
        "scheduling_enabled": limits.scheduling_enabled,
        "dashboard_sharing_enabled": limits.dashboard_sharing_enabled,
    }
