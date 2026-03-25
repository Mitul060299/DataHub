from ..state import AgentState, TableRegistryEntry
from ...duckdb_service import DuckDBService
from ...calculated_columns_service import CalculatedColumnsService
from ...dashboards_v2_service import DashboardsV2Service
from ...duckdb_session import get_connection, register_view, SessionExpiredError
from ...object_storage import StorageService
from ....db import SessionLocal
from ....models_db import ChatTemplateDB, DatasetMetaDB
import re as _re


def _sanitize_alias(name: str) -> str:
    s = _re.sub(r"[^A-Za-z0-9_]", "_", name.strip()).lower()
    s = _re.sub(r"_+", "_", s).strip("_")
    if not s or s[0].isdigit():
        s = "ds_" + s
    return s or "dataset_extra"


def _load_available_templates(dataset_id: str, fallback_workspace_id: str | None = None) -> list[dict]:
    db = SessionLocal()
    try:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        workspace_id = dataset.workspace_id if dataset and dataset.workspace_id else (fallback_workspace_id or "default")
        templates = (
            db.query(ChatTemplateDB)
            .filter(ChatTemplateDB.workspace_id == workspace_id)
            .order_by(ChatTemplateDB.updated_at.desc())
            .limit(5)
            .all()
        )
        return [
            {
                "id": str(template.id),
                "name": template.name,
                "description": template.description,
                "step_count": len(template.execution_flow or []) if isinstance(template.execution_flow, list) else 0,
            }
            for template in templates
        ]
    finally:
        db.close()


