import asyncio
import json
import logging
import os
import re as _re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from ..prompts import PLANNER_SYSTEM_PROMPT
from ..state import AgentState, PlanStep
from ...echarts_builder import infer_chart_type

_logger = logging.getLogger(__name__)


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


def _sanitize_depends_on(plan: list[dict], logger=None) -> list[dict]:
    """Drop self / forward / dangling / non-int `depends_on` references.

    Mutates the steps in `plan` in place AND returns the list for caller
    convenience.  Invariants enforced for every step:
      • every value in depends_on is an int
      • no value equals the step's own step_number
      • no value is greater than the step's own step_number (forward ref)
      • no value points to a step_number not present elsewhere in the plan
    """
    valid_step_numbers = {int(s["step_number"]) for s in plan if isinstance(s, dict) and "step_number" in s}
    for step in plan:
        if not isinstance(step, dict) or "step_number" not in step:
            continue
        raw = step.get("depends_on") or []
        cleaned: list[int] = []
        try:
            self_sn = int(step["step_number"])
        except (TypeError, ValueError):
            step["depends_on"] = []
            continue
        for d in raw:
            try:
                di = int(d)
            except (TypeError, ValueError):
                continue
            if di == self_sn:
                continue  # self-reference — would create a cycle
            if di not in valid_step_numbers:
                continue  # dangling
            if di > self_sn:
                continue  # forward reference — violates DAG topology
            cleaned.append(di)
        if logger is not None and len(cleaned) != len(raw):
            logger.info(
                "PLANNER_DEPENDS_ON_SANITIZED: step=%d before=%s after=%s",
                self_sn, raw, cleaned,
            )
        step["depends_on"] = cleaned
    return plan

_llm_cache: dict[str, ChatGroq] = {}


def _get_llm() -> ChatGroq:
    from ..model_router import select_model
    model = select_model("plan")
    cached = _llm_cache.get(model)
    if cached is None:
        cached = ChatGroq(
            model=model,
            temperature=0.1,
            groq_api_key=os.getenv("GROQ_API_KEY"),
        )
        _llm_cache[model] = cached
    return cached


async def planner(state: AgentState) -> dict:
    messages = state.get("messages", [])
    user_goal = messages[-1].content if messages else ""
    requested_approval = bool(state.get("plan_approved", False))

    _ps = state.get("pipeline_steps", [])
    _tr = state.get("table_registry", {})
    _logger.info(
        "PLANNER_INPUT: pipeline_steps=%d table_registry=%d goal=%s",
        len(_ps), len(_tr), user_goal[:120],
    )

    # Check if this is a plan modification request
    existing_plan = state.get("plan", [])
    is_modification = bool(
        existing_plan and state.get("plan_pending_modification", False)
    )

    system_prompt = PLANNER_SYSTEM_PROMPT.format(
        schema=_dumps(state.get("schema", {})),
        stats=_dumps(state.get("stats", {})),
        sample_rows=_dumps(state.get("sample_rows", [])[:10]),
        pipeline_steps=_dumps(_ps),
        available_templates=_dumps(state.get("available_templates", [])),
        calculated_columns=_dumps(state.get("calculated_columns", [])),
        dashboards=_dumps(state.get("dashboards", [])),
        secondary_datasets=_dumps(state.get("secondary_schemas", {})),
        table_registry=_dumps(_tr),
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
            _get_llm().ainvoke(
                [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=human_content),
                ]
            ),
            timeout=30,
        )
        raw = str(response.content).strip()
    except asyncio.TimeoutError:
        _logger.error("planner LLM timed out after 30s")
        raise RuntimeError("AI service timed out while building plan. Please try again.")
    except Exception as exc:
        _logger.error("planner LLM error: %s", exc)
        raise RuntimeError(f"AI service error while building plan: {exc}") from exc

    _logger.info("PLANNER_RAW_RESPONSE: len=%d first200=%s", len(raw), raw[:200])

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    # Try standard JSON parse first, then fall back to regex extraction
    parsed = None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON object from within the response text
        _json_match = _re.search(r'\{[\s\S]*\}', raw)
        if _json_match:
            try:
                parsed = json.loads(_json_match.group())
            except json.JSONDecodeError:
                pass
        if parsed is None:
            _logger.error("PLANNER_JSON_PARSE_FAILED: raw=%s", raw[:500])

    if parsed is not None:
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
    else:
        plan = []

    # ── Offset step numbers so they continue from existing pipeline ───────
    # The LLM always numbers from 1, but we need cumulative numbering.
    _existing_ps = state.get("pipeline_steps") or []
    _step_offset = max((s.get("step_number", 0) for s in _existing_ps), default=0)
    if _step_offset and plan:
        # Also remap depends_on references so DAG plans stay consistent
        for step in plan:
            old_num = step["step_number"]
            step["step_number"] = old_num + _step_offset
            if step.get("depends_on"):
                step["depends_on"] = [d + _step_offset for d in step["depends_on"]]

    # ── Sanitize depends_on so the frontend DAG renderer never sees a
    # reference to a step that isn't in the plan.  This was the source of
    # the "Cannot read properties of undefined (reading 'length')" crash:
    # `PlanDAG.computeDepths` produces a sparse byDepth array when a step's
    # depends_on points outside the plan, and the layout code then tried to
    # access `.length` on the undefined hole.  Guard at the source instead.
    plan = _sanitize_depends_on(plan, logger=_logger)

    _logger.info("PLANNER_OUTPUT: steps=%d offset=%d", len(plan), _step_offset)

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
