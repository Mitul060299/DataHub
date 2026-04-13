import asyncio
import json
import os

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from ..prompts import PLANNER_SYSTEM_PROMPT
from ..state import AgentState, PlanStep
from ...echarts_builder import infer_chart_type


class _SafeEncoder(json.JSONEncoder):
    """Encode numpy / pandas scalar types that stdlib json can't handle."""
    def default(self, o):
        try:
            import numpy as np
            if isinstance(o, (np.integer,)):
                return int(o)
            if isinstance(o, (np.floating,)):
                return float(o)
            if isinstance(o, np.ndarray):
                return o.tolist()
        except ImportError:
            pass
        try:
            import pandas as pd
            if isinstance(o, pd.NA.__class__):
                return None
        except ImportError:
            pass
        return super().default(o)


def _dumps(obj) -> str:
    return json.dumps(obj, indent=2, cls=_SafeEncoder)

_llm = ChatGroq(
    model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    temperature=0.1,
    groq_api_key=os.getenv("GROQ_API_KEY"),
)


async def planner(state: AgentState) -> dict:
    messages = state.get("messages", [])
    user_goal = messages[-1].content if messages else ""
    requested_approval = bool(state.get("plan_approved", False))

    # Check if this is a plan modification request
    existing_plan = state.get("plan", [])
    is_modification = bool(
        existing_plan and state.get("plan_pending_modification", False)
    )

    system_prompt = PLANNER_SYSTEM_PROMPT.format(
        schema=_dumps(state.get("schema", {})),
        stats=_dumps(state.get("stats", {})),
        sample_rows=_dumps(state.get("sample_rows", [])[:10]),
        pipeline_steps=_dumps(state.get("pipeline_steps", [])),
        available_templates=_dumps(state.get("available_templates", [])),
        calculated_columns=_dumps(state.get("calculated_columns", [])),
        dashboards=_dumps(state.get("dashboards", [])),
        secondary_datasets=_dumps(state.get("secondary_schemas", {})),
        table_registry=_dumps(state.get("table_registry", {})),
        user_goal=user_goal,
    )

    if is_modification:
        modification_prompt = (
            f"You have an existing execution plan. The user wants to modify it.\n\n"
            f"EXISTING PLAN:\n{_dumps(existing_plan)}\n\n"
            f"USER MODIFICATION REQUEST:\n{user_goal}\n\n"
            f"Return the complete updated plan JSON with the modification applied. "
            f"Only change what the user asked to change. Keep all other steps identical. "
            f"Renumber steps if needed. Follow all existing plan rules."
        )
        human_content = modification_prompt
    else:
        human_content = f"Generate the execution plan for: {user_goal}"

    try:
        response = await asyncio.wait_for(
            _llm.ainvoke(
                [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=human_content),
                ]
            ),
            timeout=30,
        )
        raw = str(response.content).strip()
    except asyncio.TimeoutError:
        import logging
        logging.getLogger(__name__).error("planner LLM timed out after 30s")
        raise RuntimeError("AI service timed out while building plan. Please try again.")
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("planner LLM error: %s", exc)
        raise RuntimeError(f"AI service error while building plan: {exc}") from exc
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
        raw_steps = parsed.get("steps", []) if isinstance(parsed, dict) else []
        plan: list[PlanStep] = []
        for index, step in enumerate(raw_steps, start=1):
            if not isinstance(step, dict):
                continue
            plan.append(
                {
                    "step_number": int(step.get("step_number", index)),
                    "operation": str(step.get("operation") or "transform"),
                    "description": str(step.get("description") or "Execute transformation step"),
                    "parameters": step.get("parameters") if isinstance(step.get("parameters"), dict) else {},
                    "sql": str(
                        step.get("sql")
                        or (
                            step.get("parameters", {}).get("sql")
                            if isinstance(step.get("parameters"), dict)
                            else ""
                        )
                        or ""
                    ),
                    "template_id": str(step.get("template_id")) if step.get("template_id") else None,
                    "estimated_rows": str(step.get("estimated_rows") or "Estimated rows unavailable"),
                    "reversible": bool(step.get("reversible", True)),
                    "depends_on": [int(d) for d in step.get("depends_on", [])] if step.get("depends_on") else [],
                }
            )
    except json.JSONDecodeError:
        plan = []

    # ── Chart type auto-selection (post-processing) ───────────────────────
    table_registry: dict = dict(state.get("table_registry") or {})
    intent: str = str(state.get("intent") or "")
    for step in plan:
        op = str(step.get("operation") or "")
        if op not in ("create_chart", "visualise"):
            continue
        params: dict = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
        ct = str(params.get("chart_type") or "").strip().lower()
        if ct in ("", "auto"):
            # Try to pick source table from plan params or most-recent registry entry
            src_table = str(params.get("source_table") or "").strip()
            if not src_table and table_registry:
                last_entry = next(
                    (e for e in reversed(list(table_registry.values())) if isinstance(e, dict)),
                    {},
                )
                src_table = str(last_entry.get("duckdb_name") or "")
                col_names: list[str] = list(last_entry.get("column_names") or [])
                row_count: int = int(last_entry.get("row_count") or 0)
                col_types: dict[str, str] = {}  # dtype not always in registry; leave empty
                inferred, _ = infer_chart_type(col_names, col_types, row_count, intent)
                params["chart_type"] = inferred
                if not params.get("source_table"):
                    params["source_table"] = src_table
                step["parameters"] = params

    return {
        "plan": plan,
        "plan_approved": requested_approval and bool(plan),
        "current_step_index": 0,
        "execution_results": [],
        "retry_count": 0,
        "error": None,
    }
