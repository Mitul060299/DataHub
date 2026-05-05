import logging
import os
import re
import uuid
from datetime import datetime, timezone

from ..edges import _next_ready_step
from ..state import AgentState, ExecutionResult, TableRegistryEntry
from ....db import SessionLocal
from ....models_db import DatasetMetaDB, User
from ...calculated_columns_service import CalculatedColumnsService
from ...dashboards_v2_service import DashboardsV2Service
from ...plan_guard import normalize_plan
from ...duckdb_session import (
    register_table_from_sql,
    register_view_from_sql,
    execute_in_session,
    get_connection,
    SessionExpiredError,
    QueryTimeoutError,
    BlockedSQLError,
)
from ...export_service import ExportService
from ...echarts_builder import build_echarts_config, infer_chart_type
from ...object_storage import StorageService


def _sanitize_sql_quotes(sql: str) -> str:
    """Replace MySQL-style backtick identifiers with DuckDB ANSI double-quote identifiers.

    The LLM occasionally generates MySQL-style backtick quoting for column names that
    contain spaces (e.g. `Customer ID`). DuckDB only supports ANSI double-quote
    identifiers ("Customer ID") and will raise a Parser Error on backticks.
    """
    if not sql or '`' not in sql:
        return sql
    return re.sub(r'`([^`]+)`', r'"\1"', sql)


def _fix_coalesce_star_collision(sql: str) -> str:
    """Auto-insert ``EXCLUDE`` after ``*`` when the SELECT also defines an alias
    matching an existing column (typical clean / null-fill pattern).

    The LLM frequently produces:
        SELECT COALESCE("Item", 'unknown') AS "Item", * FROM tbl
    DuckDB rejects this with:
        Binder Error: Column "Item" referenced that exists in the SELECT clause
        - but this column cannot be referenced before it is defined.

    Rewrites to:
        SELECT COALESCE("Item", 'unknown') AS "Item", * EXCLUDE ("Item") FROM tbl

    Only touches plain SELECT statements where ``*`` appears unqualified (not
    ``t.*``) and is not already followed by EXCLUDE / REPLACE.
    """
    if not sql or '*' not in sql:
        return sql

    # Match a single SELECT … FROM head (anchored at the start, case-insensitive,
    # DOTALL so multi-line lists work). Capture the SELECT list between SELECT
    # and the FROM keyword.
    head_re = re.compile(
        r'^(\s*SELECT\s+)(.+?)(\s+FROM\s+)',
        re.IGNORECASE | re.DOTALL,
    )
    m = head_re.match(sql)
    if not m:
        return sql
    select_list = m.group(2)

    # Find a bare ``*`` (not preceded by ``.`` and not already followed by
    # EXCLUDE/REPLACE). Allow whitespace/parens around it.
    star_re = re.compile(
        r'(?<![\w.])\*(?!\s*(?:EXCLUDE|REPLACE)\b)',
        re.IGNORECASE,
    )
    if not star_re.search(select_list):
        return sql

    # Collect aliases of the form ``... AS "<name>"`` or ``... AS <name>``.
    alias_re = re.compile(
        r'\bAS\s+("([^"]+)"|`([^`]+)`|([A-Za-z_][\w]*))',
        re.IGNORECASE,
    )
    aliases: list[str] = []
    for am in alias_re.finditer(select_list):
        aliases.append(am.group(2) or am.group(3) or am.group(4) or "")
    aliases = [a for a in aliases if a]
    if not aliases:
        return sql

    # Quote each alias for the EXCLUDE clause.
    excluded = ", ".join(f'"{a}"' for a in aliases)
    new_select_list = star_re.sub(f"* EXCLUDE ({excluded})", select_list, count=1)
    if new_select_list == select_list:
        return sql

    logging.getLogger(__name__).warning(
        "SQL_COALESCE_STAR_FIX: auto-inserted EXCLUDE (%s) after '*' to avoid "
        "DuckDB binder collision with redefined column(s).",
        excluded,
    )
    return sql[: m.start(2)] + new_select_list + sql[m.end(2):]


def _primary_alias_from_state(state: AgentState) -> str:
    """Return the primary dataset's named DuckDB alias (never the generic 'dataset')."""
    table_registry: dict = dict(state.get("table_registry") or {})
    # Stored by context_loader under the sentinel key "__primary_alias__".
    stored = table_registry.get("__primary_alias__")
    if isinstance(stored, str) and stored and stored != "dataset":
        return stored
    # Fallback: find the registry entry with pipeline_step_number == 0
    # that is not the sentinel and not the compatibility alias.
    for name, entry in table_registry.items():
        if name == "__primary_alias__":
            continue
        if isinstance(entry, dict) and entry.get("pipeline_step_number", -1) == 0 and name != "dataset":
            return name
    return "dataset"  # last-resort — keeps old behaviour