async def context_loader(state: AgentState) -> dict:
    dataset_id = state.get("dataset_id")
    if not dataset_id:
        return {"schema": {}, "stats": {}, "sample_rows": [], "available_templates": [], "calculated_columns": [], "dashboards": []}

    db = SessionLocal()
    try:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
    finally:
        db.close()

    user_id = state.get("user_id") or (dataset.user_id if dataset and dataset.user_id else "agent")
    workspace_id = state.get("workspace_id") or (dataset.workspace_id if dataset and dataset.workspace_id else "default")

    available_templates = _load_available_templates(dataset_id, workspace_id)
    calculated_columns = [column.model_dump() for column in CalculatedColumnsService.get_columns_for_dataset(dataset_id)]
    dashboards = [
        {
            "id": dashboard.id,
            "name": dashboard.name,
            "workspace_id": dashboard.workspace_id,
            "tile_count": len(dashboard.tiles),
        }
        for dashboard in DashboardsV2Service.list_dashboards(user_id=user_id, workspace_id=workspace_id)
    ]

    # ── DuckDB session setup (always run, even when schema is cached) ────────
    # Re-registers views after an approval-path restart so execute_step SQL works.
    session_id = state.get("session_id", "")
    table_registry: dict = dict(state.get("table_registry") or {})

    def _register_dataset_view(ds_id: str, alias: str, storage_path: str | None = None) -> None:
        """Register one dataset as a named view in the persistent DuckDB session."""
        if not session_id or not storage_path:
            return
        try:
            file_path = StorageService.get_query_path(storage_path)
            register_view(session_id, alias, file_path)
        except Exception:
            pass

    if session_id:
        try:
            get_connection(session_id)
        except SessionExpiredError as exc:
            return {"error": str(exc)}

    # Always re-register primary dataset view so execute_step can query it.
    if dataset and dataset.storage_path:
        _primary_alias = _sanitize_alias(str(dataset.name if dataset and dataset.name else dataset_id))
        _register_dataset_view(dataset_id, _primary_alias, storage_path=dataset.storage_path)
        # ALSO register as the canonical "dataset" alias — the planner prompt (rule 10)
        # hard-codes the primary input table as `dataset` in all generated SQL.  Without
        # this view the DDL fails with "Table 'dataset' not found" and no artifact is created.
        if _primary_alias != "dataset":
            _register_dataset_view(dataset_id, "dataset", storage_path=dataset.storage_path)
        if _primary_alias not in table_registry:
            _col_names: list[str] = []
            _cached = state.get("schema") or {}
            if isinstance(_cached, dict):
                for _c in _cached.get("columns", []):
                    if isinstance(_c, dict) and _c.get("name"):
                        _col_names.append(_c["name"])
            table_registry[_primary_alias] = {
                "duckdb_name": _primary_alias,
                "dataset_id": dataset_id,
                "display_name": _primary_alias,
                "source_intent": "upload",
                "parent_tables": [],
                "row_count": int(dataset.row_count or 0) if dataset else 0,
                "column_names": _col_names,
                "pipeline_step_number": 0,
                "is_artifact": False,
                "is_view": True,
            }

    if state.get("schema"):
        # Schema already loaded — skip expensive reload but return refreshed table_registry.
        return {
            "available_templates": available_templates,
            "calculated_columns": calculated_columns,
            "dashboards": dashboards,
            "table_registry": table_registry,
        }

    # Load secondary dataset schemas so the planner can generate cross-dataset SQL
    secondary_schemas: dict = {}
    secondary_ids: list[str] = list(state.get("secondary_dataset_ids") or [])
    if secondary_ids:
        sec_db = SessionLocal()
        try:
            for sec_id in secondary_ids:
                sec_meta = sec_db.query(DatasetMetaDB).filter(DatasetMetaDB.id == sec_id).first()
                if sec_meta:
                    alias = _sanitize_alias(str(sec_meta.name or sec_id))
                    try:
                        secondary_schemas[alias] = {
                            "dataset_id": sec_id,
                            "columns": list(sec_meta.columns or []),
                            "row_count": int(sec_meta.row_count or 0),
                            "storage_path": sec_meta.storage_path,
                            "schema": DuckDBService.get_schema(sec_id),
                        }
                    except Exception:
                        secondary_schemas[alias] = {
                            "dataset_id": sec_id,
                            "columns": list(sec_meta.columns or []),
                            "row_count": int(sec_meta.row_count or 0),
                            "storage_path": sec_meta.storage_path,
                            "schema": {},
                        }
        finally:
            sec_db.close()

    # (DuckDB session setup moved above early-return check; views already registered)

    try:
        schema = DuckDBService.get_schema(dataset_id)
        stats = DuckDBService.get_column_stats(dataset_id)
        sample_rows = DuckDBService.get_sample_rows(dataset_id, limit=10)
    except Exception as exc:
        base_err: dict = {
            "schema": {},
            "stats": {},
            "sample_rows": [],
            "available_templates": available_templates,
            "calculated_columns": calculated_columns,
            "dashboards": dashboards,
            "error": str(exc),
        }
        if secondary_schemas:
            base_err["secondary_schemas"] = secondary_schemas
        return base_err

    # Primary dataset registry entry
    primary_alias = _sanitize_alias(str(dataset.name if dataset and dataset.name else dataset_id))
    row_count = 0
    col_names: list[str] = []
    if isinstance(schema, dict):
        cols = schema.get("columns") or []
        col_names = [c.get("name", "") for c in cols if isinstance(c, dict)]
    try:
        row_count = int(dataset.row_count) if dataset and dataset.row_count else 0
    except Exception:
        pass

    _register_dataset_view(dataset_id, primary_alias, storage_path=dataset.storage_path if dataset else None)
    # Always register canonical "dataset" alias that planner rule 10 generates SQL against.
    if primary_alias != "dataset" and dataset and dataset.storage_path:
        _register_dataset_view(dataset_id, "dataset", storage_path=dataset.storage_path)

    primary_entry: TableRegistryEntry = {
        "duckdb_name": primary_alias,
        "dataset_id": dataset_id,
        "display_name": primary_alias,
        "source_intent": "upload",
        "parent_tables": [],
        "row_count": row_count,
        "column_names": col_names,
        "pipeline_step_number": 0,
        "is_artifact": False,
        "is_view": True,
    }
    table_registry[primary_alias] = primary_entry

    # Secondary datasets
    for alias, info in (secondary_schemas or {}).items():
        sec_id = info.get("dataset_id", "")
        sec_cols = info.get("columns") or []
        sec_row_count = int(info.get("row_count") or 0)
        _register_dataset_view(sec_id, alias, storage_path=info.get("storage_path"))
        if alias not in table_registry:
            sec_entry: TableRegistryEntry = {
                "duckdb_name": alias,
                "dataset_id": sec_id,
                "display_name": alias,
                "source_intent": "upload",
                "parent_tables": [],
                "row_count": sec_row_count,
                "column_names": [c if isinstance(c, str) else str(c) for c in sec_cols],
                "pipeline_step_number": 0,
                "is_artifact": False,
                "is_view": True,
            }
            table_registry[alias] = sec_entry

    base = {
        "schema": schema,
        "stats": stats,
        "sample_rows": sample_rows,
        "available_templates": available_templates,
        "calculated_columns": calculated_columns,
        "dashboards": dashboards,
        "table_registry": table_registry,
    }
    if secondary_schemas:
        base["secondary_schemas"] = secondary_schemas
    return base
