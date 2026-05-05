"""
reflection_v2.py
================
Auto Mode reflection node — 3-tier strategy:

  Tier 0  Deterministic: no LLM — resolves drift-caused failures using hints from drift_detector.
  Tier 1  LLM: parameter adjustment (same operation).
  Tier 2  LLM: operation substitution (different op, same category).
  Tier 3  LLM: decomposition (2-3 sub-steps).

Inputs  (from AgentState):
  - auto_plan, current_rule_index
  - last_validation      : StepValidationResult
  - auto_goal            : AutoGoal
  - drift_report         : DriftReport | None
  - reflection_history   : dict[int, list[str]]  — {step_number: [prev_rationales]}
  - reflection_attempts  : dict[int, int]         — {step_number: current_tier}

Outputs (merged into AgentState):
  - auto_plan            : updated (step replaced or sub-steps inserted)
  - reflection_history   : updated
  - reflection_attempts  : updated
  - interrupt_pending    : True if max tiers exhausted
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from copy import deepcopy
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from ..auto_prompts import REFLECTION_V2_SYSTEM, REFLECTION_V2_USER
from ..auto_types import AutoPlanStep, DriftReport, StepValidationResult
from ..state import AgentState
from ...token_tracking_service import log_call as _log_call

_logger = logging.getLogger(__name__)
_MAX_TIERS = 3


def _get_llm() -> ChatGroq:
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.2,
        groq_api_key=os.getenv("GROQ_API_KEY"),
    )


def _dumps(obj: Any) -> str:
    try:
        return json.dumps(obj, indent=2)
    except Exception:
        return str(obj)


def _get_column_stats(state: AgentState, columns: list[str]) -> dict:
    stats = state.get("stats") or {}
    if isinstance(stats, dict):
        return {c: stats[c] for c in columns if c in stats}
    return {}


def _tier0_drift_fix(
    failed_step: AutoPlanStep,
    drift_report: DriftReport | None,
) -> AutoPlanStep | None:
    """Tier 0: deterministic drift fix — apply auto_adjustments from drift report."""
    if not drift_report:
        return None
    params = deepcopy(failed_step.get("parameters") or {})
    changed = False
    for adj in drift_report.get("auto_adjustments") or []:
        col = adj.get("column")
        new_params = adj.get("adjustment")
        if col and new_params and isinstance(new_params, dict):
            params.update(new_params)
            changed = True
    if not changed:
        return None
    new_step: AutoPlanStep = {**failed_step, "parameters": params}  # type: ignore[typeddict-unknown-key]
    return new_step


async def reflection_v2(state: AgentState) -> dict:
    auto_plan: list[AutoPlanStep] = list(state.get("auto_plan") or [])
    current_idx: int = state.get("current_rule_index", 0)
    last_val: StepValidationResult | None = state.get("last_validation")
    auto_goal = state.get("auto_goal") or {}
    drift_report: DriftReport | None = state.get("drift_report")
    reflection_history: dict = dict(state.get("reflection_history") or {})
    reflection_attempts: dict = dict(state.get("reflection_attempts") or {})
    user_id: str = state.get("user_id", "")
    session_id: str = state.get("session_id", "")
    model = "llama-3.3-70b-versatile"

    if not last_val or not auto_plan or current_idx >= len(auto_plan):
        return {"interrupt_pending": True}

    failed_step = auto_plan[current_idx]
    step_num = failed_step["step_number"]
    current_tier: int = reflection_attempts.get(step_num, 0) + 1
    reflection_attempts[step_num] = current_tier

    # --- Tier 0: deterministic drift fix ---
    if current_tier == 1:
        fixed = _tier0_drift_fix(failed_step, drift_report)
        if fixed:
            new_plan = list(auto_plan)
            new_plan[current_idx] = fixed
            hist = reflection_history.get(step_num, [])
            hist.append("Tier 0: drift auto-adjustment applied")
            reflection_history[step_num] = hist
            _logger.info("reflection_v2: Tier 0 applied for step=%d", step_num)
            return {
                "auto_plan": new_plan,
                "reflection_history": reflection_history,
                "reflection_attempts": reflection_attempts,
                "interrupt_pending": False,
            }
        else:
            # No drift fix available — escalate to Tier 1 directly
            current_tier = 2
            reflection_attempts[step_num] = current_tier

    # --- Tiers 1-3: LLM-driven ---
    if current_tier > _MAX_TIERS:
        _logger.info("reflection_v2: max tiers exhausted for step=%d", step_num)
        return {
            "reflection_history": reflection_history,
            "reflection_attempts": reflection_attempts,
            "interrupt_pending": True,
        }

    rule_id = failed_step.get("rule_id", 0)
    rules = auto_goal.get("rules", [])
    rule = next((r for r in rules if r.get("rule_id") == rule_id), {})
    rule_desc = rule.get("description", "")
    assertion = rule.get("assertion") or {}
    target_cols = rule.get("target_columns", [])
    col_stats = _get_column_stats(state, target_cols)
    hist = reflection_history.get(step_num, [])

    system_msg = REFLECTION_V2_SYSTEM.format(tier=current_tier - 1)  # Tier 0 is deterministic
    user_msg = REFLECTION_V2_USER.format(
        failed_step=_dumps(failed_step),
        rule_description=rule_desc,
        assertion=_dumps(assertion),
        residual_count=last_val.get("residual_count", "?"),
        tolerance=last_val.get("tolerance", 0),
        sample_failures=_dumps(last_val.get("sample_failures") or []),
        column_stats=_dumps(col_stats),
        attempt_history=_dumps(hist),
    )

    _input_tok = _output_tok = 0
    try:
        response = await asyncio.wait_for(
            _get_llm().ainvoke([SystemMessage(content=system_msg), HumanMessage(content=user_msg)]),
            timeout=30,
        )
        raw = str(response.content).strip()
        _um = getattr(response, "usage_metadata", None) or {}
        _input_tok = _um.get("input_tokens", 0)
        _output_tok = _um.get("output_tokens", 0)
    except asyncio.TimeoutError:
        _log_call(user_id=user_id, session_id=session_id, model_used=model,
                  query_type="reflect", input_tokens=0, output_tokens=0)
        return {"reflection_attempts": reflection_attempts, "interrupt_pending": True}
    except Exception as exc:
        _log_call(user_id=user_id, session_id=session_id, model_used=model,
                  query_type="reflect", input_tokens=0, output_tokens=0)
        _logger.error("reflection_v2 LLM error: %s", exc)
        return {"reflection_attempts": reflection_attempts, "interrupt_pending": True}

    _log_call(user_id=user_id, session_id=session_id, model_used=model,
              query_type="reflect", input_tokens=_input_tok, output_tokens=_output_tok)

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        _logger.error("reflection_v2 JSON parse failed: %s", raw[:300])
        return {"reflection_attempts": reflection_attempts, "interrupt_pending": True}

    rationale = parsed.get("rationale", "")
    hist.append(f"Tier {current_tier - 1}: {rationale}")
    reflection_history[step_num] = hist
    new_plan = list(auto_plan)

    if "sub_steps" in parsed and current_tier == _MAX_TIERS + 1:
        # Tier 3 decomposition: replace step with sub-steps
        sub_steps_raw = parsed["sub_steps"]
        sub_steps = []
        for ss in sub_steps_raw:
            if isinstance(ss, dict):
                ss.setdefault("rule_id", rule_id)
                ss.setdefault("needs_validator", True)
                ss.setdefault("depends_on", [])
                ss.setdefault("justification", "decomposed sub-step")
                sub_steps.append(ss)
        if sub_steps:
            new_plan = new_plan[:current_idx] + sub_steps + new_plan[current_idx + 1:]
    elif "new_step" in parsed:
        new_step_raw = parsed["new_step"]
        if isinstance(new_step_raw, dict):
            new_step_raw.setdefault("rule_id", rule_id)
            new_step_raw.setdefault("needs_validator", True)
            new_step_raw.setdefault("depends_on", [])
            new_step_raw.setdefault("justification", rationale)
            new_plan[current_idx] = new_step_raw

    _logger.info("reflection_v2: Tier %d applied for step=%d", current_tier - 1, step_num)
    return {
        "auto_plan": new_plan,
        "reflection_history": reflection_history,
        "reflection_attempts": reflection_attempts,
        "interrupt_pending": False,
    }