def _rewrite_dataset_alias(sql: str, primary_alias: str) -> str:
    """Replace bare `dataset` table references with the named primary alias.

    Matches the word `dataset` only when it appears as a table reference:
      - FROM dataset
      - JOIN dataset
      - PIVOT dataset
    Does NOT replace `dataset` when it is part of a longer identifier
    (e.g. dataset_clean, my_dataset) thanks to the word-boundary anchors.
    """
    if not sql or not primary_alias or primary_alias == "dataset":
        return sql
    _pattern = re.compile(r'\b(FROM|JOIN|PIVOT)\s+dataset\b', re.IGNORECASE)
    if _pattern.search(sql):
        logging.getLogger(__name__).warning(
            "SQL_ALIAS_FALLBACK: LLM generated 'FROM dataset' — "
            "substituting with primary alias '%s'. "
            "This indicates a planner prompt regression.",
            primary_alias,
        )
    return _pattern.sub(lambda m: f"{m.group(1)} {primary_alias}", sql)


def _rewrite_stale_source(sql: str, state: AgentState) -> str:
    """Safety net: if the LLM's SQL targets the raw primary source but a derived
    table with a higher pipeline_step_number already exists in the registry,
    rewrite FROM/JOIN to use that derived table instead.

    Also catches HALLUCINATED chain names (e.g. ``FROM <primary>_clean``) where
    the LLM guessed a step output name instead of using the actual registered
    duckdb_name (``clean_<n>_<hex6>``). Any FROM/JOIN target that is not present
    in the table_registry is rewritten to the latest derived predecessor.

    Logs SQL_CHAIN_FALLBACK for observability.
    """
    table_registry: dict = dict(state.get("table_registry") or {})
    primary = _primary_alias_from_state(state)
    if not primary or primary == "dataset":
        return sql
    # Latest derived table in the registry.
    best_alias: str | None = None
    best_step = -1
    for name, entry in table_registry.items():
        if not isinstance(entry, dict):
            continue
        sn = entry.get("pipeline_step_number", 0)
        if sn > 0 and sn > best_step:
            best_alias, best_step = name, sn
    if not best_alias:
        return sql

    log = logging.getLogger(__name__)
    known_tables = {
        n for n, e in table_registry.items()
        if isinstance(e, dict) and n != "__primary_alias__"
    }

    def _sub(match: "re.Match[str]") -> str:
        kw = match.group(1)
        target = match.group(2)
        # Strip optional surrounding quotes/backticks.
        target_clean = target.strip().strip('"').strip("`")
        if target_clean == primary or target_clean not in known_tables:
            log.warning(
                "SQL_CHAIN_FALLBACK: SQL references '%s' (primary=%s, known=%s) — "
                "rewriting to derived table '%s' (step %d).",
                target_clean, primary, sorted(known_tables), best_alias, best_step,
            )
            return f"{kw} {best_alias}"
        return match.group(0)

    # Match FROM/JOIN <ident> where ident is an unquoted identifier.
    # We deliberately skip subquery refs (FROM ( ... )) and quoted schemas.
    pattern = re.compile(r'\b(FROM|JOIN)\s+([A-Za-z_][\w]*)\b', re.IGNORECASE)
    return pattern.sub(_sub, sql)


def _resolve_input_table(step: dict, state: AgentState) -> str:
    """Return the DuckDB table name that this step should read from.

    For branching steps (depends_on is set), find the most-recently registered
    table_registry entry whose pipeline_step_number is in depends_on.
    Falls back to the named primary alias when no match is found.
    For sequential steps (depends_on absent or empty), also returns the primary
    named alias so generated SQL references the correct dataset.
    """
    depends_on: list[int] = step.get("depends_on") or []
    primary = _primary_alias_from_state(state)
    if not depends_on:
        return primary
    table_registry: dict = dict(state.get("table_registry") or {})
    # Prefer entries whose step number is the highest in depends_on
    # (the most derived predecessor) as the default input table.
    best: str | None = None
    best_step = -1
    for entry in table_registry.values():
        if not isinstance(entry, dict):
            continue
        sn = entry.get("pipeline_step_number", -1)
        if sn in depends_on and sn > best_step:
            best = entry["duckdb_name"]
            best_step = sn
    return best if best else primary


