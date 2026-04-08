import json
import os

from langchain_core.messages import HumanMessage
from langchain_groq import ChatGroq

from ..prompts import REFLECT_PROMPT
from ..state import AgentState
from .planner import _dumps

_llm = ChatGroq(
    model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    temperature=0.2,
    groq_api_key=os.getenv("GROQ_API_KEY"),
)


async def reflect(state: AgentState) -> dict:
    idx = state["current_step_index"]
    failed_step = state["plan"][idx]
    error_msg = state.get("error", "Unknown error")

    prompt = REFLECT_PROMPT.format(
        schema=_dumps(state.get("schema", {})),
        stats=_dumps(state.get("stats", {})),
        operation=failed_step.get("operation", ""),
        table_registry=_dumps(state.get("table_registry", {})),
        failed_sql=failed_step["sql"],
        error=error_msg,
    )

    response = await _llm.ainvoke([HumanMessage(content=prompt)])
    corrected_sql = str(response.content).strip()

    if "```" in corrected_sql:
        parts = corrected_sql.split("```")
        corrected_sql = parts[1].replace("sql", "").strip() if len(parts) > 1 else corrected_sql

    updated_plan = [s.copy() for s in state["plan"]]
    updated_plan[idx] = {**updated_plan[idx], "sql": corrected_sql}

    return {
        "plan": updated_plan,
        "execution_results": state.get("execution_results", [])[:-1],
        "retry_count": state.get("retry_count", 0) + 1,
        "error": None,
    }
