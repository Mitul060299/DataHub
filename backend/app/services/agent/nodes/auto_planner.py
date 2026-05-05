"""
auto_planner.py
===============
Auto Mode node that generates an ordered DAG of AutoPlanSteps from the
parsed AutoGoal + optional prior-pipeline reference steps.

Inputs  (from AgentState):
  - auto_goal          : AutoGoal
  - schema, stats      : dict
  - drift_report       : DriftReport | None  — from drift_detector (may be absent first run)
  - reference_steps    : list[ReferenceStep] | None  — from prior_pipeline_parser
  - prior_trust_level  : str  — "strict"|"guide"|"reference"

Outputs (merged into AgentState):
  - auto_plan          : list[AutoPlanStep]
  - current_rule_index : 0  (reset)
  - reflection_attempts: {}  (reset)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from ..auto_prompts import AUTO_PLANNER_SYSTEM, AUTO_PLANNER_USER
from ..auto_types import AutoGoal, AutoPlanStep, DriftReport, ReferenceStep
from ..state import AgentState
from ...token_tracking_service import log_call as _log_call

_logger = logging.getLogger(__name__)


def _get_llm() -> ChatGroq:
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0,
        groq_api_key=os.getenv("GROQ_API_KEY"),
    )


def _dumps(obj: Any) -> str:
    try:
        return json.dumps(obj, indent=2)
    except Exception:
        return str(obj)


def _extract_drift_adjustments(drift_report: DriftReport | None) -> list[dict]:
    if not drift_report:
        return []
    return [
        {"column": col["column"], "adjustment": col.get("auto_adjustment", {})}
        for col in (drift_report.get("columns") or [])
        if col.get("status") in ("amber",) and col.get("auto_adjustment")
    ]


async def auto_planner(state: AgentState) -> dict:
    auto_goal: AutoGoal = state.get("auto_goal") or {}
    schema = state.get("schema", {})
    stats = state.get("stats", {})
    drift_report: DriftReport | None = state.get("drift_report")
    reference_steps: list[ReferenceStep] | None = state.get("reference_steps")
    trust_level: str = state.get("prior_trust_level", "guide")
    user_id: str = state.get("user_id", "")
    session_id: str = state.get("session_id", "")
    model = "llama-3.3-70b-versatile"

    rules = auto_goal.get("rules", [])
    if not rules:
        _logger.warning("auto_planner: no rules in auto_goal")
        return {"auto_plan": [], "current_rule_index": 0, "reflection_attempts": {}}

    drift_adjustments = _extract_drift_adjustments(drift_report)

    user_msg = AUTO_PLANNER_USER.format(
        schema=_dumps(schema),
        rules=_dumps(rules),
        reference_steps=_dumps(reference_steps) if reference_steps else "(none)",
        drift_adjustments=_dumps(drift_adjustments) if drift_adjustments else "(none)",
        trust_level=trust_level,
    )

    _input_tok = _output_tok = 0
    try:
        response = await asyncio.wait_for(
            _get_llm().ainvoke([SystemMessage(content=AUTO_PLANNER_SYSTEM), HumanMessage(content=user_msg)]),
            timeout=30,
        )
        raw = str(response.content).strip()
        _um = getattr(response, "usage_metadata", None) or {}
        _input_tok = _um.get("input_tokens", 0)
        _output_tok = _um.get("output_tokens", 0)
    except asyncio.TimeoutError:
        _log_call(user_id=user_id, session_id=session_id, model_used=model,
                  query_type="plan", input_tokens=0, output_tokens=0)
        _logger.error("auto_planner timed out")
        return {"auto_plan": [], "current_rule_index": 0, "reflection_attempts": {}}
    except Exception as exc:
        _log_call(user_id=user_id, session_id=session_id, model_used=model,
                  query_type="plan", input_tokens=0, output_tokens=0)
        _logger.error("auto_planner error: %s", exc)
        return {"auto_plan": [], "current_rule_index": 0, "reflection_attempts": {}}

    _log_call(user_id=user_id, session_id=session_id, model_used=model,
              query_type="plan", input_tokens=_input_tok, output_tokens=_output_tok)

    # Strip code fences
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        _logger.error("auto_planner JSON parse failed: %s", raw[:500])
        return {"auto_plan": [], "current_rule_index": 0, "reflection_attempts": {}}

    steps_raw = parsed.get("steps", [])
    steps: list[AutoPlanStep] = []
    for s in steps_raw:
        if not isinstance(s, dict):
            continue
        step: AutoPlanStep = {
            "step_number": int(s.get("step_number", len(steps) + 1)),
            "operation": str(s.get("operation", "sql_query")),
            "description": str(s.get("description", "")),
            "parameters": s.get("parameters") or {},
            "depends_on": [int(d) for d in (s.get("depends_on") or [])],
            "rule_id": int(s.get("rule_id", 0)),
            "rule_ids": [int(r) for r in (s.get("rule_ids") or [s.get("rule_id", 0)])],
            "justification": str(s.get("justification", "")),
            "needs_validator": bool(s.get("needs_validator", True)),
        }
        if s.get("sql"):
            step["sql"] = str(s["sql"])
        steps.append(step)

    _logger.info("auto_planner: generated %d steps", len(steps))

    # Also write into the shared `plan` field so plan_presenter can display
    # auto steps identically to manual mode (same plan card, same approve button).
    plan_compat = [
        {
            "step_number": s["step_number"],
            "operation": s["operation"],
            "description": s["description"],
            "estimated_rows": "—",
            "sql": s.get("sql", ""),
            "depends_on": s.get("depends_on", []),
        }
        for s in steps
    ]

    return {
        "auto_plan": steps,
        "plan": plan_compat,
        "current_rule_index": 0,
        "reflection_attempts": {},
    }
