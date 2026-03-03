import uuid

from ..state import AgentState, ExecutionResult
from ....db import SessionLocal
from ....models_db import DatasetMetaDB
from ...pipeline_engine import PipelineEngine


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
        step_sql = str(parameters.get("sql") or "").strip()

        engine = PipelineEngine(
            db=db,
            user_id=dataset.user_id or "agent",
            user_plan="free",
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

        async for _ in engine.execute_pipeline(
            pipeline_id=str(pipeline.id),
            input_dataset_id=state["dataset_id"],
            session_id=None,
            runtime_parameters=parameters,
            triggered_by="agent",
        ):
            pass

        runs, _ = engine.get_pipeline_runs(str(pipeline.id), limit=1, offset=0)
        run_id = str(runs[0].id) if runs else None

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
            "sql": engine_sql,
            "error": None,
        }
        return {
            "execution_results": [*state.get("execution_results", []), execution_result],
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
            "sql": None,
            "error": str(exc),
        }
        return {
            "execution_results": [*state.get("execution_results", []), execution_result],
            "error": str(exc),
        }
    finally:
        db.close()
