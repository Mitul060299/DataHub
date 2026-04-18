import logging as _logging

from ..state import AgentState, TableRegistryEntry
from ...duckdb_service import DuckDBService
from ...calculated_columns_service import CalculatedColumnsService
from ...dashboards_v2_service import DashboardsV2Service
from ...duckdb_session import get_connection, register_view, SessionExpiredError
from ...object_storage import StorageService
from ....db import SessionLocal
from ....models_db import ChatTemplateDB, DatasetMetaDB
import re as _re

_logger = _logging.getLogger(__name__)


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
        except Exception as _exc:
            _logger.warning(
                "VIEW_REGISTER_FAILED: alias=%s storage_path=%s error=%s",
                alias, storage_path, _exc,
            )

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

        # DB-backed session replay: reconstruct intermediate pipeline tables from
        # PipelineStepDB whenever the DuckDB session has lost its views.
        # This fires after a server restart, TTL eviction, MemorySaver eviction,
        # or a page refresh when the LangChain checkpoint is gone — recovering
        # the DuckDB session from the SQL that was persisted to the steps table.
        #
        # We can't just check table_registry emptiness — the LangChain checkpoint
        # may preserve the registry even after the in-memory DuckDB connection was
        # evicted/recreated (losing all views).  Instead, probe the session for the
        # first derived view; if it's gone, replay everything.
        _derived_entries = [
            v for v in table_registry.values()
            if isinstance(v, dict) and int(v.get("pipeline_step_number", 0)) > 0
        ]
        _needs_replay = not _derived_entries  # registry empty → definitely need replay
        if _derived_entries and session_id:
            # Registry says derived views exist — verify at least one is live in DuckDB
            _probe_name = _derived_entries[0].get("duckdb_name", "")
            if _probe_name:
                try:
                    get_connection(session_id).execute(
                        f'SELECT 1 FROM "{_probe_name}" LIMIT 0'
                    )
                except Exception:
                    _needs_replay = True
                    _logger.info(
                        "SESSION_PROBE_MISS: view=%s gone from DuckDB, will replay",
                        _probe_name,
                    )
        _restored_pipeline_steps: list[dict] = []

        # ── Build the canonical "what should exist" list for replay ──────────
        # PRIORITY 1: pipeline_steps sent by the frontend in this very request.
        # The frontend persists every executed step (sql + output_table) to
        # localStorage, so this is *immune* to the race where the previous
        # request's pipeline_recorder commit hasn't landed yet.
        # PRIORITY 2: PipelineStepDB rows for this session_id.
        _client_steps_raw = state.get("pipeline_steps") or []
        _client_replayable: list[dict] = []
        for _cs in _client_steps_raw:
            if not isinstance(_cs, dict):
                continue
            _cs_table = str(_cs.get("output_table") or _cs.get("session_table_name") or "").strip()
            _cs_sql = str(_cs.get("sql") or _cs.get("duckdb_sql") or "").strip()
            if not _cs_table or not _cs_sql:
                continue
            try:
                _cs_sn = int(_cs.get("step_number") or 0)
            except Exception:
                _cs_sn = 0
            _client_replayable.append({
                "step_number": _cs_sn,
                "operation": str(_cs.get("operation") or "transform"),
                "description": str(_cs.get("description") or ""),
                "sql": _cs_sql,
                "output_table": _cs_table,
                "row_count_after": int(_cs.get("row_count_after") or _cs.get("rows_affected") or 0)
                    if str(_cs.get("row_count_after") or _cs.get("rows_affected") or "0").lstrip("-").isdigit() else 0,
                "input_tables": list(_cs.get("input_tables") or []),
            })

        if session_id and _needs_replay:
            import re as _re_replay
            _replay_steps: list[dict] = list(_client_replayable)
            if not _replay_steps:
                from ....models_db import PipelineStepDB as _PipelineStepDB
                _replay_db = SessionLocal()
                try:
                    _prior_steps = (
                        _replay_db.query(_PipelineStepDB)
                        .filter(
                            _PipelineStepDB.session_id == session_id,
                            _PipelineStepDB.output_table.isnot(None),
                            _PipelineStepDB.duckdb_sql.isnot(None),
                            _PipelineStepDB.status == "completed",
                        )
                        .order_by(_PipelineStepDB.step_number)
                        .all()
                    )
                    for _ps in _prior_steps:
                        _replay_steps.append({
                            "step_number": int(_ps.step_number or 0),
                            "operation": _ps.operation or "transform",
                            "description": _ps.description or "",
                            "sql": str(_ps.duckdb_sql or ""),
                            "output_table": str(_ps.output_table or ""),
                            "row_count_after": int(_ps.row_count_after or 0),
                            "input_tables": list(_ps.input_tables or []),
                        })
                finally:
                    _replay_db.close()

            _replay_steps.sort(key=lambda s: s.get("step_number") or 0)
            if _replay_steps:
                _replay_conn = get_connection(session_id)
                _failures: list[tuple[int, str]] = []
                for _step in _replay_steps:
                    _out_table = _step["output_table"]
                    _raw_sql = _step["sql"]
                    _ct_m = _re_replay.match(
                        r"(?i)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+\S+\s+AS\s+",
                        _raw_sql,
                    )
                    _select_sql = (_raw_sql[_ct_m.end():].strip() if _ct_m else _raw_sql).rstrip("; \t\r\n")
                    try:
                        _replay_conn.execute(
                            f'CREATE OR REPLACE VIEW "{_out_table}" AS ({_select_sql})'
                        )
                        table_registry[_out_table] = {
                            "duckdb_name": _out_table,
                            "dataset_id": "",
                            "display_name": _step.get("description") or _out_table,
                            "source_intent": _step.get("operation") or "transform",
                            "parent_tables": list(_step.get("input_tables") or []),
                            "row_count": int(_step.get("row_count_after") or 0),
                            "column_names": [],
                            "pipeline_step_number": int(_step.get("step_number") or 0),
                            "is_artifact": False,
                            "is_view": True,
                        }
                        _restored_pipeline_steps.append({
                            "step_number": int(_step.get("step_number") or 0),
                            "operation": _step.get("operation") or "transform",
                            "description": _step.get("description") or "",
                            "sql": _raw_sql,
                            "output_table": _out_table,
                            "row_count_after": int(_step.get("row_count_after") or 0),
                        })
                        _logger.info(
                            "SESSION_REPLAY_VIEW: restored view=%s step=%d session=%s",
                            _out_table, int(_step.get("step_number") or 0), session_id,
                        )
                    except Exception as _replay_err:
                        # Skip-and-continue rather than break.  A later, independent
                        # branch may still be reconstructable; if a downstream step
                        # truly needs this view it will fail loudly when it executes.
                        _failures.append((int(_step.get("step_number") or 0), str(_replay_err)[:200]))
                        _logger.warning(
                            "SESSION_REPLAY_FAILED: table=%s step=%d error=%s",
                            _out_table, int(_step.get("step_number") or 0), _replay_err,
                        )
                if _failures:
                    _logger.warning(
                        "SESSION_REPLAY_PARTIAL: session=%s failures=%s",
                        session_id, _failures,
                    )

        # Always restore authoritative pipeline_steps when nothing was replayed.
        # Prefer client-sent steps (race-immune) over the DB.
        if session_id and not _restored_pipeline_steps:
            if _client_replayable:
                _restored_pipeline_steps = [
                    {
                        "step_number": s["step_number"],
                        "operation": s["operation"],
                        "description": s["description"],
                        "sql": s["sql"],
                        "output_table": s["output_table"],
                        "row_count_after": s["row_count_after"],
                    }
                    for s in _client_replayable
                ]
                _logger.info(
                    "PIPELINE_STEPS_RESTORED: count=%d session=%s source=client_payload",
                    len(_restored_pipeline_steps), session_id,
                )
            else:
                from ....models_db import PipelineStepDB as _PipelineStepDB2
                _ps_db = SessionLocal()
                try:
                    _db_steps = (
                        _ps_db.query(_PipelineStepDB2)
                        .filter(
                            _PipelineStepDB2.session_id == session_id,
                            _PipelineStepDB2.status == "completed",
                        )
                        .order_by(_PipelineStepDB2.step_number)
                        .all()
                    )
                    for _ps2 in _db_steps:
                        _restored_pipeline_steps.append({
                            "step_number": int(_ps2.step_number or 0),
                            "operation": _ps2.operation or "transform",
                            "description": _ps2.description or "",
                            "sql": _ps2.duckdb_sql or "",
                            "output_table": _ps2.output_table or "",
                            "row_count_after": int(_ps2.row_count_after or 0),
                        })
                    _logger.info(
                        "PIPELINE_STEPS_RESTORED: count=%d session=%s source=db_fallback",
                        len(_restored_pipeline_steps), session_id,
                    )
                finally:
                    _ps_db.close()

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
        if _restored_pipeline_steps:
            early["pipeline_steps"] = _restored_pipeline_steps
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
        if _restored_pipeline_steps:
            base_err["pipeline_steps"] = _restored_pipeline_steps
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
    # Register "dataset" as a DuckDB compatibility fallback — do NOT remove this.
    # Non-LLM callers that depend on this alias:
    #   - ai_agent_service.py query_parquet() sampling ("SELECT * FROM dataset LIMIT …")
    #   - duckdb_service.py _normalize_dataset_sql() connector SQL normalisation
    # LLM-generated SQL should now use the named alias; execute_step rewrites any
    # residual "FROM dataset" references at runtime and emits a WARNING to signal
    # a planner prompt regression.
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
    if _restored_pipeline_steps:
        base["pipeline_steps"] = _restored_pipeline_steps
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
