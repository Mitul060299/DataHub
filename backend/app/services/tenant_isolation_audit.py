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
    Workspace,
)


def _matches_scope(scope_workspace_id: str | None, values: list[str | None]) -> bool:
    if not scope_workspace_id:
        return True
    return any(value == scope_workspace_id for value in values)


def _as_workspace_id(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _add_violation(
    violations: list[TenantIsolationViolation],
    category_counts: dict[str, int],
    violation: TenantIsolationViolation,
) -> None:
    violations.append(violation)
    category_counts[violation.category] = category_counts.get(violation.category, 0) + 1


def generate_tenant_isolation_report(
    db: Session,
    scope_workspace_id: str | None = None,
    limit: int = 200,
) -> TenantIsolationReport:
    safe_limit = max(1, min(limit, 1000))
    violations: list[TenantIsolationViolation] = []
    category_counts: dict[str, int] = {}
    total_records_scanned = 0

    known_workspaces = {row.id for row in db.query(Workspace.id).all()}
    known_workspaces.add("default")

    datasets = db.query(DatasetMetaDB.id, DatasetMetaDB.workspace_id).all()
    total_records_scanned += len(datasets)
    dataset_workspace_map = {row.id: _as_workspace_id(row.workspace_id) for row in datasets}

    def add(violation: TenantIsolationViolation) -> None:
        if len(violations) < safe_limit:
            _add_violation(violations, category_counts, violation)
        else:
            category_counts[violation.category] = category_counts.get(violation.category, 0) + 1

    for dataset_id, dataset_workspace_id in dataset_workspace_map.items():
        if not _matches_scope(scope_workspace_id, [dataset_workspace_id]):
            continue
        if dataset_workspace_id not in known_workspaces:
            add(
                TenantIsolationViolation(
                    category="unknown_workspace",
                    severity="high",
                    table="dataset_meta",
                    record_id=str(dataset_id),
                    workspace_id=dataset_workspace_id,
                    details={"message": "Dataset references a non-existent workspace"},
                )
            )

    imports = db.query(ImportTableDB.id, ImportTableDB.dataset_id, ImportTableDB.workspace_id).all()
    total_records_scanned += len(imports)
    for row_id, dataset_id, import_workspace_id in imports:
        dataset_workspace_id = dataset_workspace_map.get(dataset_id)
        import_workspace_id = _as_workspace_id(import_workspace_id)
        if not _matches_scope(scope_workspace_id, [import_workspace_id, dataset_workspace_id]):
            continue
        if dataset_workspace_id is None:
            add(
                TenantIsolationViolation(
                    category="orphan_dataset_reference",
                    severity="high",
                    table="import_tables",
                    record_id=str(row_id),
                    workspace_id=import_workspace_id,
                    details={"dataset_id": dataset_id},
                )
            )
            continue
        if import_workspace_id != dataset_workspace_id:
            add(
                TenantIsolationViolation(
                    category="cross_workspace_reference",
                    severity="high",
                    table="import_tables",
                    record_id=str(row_id),
                    workspace_id=import_workspace_id,
                    details={
                        "dataset_id": dataset_id,
                        "dataset_workspace_id": dataset_workspace_id,
                    },
                )
            )

    chat_sessions = db.query(ChatSessionDB.id, ChatSessionDB.dataset_id, ChatSessionDB.workspace_id).all()
    total_records_scanned += len(chat_sessions)
    for row_id, dataset_id, chat_workspace_id in chat_sessions:
        dataset_workspace_id = dataset_workspace_map.get(dataset_id)
        chat_workspace_id = _as_workspace_id(chat_workspace_id)
        if not _matches_scope(scope_workspace_id, [chat_workspace_id, dataset_workspace_id]):
            continue
        if dataset_workspace_id is None:
            add(
                TenantIsolationViolation(
                    category="orphan_dataset_reference",
                    severity="high",
                    table="chat_sessions",
                    record_id=str(row_id),
                    workspace_id=chat_workspace_id,
                    details={"dataset_id": dataset_id},
                )
            )
            continue
        if chat_workspace_id != dataset_workspace_id:
            add(
                TenantIsolationViolation(
                    category="cross_workspace_reference",
                    severity="high",
                    table="chat_sessions",
                    record_id=str(row_id),
                    workspace_id=chat_workspace_id,
                    details={
                        "dataset_id": dataset_id,
                        "dataset_workspace_id": dataset_workspace_id,
                    },
                )
            )

    query_cache_rows = db.query(QueryCacheDB.id, QueryCacheDB.dataset_id).all()
    total_records_scanned += len(query_cache_rows)
    for row_id, dataset_id in query_cache_rows:
        dataset_workspace_id = dataset_workspace_map.get(dataset_id)
        if not _matches_scope(scope_workspace_id, [dataset_workspace_id]):
            continue
        if dataset_workspace_id is None:
            add(
                TenantIsolationViolation(
                    category="orphan_dataset_reference",
                    severity="medium",
                    table="query_cache",
                    record_id=str(row_id),
                    workspace_id=None,
                    details={"dataset_id": dataset_id},
                )
            )

    history_rows = db.query(TransformationHistoryDB.id, TransformationHistoryDB.dataset_id).all()
    total_records_scanned += len(history_rows)
    for row_id, dataset_id in history_rows:
        dataset_workspace_id = dataset_workspace_map.get(dataset_id)
        if not _matches_scope(scope_workspace_id, [dataset_workspace_id]):
            continue
        if dataset_workspace_id is None:
            add(
                TenantIsolationViolation(
                    category="orphan_dataset_reference",
                    severity="medium",
                    table="transformation_history",
                    record_id=str(row_id),
                    workspace_id=None,
                    details={"dataset_id": dataset_id},
                )
            )

    workspace_scoped_rows = [
        ("import_connections", db.query(ImportConnectionDB.id, ImportConnectionDB.workspace_id).all()),
        ("pipelines_v2", db.query(PipelineV2DB.id, PipelineV2DB.workspace_id).all()),
        ("chat_templates", db.query(ChatTemplateDB.id, ChatTemplateDB.workspace_id).all()),
        ("viz_dashboards", db.query(VizDashboardDB.id, VizDashboardDB.workspace_id).all()),
    ]
    for table_name, rows in workspace_scoped_rows:
        total_records_scanned += len(rows)
        for row_id, row_workspace_id in rows:
            row_workspace_id = _as_workspace_id(row_workspace_id)
            if not _matches_scope(scope_workspace_id, [row_workspace_id]):
                continue
            if row_workspace_id not in known_workspaces:
                add(
                    TenantIsolationViolation(
                        category="unknown_workspace",
                        severity="high",
                        table=table_name,
                        record_id=str(row_id),
                        workspace_id=row_workspace_id,
                        details={"message": "Record references a non-existent workspace"},
                    )
                )

    return TenantIsolationReport(
        checked_at=datetime.now(timezone.utc).isoformat(),
        scope_workspace_id=scope_workspace_id,
        total_records_scanned=total_records_scanned,
        total_violations=sum(category_counts.values()),
        violations_by_category=category_counts,
        violations=violations,
    )