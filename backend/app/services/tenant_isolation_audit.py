from datetime import datetime, timezone
from typing import Any
from sqlalchemy.orm import Session

from ..models import TenantIsolationReport, TenantIsolationViolation
from ..models_db import (
    ChatSessionDB,
    ChatTemplateDB,
    DatasetMetaDB,
    ImportConnectionDB,
    ImportTableDB,
    PipelineV2DB,
    QueryCacheDB,
    TransformationHistoryDB,
    VizDashboardDB,
)


def _add_violation(
    violations: list[TenantIsolationViolation],
    category_counts: dict[str, int],
    violation: TenantIsolationViolation,
) -> None:
    violations.append(violation)
    category_counts[violation.category] = category_counts.get(violation.category, 0) + 1


def generate_tenant_isolation_report(
    db: Session,
    scope_workspace_id: str | None = None,  # kept for API compat, ignored
    limit: int = 200,
) -> TenantIsolationReport:
    """Check for orphaned records that reference non-existent datasets."""
    safe_limit = max(1, min(limit, 1000))
    violations: list[TenantIsolationViolation] = []
    category_counts: dict[str, int] = {}
    total_records_scanned = 0

    known_dataset_ids = {row.id for row in db.query(DatasetMetaDB.id).all()}

    def add(violation: TenantIsolationViolation) -> None:
        if len(violations) < safe_limit:
            _add_violation(violations, category_counts, violation)
        else:
            category_counts[violation.category] = category_counts.get(violation.category, 0) + 1

    # Check imports for orphan dataset references
    imports = db.query(ImportTableDB.id, ImportTableDB.dataset_id).all()
    total_records_scanned += len(imports)
    for row_id, dataset_id in imports:
        if dataset_id and dataset_id not in known_dataset_ids:
            add(TenantIsolationViolation(
                category="orphan_dataset_reference",
                severity="high",
                table="import_tables",
                record_id=str(row_id),
                details={"dataset_id": dataset_id},
            ))

    # Check chat sessions for orphan dataset references
    chat_sessions = db.query(ChatSessionDB.id, ChatSessionDB.dataset_id).all()
    total_records_scanned += len(chat_sessions)
    for row_id, dataset_id in chat_sessions:
        if dataset_id and dataset_id not in known_dataset_ids:
            add(TenantIsolationViolation(
                category="orphan_dataset_reference",
                severity="high",
                table="chat_sessions",
                record_id=str(row_id),
                details={"dataset_id": dataset_id},
            ))

    # Check query cache for orphan dataset references
    query_cache_rows = db.query(QueryCacheDB.id, QueryCacheDB.dataset_id).all()
    total_records_scanned += len(query_cache_rows)
    for row_id, dataset_id in query_cache_rows:
        if dataset_id and dataset_id not in known_dataset_ids:
            add(TenantIsolationViolation(
                category="orphan_dataset_reference",
                severity="medium",
                table="query_cache",
                record_id=str(row_id),
                details={"dataset_id": dataset_id},
            ))

    # Check transformation history
    history_rows = db.query(TransformationHistoryDB.id, TransformationHistoryDB.dataset_id).all()
    total_records_scanned += len(history_rows)
    for row_id, dataset_id in history_rows:
        if dataset_id and dataset_id not in known_dataset_ids:
            add(TenantIsolationViolation(
                category="orphan_dataset_reference",
                severity="medium",
                table="transformation_history",
                record_id=str(row_id),
                details={"dataset_id": dataset_id},
            ))

    return TenantIsolationReport(
        checked_at=datetime.now(timezone.utc).isoformat(),
        total_records_scanned=total_records_scanned,
        total_violations=sum(category_counts.values()),
        violations_by_category=category_counts,
        violations=violations,
    )
