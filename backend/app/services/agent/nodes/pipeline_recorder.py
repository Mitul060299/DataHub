import uuid
from datetime import datetime

from ....db import SessionLocal
from ....models_db import PipelineRunV2DB
from ..state import AgentState


async def pipeline_recorder(state: AgentState) -> dict:
    results = state.get("execution_results", [])
    plan = state.get("plan", [])
    root_dataset_id = state.get("root_dataset_id") or state.get("dataset_id")

    saved_steps = []
    current_dataset_id = root_dataset_id
    for result in results:
        if result["success"]:
            step_idx = result["step_number"] - 1
            if step_idx < len(plan):
                plan_step = plan[step_idx]
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
                        "output_table": params.get("output_table") or params.get("output_name") or None,
                        "timestamp": datetime.utcnow().isoformat(),
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
                user_id="agent",
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
        finally:
            db.close()

    return {
        "run_id": run_id,
        "output_dataset_id": current_dataset_id,
        "run_steps": saved_steps,
        "pipeline_steps": [*state.get("pipeline_steps", []), *saved_steps],
    }
