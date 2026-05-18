import asyncio
import json

from langchain_core.messages import HumanMessage

from ...llm_provider import get_chat_model

from ..model_router import select_model
from ..prompts import REFLECT_PROMPT
from ..state import AgentState
from .planner import _dumps

_llm_cache: dict = {}


def _get_llm():
    model = select_model("reflect")
    cached = _llm_cache.get(model)
    if cached is None:
        cached = get_chat_model(model=model, temperature=0.2)
        _llm_cache[model] = cached
    return cached


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

    try:
        response = await asyncio.wait_for(
            _get_llm().ainvoke([HumanMessage(content=prompt)]),
            timeout=30,
        )
    except asyncio.TimeoutError:
        import logging
        logging.getLogger(__name__).warning("reflect LLM timed out, keeping original SQL")
        return {
            "plan": state["plan"],
            "execution_results": state.get("execution_results", [])[:-1],
            "retry_count": state.get("retry_count", 0) + 1,
            "error": "reflect_timeout",
        }
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