async def execute_step(state: AgentState) -> dict:
    # Auto mode and manual mode share state["plan"] (auto_planner writes a
    # plan_compat into the same field) but use different counter semantics:
    #   - manual: current_step_index = NEXT step to execute (incremented on exit)
    #   - auto:   current_rule_index = step JUST executed (per step_validator's
    #     contract; downstream routers compute next as current_rule_index + 1)
    auto_mode = bool(state.get("auto_mode"))
    plan = state["plan"]

    if auto_mode:
        # Find next step ready to run from completed_step_numbers (handles
        # branching plans correctly via depends_on).
        completed = state.get("completed_step_numbers", [])
        idx = _next_ready_step(plan, completed)
        if idx < 0:
            idx = len(plan)
    else:
        idx = state["current_step_index"]

    def _step_counter(next_idx: int) -> dict:
        """Return the correct counter key for the current mode.

        Manual: writes the NEXT step index (next_idx, i.e. idx+1 from caller).
        Auto:   writes the JUST-EXECUTED step index (next_idx - 1, i.e. idx)
                because step_validator + route_after_execute expect that.
        """
        if auto_mode:
            return {"current_rule_index": next_idx - 1}
        return {"current_step_index": next_idx}

    if idx >= len(plan):
        # Plan exhausted — leave counters untouched so routers can finalize.
        return {}

    step = plan[idx]

    db = SessionLocal()
    try:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == state["dataset_id"]).first()
        if not dataset:
            raise ValueError("Dataset not found")

        operation = str(step.get("operation") or "transform")
        parameters = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
        step_sql = _sanitize_sql_quotes(str(parameters.get("sql") or step.get("sql") or "").strip())
        # Rewrite any residual "FROM dataset" / "JOIN dataset" refs to the actual named alias.
        step_sql = _rewrite_dataset_alias(step_sql, _primary_alias_from_state(state))
        # Safety net: if LLM ignored chain rule and wrote FROM <original> when a derived
        # table already exists, silently promote to the latest derived table.
        step_sql = _rewrite_stale_source(step_sql, state)
        # Safety net: auto-insert EXCLUDE after `*` when SELECT also redefines a column
        # (typical clean / null-fill pattern that would otherwise raise a Binder Error).
        step_sql = _fix_coalesce_star_collision(step_sql)

        if operation in {"add_column", "create_column"} or state.get("intent") == "add_column":
            column_name = str(parameters.get("column_name") or parameters.get("name") or "").strip()
            formula = str(parameters.get("formula") or "").strip()
            column_type = str(parameters.get("column_type") or "dynamic").strip().lower()
            display_name = parameters.get("display_name")

            if not column_name:
                raise ValueError("Column name is required for add_column")
            if not formula:
                raise ValueError("Formula is required for add_column")

            created = CalculatedColumnsService.create_column(
                dataset_id=state["dataset_id"],
                name=column_name,
                formula=formula,
                column_type=column_type,
                display_name=str(display_name) if isinstance(display_name, str) else None,
            )

            execution_result: ExecutionResult = {
                "step_number": step["step_number"],
                "operation": "add_column",
                "success": True,
                "rows_affected": None,
                "run_id": None,
                "output_dataset_id": state.get("dataset_id"),
                "sql": formula,
                "error": None,
                "column_added": {
                    "id": created.id,
                    "name": created.name,
                    "formula": created.formula,
                    "column_type": created.column_type,
                },
            }
            return {
                "execution_results": [*state.get("execution_results", []), execution_result],
                "dataset_id": state.get("dataset_id"),
                **_step_counter(idx + 1),
                "retry_count": 0,
                "error": None,
                "completed_step_numbers": [*state.get("completed_step_numbers", []), step["step_number"]],
            }

        if operation in {"create_chart", "visualise"} or state.get("intent") == "visualise":
            dashboard_id = str(parameters.get("dashboard_id") or "").strip()
            title = str(parameters.get("title") or step.get("description") or "AI chart").strip()
            chart_type = str(parameters.get("chart_type") or "bar").strip().lower()
            query_spec = parameters.get("query_spec") if isinstance(parameters.get("query_spec"), dict) else {}
            layout = parameters.get("layout") if isinstance(parameters.get("layout"), dict) else {}
            subtitle = str(parameters.get("subtitle") or "").strip() or None
            x_col = str(parameters.get("x_axis") or parameters.get("x_col") or "").strip()
            y_col_raw = parameters.get("y_axis") or parameters.get("y_col") or ""
            y_col: str | list[str] = y_col_raw if isinstance(y_col_raw, list) else str(y_col_raw).strip()
            group_by = str(parameters.get("group_by") or "").strip() or None

            # Planner rule 9 puts the chart SQL inside query_spec.sql —
            # fall back so we can fetch rows even when top-level sql is absent.
            if not step_sql and isinstance(query_spec, dict):
                step_sql = str(query_spec.get("sql") or "").strip()

            if not query_spec and step_sql:
                query_spec = {
                    "sql": step_sql,
                    "dataset_id": state.get("dataset_id"),
                }

            user_id = state.get("user_id") or dataset.user_id or "agent"

            # ── Pull rows from session DuckDB ──────────────────────────────
            session_id = state.get("session_id") or ""
            table_registry: dict = dict(state.get("table_registry") or {})
            _qs_source = query_spec.get("source_table") if isinstance(query_spec, dict) else ""
            source_table = str(parameters.get("source_table") or _qs_source or "").strip()

            # "dataset" is always registered as a view by context_loader —
            # use it as the fallback so a raw table scan works even when
            # the planner didn't supply an explicit source_table.
            # For branching plans, _resolve_input_table picks the correct predecessor.
            if not source_table or source_table not in table_registry:
                source_table = _resolve_input_table(step, state)

            if not step_sql:
                import logging as _logging
                _logging.getLogger(__name__).warning(
                    "CHART_NO_SQL: create_chart step has no SQL. "
                    "x_col=%s y_col=%s — will fall back to raw table scan. "
                    "Planner should always generate aggregation SQL for chart steps.",
                    x_col, y_col,
                )

            rows: list[dict] = []
            col_types: dict[str, str] = {}

            # First pass: run the aggregation/filter SQL — this is the chart query.
            # Must run before the full table scan so grouped results are used, not raw rows.
            if session_id and step_sql:
                try:
                    rows = execute_in_session(session_id, step_sql)
                    if rows and not col_types:
                        col_types = {k: "VARCHAR" for k in rows[0].keys()}
                except Exception:
                    rows = []

            # Second pass: fall back to full table scan only if no SQL or SQL returned nothing.
            # This gives build_echarts_config something to work with for simple "show me a chart"
            # requests where no aggregation SQL was generated.
            if not rows and session_id and source_table:
                try:
                    rows = execute_in_session(session_id, f"SELECT * FROM {source_table} LIMIT 500")
                    try:
                        desc = execute_in_session(session_id, f"DESCRIBE {source_table}")
                        col_types = {
                            r.get("column_name", r.get("name", "")): r.get("column_type", r.get("type", ""))
                            for r in desc
                        }
                    except Exception:
                        pass
                except Exception:
                    rows = []

            # ── Auto-select chart type if not explicit ────────────────────
            col_names = list(col_types.keys()) or (list(rows[0].keys()) if rows else [])
            if chart_type in ("", "auto", "bar") and rows:
                inferred_type, _alternatives = infer_chart_type(
                    col_names, col_types, len(rows), str(state.get("intent") or "")
                )
                if chart_type in ("", "auto"):
                    chart_type = inferred_type

            # ── Auto-select x/y if not provided ──────────────────────────
            if not x_col and col_names:
                x_col = col_names[0]
            if not y_col and len(col_names) > 1:
                y_col = col_names[1]

            # ── Build ECharts config ──────────────────────────────────────
            echarts_config: dict | None = None
            if rows or chart_type == "table":
                try:
                    echarts_config = build_echarts_config(
                        chart_type=chart_type,
                        rows=rows,
                        x_col=x_col or (col_names[0] if col_names else "x"),
                        y_col=y_col or (col_names[1] if len(col_names) > 1 else "y"),
                        group_by=group_by,
                        title=title,
                        subtitle=subtitle,
                    )
                except Exception:
                    echarts_config = None

            # Charts are ephemeral — not persisted until the user explicitly
            # clicks "Save to Visualizations" in the AI panel.
            chart_id = str(uuid.uuid4())

            execution_result = {
                "step_number": step["step_number"],
                "operation": "create_chart",
                "success": True,
                "rows_affected": len(rows) if rows else None,
                "run_id": None,
                "output_dataset_id": state.get("dataset_id"),
                "sql": step_sql or None,
                "error": None,
                "tile_created": {
                    "chart_id": chart_id,
                    "title": title,
                    "chart_type": chart_type,
                    "echarts_config": echarts_config,
                    "saveable": True,
                },
            }
            return {
                "execution_results": [*state.get("execution_results", []), execution_result],
                "dataset_id": state.get("dataset_id"),
                **_step_counter(idx + 1),
                "retry_count": 0,
                "error": None,
                "completed_step_numbers": [*state.get("completed_step_numbers", []), step["step_number"]],
            }

        from ...pipeline_engine import PipelineEngine

        # ── Session-based operations (use DuckDB session for 8 new intents) ───
        _SESSION_OPS = {"clean", "validate", "filter", "transform", "summarise", "pivot", "union", "reconcile", "export"}
        if operation in _SESSION_OPS or state.get("intent") in _SESSION_OPS:
            intent_key = operation if operation in _SESSION_OPS else str(state.get("intent"))
            session_id = state.get("session_id") or ""
            table_registry: dict = dict(state.get("table_registry") or {})

            try:
                if intent_key == "export":
                    fmt = str(parameters.get("format") or "csv").lower()
                    src_table = str(parameters.get("input_table") or parameters.get("source_table") or "").strip()
                    display_name = str(parameters.get("display_name") or src_table or "export")
                    artifact_url = ExportService.export(
                        session_id=session_id,
                        duckdb_name=src_table,
                        fmt=fmt,
                        dataset_id=str(state.get("dataset_id") or ""),
                        user_id=str(state.get("user_id") or "agent"),
                        display_name=display_name,
                    )
                    execution_result: ExecutionResult = {
                        "step_number": step["step_number"],
                        "operation": "export",
                        "success": True,
                        "rows_affected": None,
                        "run_id": None,
                        "output_dataset_id": state.get("dataset_id"),
                        "sql": step_sql or None,
                        "error": None,
                        "artifact_url": artifact_url,
                    }
                    # Mark source table entry as artifact
                    if src_table in table_registry:
                        table_registry[src_table]["is_artifact"] = True
                        table_registry[src_table]["artifact_url"] = artifact_url
                    return {
                        "execution_results": [*state.get("execution_results", []), execution_result],
                        "dataset_id": state.get("dataset_id"),
                        **_step_counter(idx + 1),
                        "retry_count": 0,
                        "error": None,
                        "table_registry": table_registry,
                        "completed_step_numbers": [*state.get("completed_step_numbers", []), step["step_number"]],
                    }

                elif intent_key in {"validate", "summarise"}:
                    import re as _re
                    if not step_sql:
                        raise ValueError(f"No SQL provided for {intent_key} step")

                    rows: list = []
                    result_table: str | None = None

                    # The planner (rule 15) generates:
                    #   CREATE TABLE <name>_summary AS SELECT … GROUP BY …
                    # Running that DDL through execute_in_session returns []
                    # because DDL produces no result rows — the user sees nothing.
                    # Detect CREATE TABLE … AS SELECT, materialise it, then
                    # SELECT * from the new table for the inline preview, and
                    # upload a Parquet snapshot to S3 for the artifact download link.
                    _ct_match = _re.match(
                        r"CREATE\s+(?:TEMP(?:ORARY)?\s+)?(?:OR\s+REPLACE\s+)?"
                        r"TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(['\"]?[\w]+['\"]?)\s+AS\b",
                        step_sql.strip(),
                        _re.IGNORECASE,
                    )

                    if _ct_match and session_id:
                        result_table = _ct_match.group(1).strip("'\"")
                        # Execute the DDL directly — do NOT pass it to register_table_from_sql
                        # which would double-wrap it as:
                        #   CREATE OR REPLACE TABLE x AS CREATE TABLE x AS SELECT …
                        # (invalid DuckDB SQL). Instead we normalise the DDL to
                        # CREATE OR REPLACE TABLE for idempotent re-runs and run it raw.
                        try:
                            _normalized_ddl = _re.sub(
                                r"CREATE\s+(?:TEMP(?:ORARY)?\s+)?(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?",
                                "CREATE OR REPLACE TABLE ",
                                step_sql.strip(),
                                count=1,
                                flags=_re.IGNORECASE,
                            )
                            get_connection(session_id).execute(_normalized_ddl)
                        except Exception as _ddl_exc:
                            import logging as _logging
                            _logging.getLogger(__name__).warning(
                                "summarise DDL failed for %s: %s", result_table, _ddl_exc
                            )
                            result_table = None
                        try:
                            rows = execute_in_session(session_id, f"SELECT * FROM {result_table} LIMIT 500") if result_table else []
                        except Exception:
                            rows = []

                        # Only register when the DDL actually succeeded
                        if result_table:
                            # Register the new table in the session registry so it appears
                            # in the session-tables sidebar and is referenceable in follow-up
                            col_names: list[str] = list(rows[0].keys()) if rows else []
                            table_registry[result_table] = {
                                "duckdb_name": result_table,
                                "dataset_id": str(state.get("dataset_id") or ""),
                                "display_name": result_table,
                                "source_intent": intent_key,
                                "parent_tables": [],
                                "row_count": len(rows),
                                "column_names": col_names,
                                "pipeline_step_number": step["step_number"],
                                "is_artifact": False,
                                "is_view": False,
                            }
                    else:
                        # Plain SELECT — execute and return rows
                        rows = execute_in_session(session_id, step_sql) if session_id else []
                        # Give the result a logical table name so step cards have a label
                        result_table = f"{intent_key}_{step['step_number']}_{uuid.uuid4().hex[:6]}"

                    result_dict: dict = {
                        "step_number": step["step_number"],
                        "operation": intent_key,
                        "success": True,
                        "rows_affected": len(rows) if isinstance(rows, list) else None,
                        "run_id": None,
                        "output_dataset_id": state.get("dataset_id"),
                        "sql": step_sql,
                        "error": None,
                        "query_results": rows,
                        "output_table": result_table,
                        "session_table_name": result_table,
                        "row_count_after": len(rows) if isinstance(rows, list) else None,
                    }
                    execution_result = result_dict
                    _sv_out_ds = result_dict.get("output_dataset_id") or state.get("dataset_id")
                    return {
                        "execution_results": [*state.get("execution_results", []), execution_result],
                        "dataset_id": _sv_out_ds,
                        **_step_counter(idx + 1),
                        "retry_count": 0,
                        "error": None,
                        "query_results": rows,
                        "table_registry": table_registry,
                        "completed_step_numbers": [*state.get("completed_step_numbers", []), step["step_number"]],
                    }

                else:
                    # Write ops: clean, filter, transform, pivot, union, reconcile
                    # ─── Power Query-inspired lazy execution ───────────────────
                    # All transforms are composable SQL views (non-destructive).
                    # Preview uses LIMIT sampling (query folding through view chain).
                    # Full materialization only on explicit export / save.
                    from ...step_engine import StepEngine

                    output_table = str(
                        parameters.get("output_table")
                        or parameters.get("output_name")
                        or f"{intent_key}_{step['step_number']}_{uuid.uuid4().hex[:6]}"
                    )
                    if not step_sql:
                        raise ValueError(f"No SQL provided for {intent_key} step")

                    # Keep original SQL for display; strip prefix for execution.
                    original_step_sql = step_sql
                    import re as _re_step
                    _ddl_name: str | None = None
                    _ct_match = _re_step.match(
                        r"(?i)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(\S+)\s+AS\s+",
                        step_sql,
                    )
                    if _ct_match:
                        _ddl_name = _ct_match.group(1).strip('"\'`')
                        step_sql = step_sql[_ct_match.end():].strip()

                    # Rewrite DDL-named references to registered table names.
                    for _reg_name, _reg_entry in list(table_registry.items()):
                        if not isinstance(_reg_entry, dict):
                            continue
                        _reg_duckdb = _reg_entry.get("duckdb_name", "")
                        _reg_ddl = _reg_entry.get("ddl_name", "")
                        if _reg_ddl and _reg_ddl != _reg_duckdb:
                            step_sql = _re_step.sub(
                                rf"\b{_re_step.escape(_reg_ddl)}\b",
                                _reg_duckdb,
                                step_sql,
                            )

                    # Resolve the source table for this step.
                    _rb_src = (
                        parameters.get("source_table")
                        or parameters.get("input_table")
                        or next(
                            (
                                v["duckdb_name"]
                                for v in sorted(
                                    (e for e in table_registry.values() if isinstance(e, dict)),
                                    key=lambda _x: _x.get("pipeline_step_number", 0),
                                    reverse=True,
                                )
                                if 0 <= v.get("pipeline_step_number", 0) < step["step_number"]
                            ),
                            None,
                        )
                    ) if session_id else None

                    # Infer input_tables for registry tracking.
                    input_tables = list(parameters.get("input_tables") or [])
                    if not input_tables:
                        primary_alias = next(
                            (k for k, v in table_registry.items() if isinstance(v, dict) and v.get("dataset_id") == str(state.get("dataset_id"))),
                            None,
                        )
                        if primary_alias:
                            input_tables = [primary_alias]

                    if session_id:
                        # Reject non-deterministic SQL BEFORE persisting / snapshotting.
                        # Catching this here means we never write a Parquet snapshot
                        # whose contents would silently diverge from a future replay
                        # (the whole point of the snapshot architecture is that
                        # replay must be byte-identical to original execution).
                        from ...sql_safety import reject_nondeterministic
                        reject_nondeterministic(step_sql, context=f"step {step['step_number']}")

                        # Apply step as lazy VIEW via StepEngine
                        # (Power Query pattern: non-destructive, composable, sampled preview)
                        engine = StepEngine(session_id, table_registry)
                        step_result = engine.apply_step(
                            sql=step_sql,
                            output_name=output_table,
                            source_table=_rb_src or "",
                            step_number=step["step_number"],
                            operation=intent_key,
                            input_tables=input_tables,
                            ddl_name=_ddl_name,
                            display_name=str(parameters.get("display_name") or _ddl_name or output_table),
                        )
                        rows_out = step_result.row_count
                        out_cols = [c["name"] for c in step_result.column_schema]
                        column_schema = step_result.column_schema
                        preview_rows = step_result.preview_rows
                        row_count_before = step_result.row_count_before
                        rows_changed = step_result.rows_changed
                        _exec_time_ms = step_result.execution_time_ms

                        # ── AUTO-SNAPSHOT: durable replay backbone ───────────
                        # Persist this step's output to object storage as a
                        # Parquet file immediately. ``_replay_session_views``
                        # prefers this snapshot over re-executing duckdb_sql
                        # when a session is lost or the instance restarts —
                        # making replay deterministic and O(1) per step.
                        #
                        # This is best-effort and does NOT block the step's
                        # success. Failures (S3 quota, network blip) just
                        # mean replay falls back to SQL re-execution which is
                        # the prior behaviour.
                        #
                        # Cap by row count to avoid OOM on the 512 MB Render
                        # tier — chains on huge tables fall back to SQL replay.
                        _SNAPSHOT_ROW_CAP = int(os.getenv("STEP_SNAPSHOT_ROW_CAP", "500000"))
                        snapshot_path: str | None = None
                        if rows_out is not None and rows_out <= _SNAPSHOT_ROW_CAP:
                            try:
                                _snap_uid = str(state.get("user_id") or "agent")
                                _snap_dsid = str(state.get("dataset_id") or "agent")
                                snapshot_path = engine.snapshot_to_parquet(
                                    output_table, _snap_dsid, _snap_uid,
                                )
                            except Exception as _snap_exc:
                                # snapshot_to_parquet already logs; just keep going
                                snapshot_path = None
                    else:
                        rows_out = None
                        out_cols = []
                        column_schema = []
                        preview_rows = []
                        row_count_before = None
                        rows_changed = None
                        _exec_time_ms = 0
                        snapshot_path = None

                    # ── Scan byte tracking ────────────────────────────────────
                    # Charge the source dataset's size to the billing account ONCE per
                    # pipeline run (not per step). Repeated steps on the same dataset
                    # do not multiply the charge.
                    _scan_ds_id = str(state.get("dataset_id") or "")
                    _already_charged = bool(
                        _scan_ds_id and _scan_ds_id in (state.get("scan_charged_dataset_ids") or [])
                    )
                    if _scan_ds_id and not _already_charged:
                        try:
                            _scan_db_session = SessionLocal()
                            try:
                                from ...usage_service import increment_scan_bytes, enforce_scan_limit
                                from ...plan_guard import resolve_project_plan as _resolve_proj_plan
                                _ds_meta = _scan_db_session.query(DatasetMetaDB).filter(
                                    DatasetMetaDB.id == _scan_ds_id
                                ).first()
                                if _ds_meta:
                                    _scan_bytes = (
                                        _ds_meta.file_size_bytes
                                        or _ds_meta.compressed_size_bytes
                                        or ((_ds_meta.row_count or 0) * 500)
                                    )
                                else:
                                    _scan_bytes = 0
                                if _scan_bytes > 0:
                                    _calling_uid = state.get("user_id") or (dataset.user_id if dataset else None) or ""
                                    _project_id = state.get("project_id") or (dataset.project_id if dataset else None) or ""
                                    _billing_uid, _billing_plan = _resolve_proj_plan(_project_id, _calling_uid, _scan_db_session)
                                    enforce_scan_limit(_billing_uid, _billing_plan, _scan_db_session)
                                    increment_scan_bytes(_billing_uid, _scan_bytes, _scan_db_session)
                            finally:
                                _scan_db_session.close()
                        except Exception:
                            pass  # scan tracking is non-blocking

                    # table_registry is already updated by StepEngine.apply_step()

                    execution_result = {
                        "step_number": step["step_number"],
                        "operation": intent_key,
                        "success": True,
                        "rows_affected": rows_out,
                        "rows_changed": rows_changed if session_id else None,
                        "run_id": None,
                        "output_dataset_id": state.get("dataset_id"),
                        "sql": step_sql,
                        "error": None,
                        "output_table": output_table,
                        "session_table_name": output_table,
                        "input_tables": input_tables,
                        "row_count_before": row_count_before,
                        "row_count_after": rows_out,
                        "execution_time_ms": _exec_time_ms,
                        "column_schema": column_schema,
                        "query_results": preview_rows,
                        "is_view": True,  # Power Query: steps are always lazy views
                        "snapshot_path": snapshot_path,
                    }
                    _prev_charged = list(state.get("scan_charged_dataset_ids") or [])
                    _new_charged = (
                        [*_prev_charged, _scan_ds_id]
                        if _scan_ds_id and _scan_ds_id not in _prev_charged
                        else _prev_charged
                    )
                    return {
                        "execution_results": [*state.get("execution_results", []), execution_result],
                        "dataset_id": state.get("dataset_id"),
                        **_step_counter(idx + 1),
                        "retry_count": 0,
                        "error": None,
                        "query_results": preview_rows,
                        "table_registry": table_registry,
                        "completed_step_numbers": [*state.get("completed_step_numbers", []), step["step_number"]],
                        "scan_charged_dataset_ids": _new_charged,
                    }

            except (QueryTimeoutError, BlockedSQLError) as exc:
                execution_result = {
                    "step_number": step["step_number"],
                    "operation": intent_key,
                    "success": False,
                    "rows_affected": None,
                    "run_id": None,
                    "output_dataset_id": None,
                    "sql": step_sql or None,
                    "error": str(exc),
                }
                return {
                    "execution_results": [*state.get("execution_results", []), execution_result],
                    "error": str(exc),
                }
            except SessionExpiredError as exc:
                execution_result = {
                    "step_number": step["step_number"],
                    "operation": intent_key,
                    "success": False,
                    "rows_affected": None,
                    "run_id": None,
                    "output_dataset_id": None,
                    "sql": step_sql or None,
                    "error": str(exc),
                }
                return {
                    "execution_results": [*state.get("execution_results", []), execution_result],
                    "error": str(exc),
                }
        # ─────────────────────────────────────────────────────────────────────

        executable_operation = str(operation or "").strip().lower().replace(" ", "_")
        if not step_sql and executable_operation not in {"sql", "query", "transform", "join", "aggregate"}:
            raise ValueError(
                f"Step '{operation}' is missing executable SQL. Please regenerate plan with SQL in each transform step."
            )

        owner_plan = "free"
        if dataset.user_id:
            owner = db.query(User).filter(User.id == dataset.user_id).first()
            owner_plan = normalize_plan(owner.plan if owner else "Free").lower()

        engine = PipelineEngine(
            db=db,
            user_id=dataset.user_id or "agent",
            user_plan=owner_plan,
        )

        pipeline = engine.create_pipeline(
            name=f"Agent step: {operation}",
            steps=[
                {
                    "id": str(uuid.uuid4()),
                    "action_type": operation,
                    "description": step.get("description") or operation,
                    "parameters": parameters,
                    "sql": step_sql,
                }
            ],
            execution_config={"default_parameters": parameters},
            is_public=False,
        )

        pipeline_final_dataset_id: str | None = None
        async for pipeline_event in engine.execute_pipeline(
            pipeline_id=str(pipeline.id),
            input_dataset_id=state["dataset_id"],
            session_id=None,
            runtime_parameters=parameters,
            triggered_by="agent",
        ):
            event_type = getattr(getattr(pipeline_event, "type", None), "value", None)
            if event_type == "done":
                event_data = getattr(pipeline_event, "data", None)
                if isinstance(event_data, dict):
                    final_dataset_id = event_data.get("final_dataset_id")
                    if isinstance(final_dataset_id, str) and final_dataset_id.strip():
                        pipeline_final_dataset_id = final_dataset_id.strip()

        runs, _ = engine.get_pipeline_runs(str(pipeline.id), limit=1, offset=0)
        latest_run = runs[0] if runs else None
        run_id = str(latest_run.id) if latest_run else None
        output_dataset_id = (
            str(latest_run.output_dataset_id)
            if latest_run and latest_run.output_dataset_id
            else None
        )
        if not output_dataset_id and pipeline_final_dataset_id:
            output_dataset_id = pipeline_final_dataset_id
        if not output_dataset_id:
            from ...persistence_policy import lineage_children
            child_ids = lineage_children(db, state["dataset_id"])
            fallback_meta = (
                db.query(DatasetMetaDB)
                .filter(DatasetMetaDB.id.in_(child_ids))
                .order_by(DatasetMetaDB.created_at.desc())
                .first()
                if child_ids
                else None
            )
            if fallback_meta and fallback_meta.id:
                output_dataset_id = str(fallback_meta.id)

        rows_affected = None
        engine_sql = step_sql or None
        if run_id:
            artifact = engine.get_run_artifact(run_id)
            snapshot = artifact.get("pipeline_snapshot", {}) if isinstance(artifact, dict) else {}
            snapshot_steps = snapshot.get("steps", []) if isinstance(snapshot, dict) else []
            if snapshot_steps and isinstance(snapshot_steps[0], dict):
                snapshot_sql = snapshot_steps[0].get("sql")
                if isinstance(snapshot_sql, str) and snapshot_sql.strip():
                    engine_sql = snapshot_sql

            output = artifact.get("output", {}) if isinstance(artifact, dict) else {}
            if isinstance(output, dict) and isinstance(output.get("row_count"), int):
                rows_affected = int(output.get("row_count"))

        execution_result: ExecutionResult = {
            "step_number": step["step_number"],
            "operation": step["operation"],
            "success": True,
            "rows_affected": rows_affected,
            "run_id": run_id,
            "output_dataset_id": output_dataset_id,
            "sql": engine_sql,
            "error": None,
        }
        return {
            "execution_results": [*state.get("execution_results", []), execution_result],
            "dataset_id": output_dataset_id or state.get("dataset_id"),
            **_step_counter(idx + 1),
            "retry_count": 0,
            "error": None,
            "completed_step_numbers": [*state.get("completed_step_numbers", []), step["step_number"]],
        }

    except Exception as exc:
        execution_result: ExecutionResult = {
            "step_number": step["step_number"],
            "operation": step["operation"],
            "success": False,
            "rows_affected": None,
            "run_id": None,
            "output_dataset_id": None,
            "sql": None,
            "error": str(exc),
        }
        return {
            "execution_results": [*state.get("execution_results", []), execution_result],
            "error": str(exc),
        }
    finally:
        db.close()
