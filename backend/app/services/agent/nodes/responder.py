import asyncio
import json
import logging

from langchain_core.messages import AIMessage, HumanMessage

from ...llm_provider import get_chat_model

from ..model_router import select_model
from ..prompts import RESPONDER_CONVERSE_PROMPT, RESPONDER_TRANSFORM_PROMPT
from ..state import AgentState

logger = logging.getLogger(__name__)

_llm_cache: dict = {}


def _get_llm(kind: str = "transform"):
    """Return a (cached) chat model instance for the given call kind.

    When LLM_ROUTER_ENABLED=true, ``kind="converse"`` resolves to the cheaper
    fast model; everything else stays on the versatile default.
    """
    model = select_model(kind)  # type: ignore[arg-type]
    cached = _llm_cache.get(model)
    if cached is None:
        cached = get_chat_model(model=model, temperature=0.3)
        _llm_cache[model] = cached
    return cached

_LLM_TIMEOUT_MSG = (
    "I'm taking longer than usual — this sometimes happens with complex requests. "
    "Please try again in a moment."
)


async def _invoke_llm(messages: list, *, kind: str = "transform") -> str:
    """Invoke the LLM with a 30-second timeout and a friendly fallback."""
    try:
        response = await asyncio.wait_for(_get_llm(kind).ainvoke(messages), timeout=30)
        return str(response.content)
    except asyncio.TimeoutError:
        logger.warning("responder LLM timed out after 30s")
        return _LLM_TIMEOUT_MSG
    except Exception as exc:
        logger.warning("LLM invocation failed: %s", exc)
        return _LLM_TIMEOUT_MSG


async def responder(state: AgentState) -> dict:
    intent = state.get("intent", "converse")
    messages = state.get("messages", [])
    user_goal = messages[-1].content if messages else ""

    if intent == "converse":
        schema_str = json.dumps(state.get("schema", {}), indent=2)
        dataset_name = str(state.get("dataset_id", "your dataset"))
        prompt = RESPONDER_CONVERSE_PROMPT.format(
            message=user_goal,
            schema=schema_str,
            dataset_name=dataset_name,
        )
        final = await _invoke_llm([HumanMessage(content=prompt)], kind="converse")

    elif intent in ("transform", "sql_query", "join"):
        results = state.get("execution_results", [])
        successful = [result for result in results if result["success"]]
        failed = [result for result in results if not result["success"]]

        if not results:
            final = "The plan was not approved or could not be executed."
        else:
            prompt = RESPONDER_TRANSFORM_PROMPT.format(
                results=json.dumps(successful, indent=2),
                goal=user_goal,
            )
            final = await _invoke_llm([HumanMessage(content=prompt)], kind="transform")
            if failed:
                final += f"\n\n⚠️ {len(failed)} step(s) could not be completed after retrying."

            # Append outlier callout if any successful step reported outliers
            total_outliers = sum(
                int(r.get("outlier_count", 0))
                for r in successful
                if isinstance(r.get("outlier_count"), (int, float))
            )
            if total_outliers > 0 and "outlier" not in final.lower():
                final += f"\n\n⚠️ {total_outliers} outlier value{'s' if total_outliers != 1 else ''} were detected — want me to flag or remove them?"

            # Surface join suggestion if context_loader found overlapping columns
            join_suggestions: list[dict] = state.get("join_suggestions", [])  # type: ignore[assignment]
            if join_suggestions:
                js = join_suggestions[0]
                final += (
                    f"\n\n🔗 I noticed **{js.get('secondary_name', 'another dataset')}** shares "
                    f"column **{js.get('on_column', 'a key')}** with your data — "
                    f"want me to join them?"
                )

    elif intent == "visualise":
        results = state.get("execution_results", [])
        # Find the first successful visualise step with tile_created
        tile_info = None
        for result in results:
            tc = result.get("tile_created") if isinstance(result, dict) else None
            if tc:
                tile_info = tc
                break

        if tile_info:
            chart_type = tile_info.get("chart_type", "")
            title = tile_info.get("title", "chart")
            dash_id = tile_info.get("dashboard_id", "")
            final = (
                f"Here's your **{chart_type}** chart: **{title}**. "
                f"You can pin it to any dashboard using the 📌 button below."
            )
            if dash_id:
                final += f" It's also been auto-saved to your default dashboard."
        else:
            chart = state.get("chart_config")
            if chart:
                final = (
                    "Here's your chart. I've generated a "
                    f"{chart.get('type', 'bar')} chart showing {chart.get('title', 'your data')}."
                )
            else:
                final = "I've prepared the chart configuration based on your data."

        # Append KPI offer if there are KPI candidates
        kpi_candidates = state.get("kpi_candidates", [])
        if kpi_candidates:
            labels = ", ".join(c.get("label", "") for c in kpi_candidates[:3])
            final += f"\n\n💡 I also found key metrics: **{labels}**. Would you like me to add them as metric tiles?"

    elif intent in ("reconcile", "summarise"):
        results = state.get("execution_results", [])
        successful = [r for r in results if isinstance(r, dict) and r.get("success")]
        if successful:
            prompt = RESPONDER_TRANSFORM_PROMPT.format(
                results=json.dumps(successful, indent=2),
                goal=user_goal,
            )
            final = await _invoke_llm([HumanMessage(content=prompt)], kind="transform")
        else:
            final = "Done."

        # Append outlier callout if any step reported outliers
        total_outliers = sum(
            int(r.get("outlier_count", 0))
            for r in successful
            if isinstance(r.get("outlier_count"), (int, float))
        )
        if total_outliers > 0 and "outlier" not in final.lower():
            final += f"\n\n⚠️ {total_outliers} outlier value{'s' if total_outliers != 1 else ''} were detected — want me to flag or remove them?"

        # Scan for KPI candidates across reconcile/summarise steps
        kpi_candidates = state.get("kpi_candidates", [])
        if kpi_candidates:
            labels = ", ".join(c.get("label", "") for c in kpi_candidates[:3])
            final += f"\n\n💡 Key metrics found: **{labels}**. Pin them as metric tiles?"

        # Surface join suggestions if context_loader detected overlapping columns
        join_suggestions: list[dict] = state.get("join_suggestions", [])  # type: ignore[assignment]
        if join_suggestions:
            js = join_suggestions[0]
            final += (
                f"\n\n🔗 I noticed **{js.get('secondary_name', 'another dataset')}** shares "
                f"column **{js.get('on_column', 'a key')}** with your data — "
                f"want me to join them?"
            )

    else:
        final = "Done."

    return {
        "messages": [AIMessage(content=final)],
        "final_response": final,
        "run_id": state.get("run_id"),
        "output_dataset_id": state.get("output_dataset_id") or state.get("dataset_id"),
        "run_steps": state.get("run_steps", []),
        "pipeline_steps": state.get("pipeline_steps", []),
    }
