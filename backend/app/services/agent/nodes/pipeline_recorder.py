import uuid
from datetime import datetime

from ....db import SessionLocal
from ....models_db import PipelineRunV2DB, PipelineStepDB
from ..state import AgentState


async def pipeline_recorder(state: AgentState) -> dict:
    results = state.get("execution_results", [])
    plan = state.get("plan", [])
    root_dataset_id = state.get("root_dataset_id") or state.get("dataset_id")

    # Build a lookup by step_number (not by index) because step numbers may
    # be offset to continue from prior pipeline steps across commands.
    plan_by_step: dict[int, dict] = {
        s.get("step_number", i + 1): s for i, s in enumerate(plan)
    }

    saved_steps = []
    current_dataset_id = root_dataset_id
    for result in results:
        if result["success"]:
            snum = result["step_number"]
            plan_step = plan_by_step.get(snum)
            if plan_step is None:
                continue
            next_dataset_id = result.get("output_dataset_id") or current_dataset_id
            params = plan_step.get("parameters") if isinstance(plan_step.get("parameters"), dict) else {}
            saved_steps.append(
                {
                    "dataset_id": next_dataset_id,
                    "input_dataset_id": current_dataset_id,
                    "output_dataset_id": next_dataset_id,
                    "agent_run_id": None,
                    "step_number": plan_step.get("step_number", result.get("step_number")),
                    "operation": plan_step["operation"],
                    "intent": state.get("intent") or plan_step["operation"],
                    "description": plan_step["description"],
                    "sql": result.get("sql"),
                    "run_id": result.get("run_id"),
                    "rows_affected": result.get("rows_affected"),
                    "input_tables": list(params.get("input_tables") or []),
                    "output_table": params.get("output_table") or params.get("output_name") or result.get("output_table") or None,
                    "session_table_name": result.get("session_table_name"),
                    "row_count_before": result.get("row_count_before"),
                    "execution_time_ms": result.get("execution_time_ms"),
                    "timestamp": datetime.utcnow().isoformat(),
                    # Frontend rendering extras
                    "tile_created": result.get("tile_created"),
                    "artifact_url": result.get("artifact_url"),
                    "query_results": result.get("query_results"),
                    "row_count_after": result.get("row_count_after"),
                }
            )
            current_dataset_id = next_dataset_id

    run_id = None
    if saved_steps:
        db = SessionLocal()
        try:
            execution_log = [
                {
                    "step_number": step.get("step_number", index + 1),
                    "operation": step.get("operation"),
                    "intent": step.get("intent") or step.get("operation"),
                    "description": step.get("description"),
                    "sql": step.get("sql"),
                    "rows_affected": step.get("rows_affected"),
                    "input_tables": step.get("input_tables") or [],
                    "output_table": step.get("output_table"),
                    "timestamp": step.get("timestamp") or datetime.utcnow().isoformat(),
                }
                for index, step in enumerate(saved_steps)
            ]

            run = PipelineRunV2DB(
                id=str(uuid.uuid4()),
                pipeline_id="agent",
                user_id=str(state.get("user_id") or "agent"),
                session_id=None,
                status="completed",
                step_results={
                    "executed_steps": execution_log,
                },
                input_dataset_id=root_dataset_id,
                output_dataset_id=current_dataset_id,
                metrics={
                    "dataset_id": root_dataset_id,
                    "executed_steps": execution_log,
                },
                execution_log=execution_log,
                triggered_by="agent",
                started_at=datetime.utcnow(),
                completed_at=datetime.utcnow(),
            )
            db.add(run)
            db.commit()
            run_id = str(run.id)
            for step in saved_steps:
                step["agent_run_id"] = run_id
                if not step.get("run_id"):
                    step["run_id"] = run_id

            # ── Write per-step rows ──────────────────────────────────────────
            # Commit each row INDIVIDUALLY (not in a single batch at the end).
            # Rationale: if the next request lands in the brief window between
            # step 1's commit and step N's commit, the context_loader still
            # sees a partial-but-consistent prefix of the pipeline.  This
            # eliminates the "second command sees no prior steps" race.
            # Build a lookup of execution_result by step_number for extra fields
            result_by_step: dict[int, dict] = {
                r["step_number"]: r for r in results
            }
            for step in saved_steps:
                snum = step.get("step_number", 0)
                result = result_by_step.get(snum, {})

                step_id = str(uuid.uuid4())
                step_row = PipelineStepDB(
                    id=step_id,
                    pipeline_run_id=run_id,
                    user_id=str(state.get("user_id") or "agent"),
                    session_id=state.get("session_id"),
                    step_number=snum,
                    intent=step.get("intent") or step.get("operation"),
                    operation=step.get("operation", "transform"),
                    description=step.get("description"),
                    input_tables=step.get("input_tables") or result.get("input_tables") or [],
                    output_table=step.get("output_table") or result.get("output_table"),
                    duckdb_sql=step.get("sql"),
                    status="completed" if result.get("success", True) else "failed",
                    error_message=result.get("error"),
                    execution_time_ms=result.get("execution_time_ms"),
                    row_count_before=result.get("row_count_before"),
                    row_count_after=result.get("row_count_after") or result.get("rows_affected"),
                    artifact_id=None,
                    # Object-storage path of the auto-snapshot (Item 2 in arch
                    # tightening): used by ``_replay_session_views`` for an
                    # O(1) deterministic restore on the next request /
                    # instance restart, instead of re-executing duckdb_sql.
                    snapshot_path=result.get("snapshot_path"),
                )
                try:
                    db.add(step_row)
                    db.commit()
                except Exception as _step_commit_exc:
                    # Don't let one bad row sink the whole pipeline record.
                    # The view still exists in the live DuckDB session and the
                    # frontend will keep its own copy in localStorage.
                    import logging as _pr_log
                    _pr_log.getLogger(__name__).warning(
                        "PIPELINE_STEP_COMMIT_FAILED: step=%s error=%s",
                        snum, _step_commit_exc,
                    )
                    try:
                        db.rollback()
                    except Exception:
                        pass

            # ── Ensure DatasetSessionDB row exists ───────────────────────
            # The frontend also upserts this row, but its call is async and
            # fire-and-forget.  If the user refreshes before it fires,
            # get_pipeline_steps can't find PipelineStepDB rows (it needs
            # chat_session_id to scope the fallback query).  Writing here
            # guarantees the link between dataset_id ↔ session_id always
            # exists after a successful recording.
            _sess_id = state.get("session_id")
            _user_id = str(state.get("user_id") or "agent")
            if _sess_id and root_dataset_id:
                try:
                    from ....models_db import DatasetSessionDB
                    existing = (
                        db.query(DatasetSessionDB)
                        .filter(
                            DatasetSessionDB.user_id == _user_id,
                            DatasetSessionDB.dataset_id == root_dataset_id,
                        )
                        .first()
                    )
                    if existing:
                        if existing.chat_session_id != _sess_id:
                            existing.chat_session_id = _sess_id
                            db.commit()
                    else:
                        db.add(DatasetSessionDB(
                            id=str(uuid.uuid4()),
                            user_id=_user_id,
                            dataset_id=root_dataset_id,
                            chat_session_id=_sess_id,
                        ))
                        db.commit()
                except Exception as _ds_exc:
                    import logging as _ds_log
                    _ds_log.getLogger(__name__).warning(
                        "DATASET_SESSION_UPSERT_FAILED: %s", _ds_exc,
                    )
                    try:
                        db.rollback()
                    except Exception:
                        pass

            # ── Back-fill pipeline_steps_json on dataset_meta ────────────
            # The frontend writes this with a 1.5 s debounce.  If the user
            # refreshes or the server restarts before it fires, the steps
            # vanish.  Writing here guarantees the JSON is always current
            # after a successful recording — the frontend's later write is
            # idempotent (same data, just slightly delayed).
            all_steps = [*state.get("pipeline_steps", []), *saved_steps]
            if all_steps and root_dataset_id:
                try:
                    import json as _json
                    from sqlalchemy import text as _text
                    # Build the minimal shape the frontend expects.
                    _steps_json = _json.dumps(all_steps, default=str)
                    db.execute(
                        _text("UPDATE dataset_meta SET pipeline_steps_json = :v WHERE id = :id"),
                        {"v": _steps_json, "id": root_dataset_id},
                    )
                    db.commit()
                except Exception as _pj_exc:
                    import logging as _pj_log
                    _pj_log.getLogger(__name__).warning(
                        "PIPELINE_STEPS_JSON_BACKFILL_FAILED: %s", _pj_exc,
                    )
                    try:
                        db.rollback()
                    except Exception:
                        pass
        finally:
            db.close()

    return {
        "run_id": run_id,
        "output_dataset_id": current_dataset_id,
        "run_steps": saved_steps,
        "pipeline_steps": [*state.get("pipeline_steps", []), *saved_steps],
    }
