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
        # Also register a "dataset" alias as a compatibility fallback for any SQL
        # the LLM generates that still uses the generic name. Execute_step will
        # rewrite these before execution, but the view must exist as a backstop.
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

        # Re-register artifact tables from prior turns so their DuckDB views survive
        # a session restart (e.g. server restart, session age > 2 h).
        if session_id and table_registry:
            _art_db = SessionLocal()
            try:
                for _entry in list(table_registry.values()):
                    if _entry.get("pipeline_step_number", 0) > 0:
                        _art_ds_id = _entry.get("dataset_id", "")
                        if not _art_ds_id:
                            continue
                        _art_ds = _art_db.query(DatasetMetaDB).filter(
                            DatasetMetaDB.id == _art_ds_id
                        ).first()
                        if _art_ds and _art_ds.storage_path:
                            _register_dataset_view(
                                _art_ds_id,
                                _entry["duckdb_name"],
                                storage_path=_art_ds.storage_path,
                            )
            finally:
                _art_db.close()

    # Store the primary alias in the state so execute_step can rewrite
    # any residual "FROM dataset" references at runtime.
    if dataset and dataset.storage_path:
        table_registry["__primary_alias__"] = _primary_alias  # type: ignore[possibly-undefined]

    # Auto-discover all other datasets in the workspace so the planner can reference
    # them by name in SQL.  This is expensive (DB query + N DuckDB view registrations)
    # so we skip it on turns where the intent is already known to be single-dataset.
    # On the first turn intent is "" (not yet classified) so we always run it.
    _MULTI_DATASET_INTENTS = {"join", "union", "merge", "reconcile", "compare", "append", ""}
    _current_intent = state.get("intent", "")
    _run_secondary = _current_intent in _MULTI_DATASET_INTENTS

    secondary_schemas: dict = {}
    if _run_secondary:
        _sec_db2 = SessionLocal()
        try:
            workspace_datasets_list = (
                _sec_db2.query(DatasetMetaDB)
                .filter(
                    DatasetMetaDB.workspace_id == workspace_id,
                    DatasetMetaDB.id != dataset_id,
                )
                .limit(20)
                .all()
            )
            for sec_meta in workspace_datasets_list:
                sec_id = str(sec_meta.id)
                alias = _sanitize_alias(str(sec_meta.name or sec_id))
                secondary_schemas[alias] = {
                    "dataset_id": sec_id,
                    "columns": list(sec_meta.columns or []),
                    "row_count": int(sec_meta.row_count or 0),
                    "storage_path": sec_meta.storage_path,
                    "schema": {},
                }
                # Register the DuckDB view and table_registry entry for every secondary
                # dataset on every turn so join SQL works even after session restarts.
                _register_dataset_view(sec_id, alias, storage_path=sec_meta.storage_path)
                if alias not in table_registry:
                    _sec_cols = list(sec_meta.columns or [])
                    table_registry[alias] = {
                        "duckdb_name": alias,
                        "dataset_id": sec_id,
                        "display_name": alias,
                        "source_intent": "upload",
                        "parent_tables": [],
                        "row_count": int(sec_meta.row_count or 0),
                        "column_names": [c if isinstance(c, str) else str(c) for c in _sec_cols],
                        "pipeline_step_number": 0,
                        "is_artifact": False,
                        "is_view": True,
                    }
        finally:
            _sec_db2.close()

    if state.get("schema"):
        # Schema already loaded — skip expensive reload but return refreshed
        # table_registry (now includes secondary datasets) and secondary_schemas.
        early: dict = {
            "available_templates": available_templates,
            "calculated_columns": calculated_columns,
            "dashboards": dashboards,
            "table_registry": table_registry,
        }
        if secondary_schemas:
            early["secondary_schemas"] = secondary_schemas
        return early

    # (DuckDB session setup and secondary registration already done above)

    try:
        schema = DuckDBService.get_schema(dataset_id)
        stats = DuckDBService.get_column_stats(dataset_id)
        sample_rows = DuckDBService.get_sample_rows(dataset_id, limit=5)
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

    # Secondary dataset views and table_registry entries were already registered
    # in the block above (before the early-return check) — no need to repeat.

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

        # Detect overlapping columns between primary and secondary datasets
        # and populate join_suggestions for the responder to surface.
        primary_cols = set(col_names)
        join_suggestions: list[dict] = []
        for alias, info in secondary_schemas.items():
            sec_cols_raw = info.get("columns") or []
            sec_col_names = {c if isinstance(c, str) else str(c) for c in sec_cols_raw}
            overlapping = primary_cols & sec_col_names
            if overlapping:
                # Prefer short column names as join keys (id-like columns first)
                best_col = next(
                    (c for c in sorted(overlapping) if "id" in c.lower() or "key" in c.lower()),
                    next(iter(sorted(overlapping))),
                )
                join_suggestions.append({
                    "secondary_id": info.get("dataset_id", alias),
                    "secondary_name": alias,
                    "on_column": best_col,
                    "all_overlapping": sorted(overlapping),
                })
        if join_suggestions:
            base["join_suggestions"] = join_suggestions

    return base
