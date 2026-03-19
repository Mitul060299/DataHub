import uuid
from datetime import datetime, timezone

from ..state import AgentState, ExecutionResult, TableRegistryEntry
from ....db import SessionLocal
from ....models_db import DatasetMetaDB, User
from ...calculated_columns_service import CalculatedColumnsService
from ...dashboards_v2_service import DashboardsV2Service
from ...plan_guard import normalize_plan
from ...duckdb_session import (
    register_table_from_sql,
    execute_in_session,
    SessionExpiredError,
)
from ...export_service import ExportService


async def execute_step(state: AgentState) -> dict:
    idx = state["current_step_index"]
    plan = state["plan"]

    if idx >= len(plan):
        return {"current_step_index": idx}

    step = plan[idx]

    db = SessionLocal()
    try:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == state["dataset_id"]).first()
        if not dataset:
            raise ValueError("Dataset not found")

        operation = str(step.get("operation") or "transform")
        parameters = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
        step_sql = str(parameters.get("sql") or step.get("sql") or "").strip()

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
                "current_step_index": idx + 1,
                "retry_count": 0,
                "error": None,
            }

        if operation in {"create_chart", "visualise"} or state.get("intent") == "visualise":
            dashboard_id = str(parameters.get("dashboard_id") or "").strip()
            title = str(parameters.get("title") or step.get("description") or "AI chart").strip()
            chart_type = str(parameters.get("chart_type") or "bar").strip().lower()
            query_spec = parameters.get("query_spec") if isinstance(parameters.get("query_spec"), dict) else {}
            layout = parameters.get("layout") if isinstance(parameters.get("layout"), dict) else {}

            if not query_spec and step_sql:
                query_spec = {
                    "sql": step_sql,
                    "dataset_id": state.get("dataset_id"),
                }

            user_id = state.get("user_id") or dataset.user_id or "agent"
            workspace_id = state.get("workspace_id") or dataset.workspace_id or "default"

            if not dashboard_id:
                existing = DashboardsV2Service.list_dashboards(user_id=user_id, workspace_id=workspace_id)
                if existing:
                    dashboard_id = existing[0].id
                else:
                    created_dashboard = DashboardsV2Service.create_dashboard(
                        user_id=user_id,
                        workspace_id=workspace_id,
                        dataset_id=state["dataset_id"],
                        name="AI Dashboard",
                        description="Auto-created by agent",
                        layout={},
                    )
                    dashboard_id = created_dashboard.id

            tile = DashboardsV2Service.add_tile(
                user_id=user_id,
                dashboard_id=dashboard_id,
                dataset_id=state["dataset_id"],
                title=title,
                chart_type=chart_type,
                query_spec=query_spec,
                layout=layout,
            )

            execution_result = {
                "step_number": step["step_number"],
                "operation": "create_chart",
                "success": True,
                "rows_affected": None,
                "run_id": None,
                "output_dataset_id": state.get("dataset_id"),
                "sql": None,
                "error": None,
                "tile_created": {
                    "id": tile.id,
                    "dashboard_id": tile.dashboard_id,
                    "title": tile.title,
                    "chart_type": tile.chart_type,
                },
            }
            return {
                "execution_results": [*state.get("execution_results", []), execution_result],
                "dataset_id": state.get("dataset_id"),
                "current_step_index": idx + 1,
                "retry_count": 0,
                "error": None,
            }

        from ...pipeline_engine import PipelineEngine

        # ── Session-based operations (use DuckDB session for 8 new intents) ───
        _SESSION_OPS = {"clean", "validate", "filter", "summarise", "pivot", "union", "reconcile", "export"}
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
                        "current_step_index": idx + 1,
                        "retry_count": 0,
                        "error": None,
                        "table_registry": table_registry,
                    }

                elif intent_key in {"validate", "summarise"}:
                    # Read-only: just execute the SQL and return results
                    if not step_sql:
                        raise ValueError(f"No SQL provided for {intent_key} step")
                    rows = execute_in_session(session_id, step_sql) if session_id else []
                    execution_result = {
                        "step_number": step["step_number"],
                        "operation": intent_key,
                        "success": True,
                        "rows_affected": len(rows) if isinstance(rows, list) else None,
                        "run_id": None,
                        "output_dataset_id": state.get("dataset_id"),
                        "sql": step_sql,
                        "error": None,
                        "query_results": rows,
                    }
                    return {
                        "execution_results": [*state.get("execution_results", []), execution_result],
                        "dataset_id": state.get("dataset_id"),
                        "current_step_index": idx + 1,
                        "retry_count": 0,
                        "error": None,
                        "query_results": rows,
                        "table_registry": table_registry,
                    }

                else:
                    # Write ops: clean, filter, pivot, union, reconcile
                    # SQL should be a CREATE TABLE AS ... or SELECT that we register
                    output_table = str(
                        parameters.get("output_table")
                        or parameters.get("output_name")
                        or f"{intent_key}_{step['step_number']}_{uuid.uuid4().hex[:6]}"
                    )
                    if not step_sql:
                        raise ValueError(f"No SQL provided for {intent_key} step")

                    if session_id:
                        register_table_from_sql(session_id, output_table, step_sql)
                        # Try to get row count from new table
                        try:
                            count_rows = execute_in_session(session_id, f"SELECT COUNT(*) AS n FROM {output_table}")
                            rows_out = int(count_rows[0]["n"]) if count_rows else None
                        except Exception:
                            rows_out = None

                        # Try to get column names
                        try:
                            sample = execute_in_session(session_id, f"SELECT * FROM {output_table} LIMIT 1")
                            out_cols = list(sample[0].keys()) if sample else []
                        except Exception:
                            out_cols = []
                    else:
                        rows_out = None
                        out_cols = []

                    # Update table_registry
                    input_tables = list(parameters.get("input_tables") or [])
                    if not input_tables:
                        # infer from current primary table
                        primary_alias = next(
                            (k for k, v in table_registry.items() if v.get("dataset_id") == str(state.get("dataset_id"))),
                            None,
                        )
                        if primary_alias:
                            input_tables = [primary_alias]

                    new_entry: TableRegistryEntry = {
                        "duckdb_name": output_table,
                        "dataset_id": str(state.get("dataset_id") or ""),
                        "display_name": str(parameters.get("display_name") or output_table),
                        "source_intent": intent_key,
                        "parent_tables": input_tables,
                        "row_count": rows_out or 0,
                        "column_names": out_cols,
                        "pipeline_step_number": step["step_number"],
                        "is_artifact": False,
                        "is_view": False,
                    }
                    table_registry[output_table] = new_entry

                    execution_result = {
                        "step_number": step["step_number"],
                        "operation": intent_key,
                        "success": True,
                        "rows_affected": rows_out,
                        "run_id": None,
                        "output_dataset_id": state.get("dataset_id"),
                        "sql": step_sql,
                        "error": None,
                    }
                    return {
                        "execution_results": [*state.get("execution_results", []), execution_result],
                        "dataset_id": state.get("dataset_id"),
                        "current_step_index": idx + 1,
                        "retry_count": 0,
                        "error": None,
                        "table_registry": table_registry,
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
            workspace_id=dataset.workspace_id or "default",
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
            fallback_meta = (
                db.query(DatasetMetaDB)
                .filter(DatasetMetaDB.parent_id == state["dataset_id"])
                .order_by(DatasetMetaDB.created_at.desc())
                .first()
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
            "current_step_index": idx + 1,
            "retry_count": 0,
            "error": None,
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
