import json
import os

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from ..prompts import PLANNER_SYSTEM_PROMPT
from ..state import AgentState, PlanStep

_llm = ChatGroq(
    model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    temperature=0.1,
    groq_api_key=os.getenv("GROQ_API_KEY"),
)


async def planner(state: AgentState) -> dict:
    messages = state.get("messages", [])
    user_goal = messages[-1].content if messages else ""
    requested_approval = bool(state.get("plan_approved", False))

    system_prompt = PLANNER_SYSTEM_PROMPT.format(
        schema=json.dumps(state.get("schema", {}), indent=2),
        stats=json.dumps(state.get("stats", {}), indent=2),
        sample_rows=json.dumps(state.get("sample_rows", [])[:10], indent=2),
        pipeline_steps=json.dumps(state.get("pipeline_steps", []), indent=2),
        available_templates=json.dumps(state.get("available_templates", []), indent=2),
        calculated_columns=json.dumps(state.get("calculated_columns", []), indent=2),
        dashboards=json.dumps(state.get("dashboards", []), indent=2),
        secondary_datasets=json.dumps(state.get("secondary_schemas", {}), indent=2),
        table_registry=json.dumps(state.get("table_registry", {}), indent=2),
        user_goal=user_goal,
    )

    response = await _llm.ainvoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Generate the execution plan for: {user_goal}"),
        ]
    )

    raw = str(response.content).strip()
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
                }
            )
    except json.JSONDecodeError:
        plan = []

    return {
        "plan": plan,
        "plan_approved": requested_approval and bool(plan),
        "current_step_index": 0,
        "execution_results": [],
        "retry_count": 0,
        "error": None,
    }
