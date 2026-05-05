"""
interrupt_asker.py
==================
Auto Mode node — generates a targeted question to resolve an ambiguous rule
that could not be fixed by reflection.

Suspends the LangGraph thread via state flag (works with MemorySaver
checkpointer). The runner polls `interrupt_pending` / `interrupt_question`
and resumes with the user's answer in `interrupt_response`.

Inputs  (from AgentState):
  - auto_goal, auto_plan, current_rule_index
  - last_validation     : StepValidationResult
  - reflection_history  : dict
  - interrupt_response  : str | None  — set by API on resume

Outputs (merged into AgentState):
  - interrupt_pending    : True  (caller checks this to suspend)
  - interrupt_question   : InterruptQuestion
"""
from __future__ import annotations

import asyncio
import json
import logging
import os

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from ..auto_prompts import INTERRUPT_ASKER_SYSTEM, INTERRUPT_ASKER_USER
from ..auto_types import AutoPlanStep, InterruptQuestion, StepValidationResult
from ..state import AgentState
from ...token_tracking_service import log_call as _log_call

_logger = logging.getLogger(__name__)


def _get_llm() -> ChatGroq:
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        groq_api_key=os.getenv("GROQ_API_KEY"),
    )


def _dumps(obj) -> str:
    try:
        return json.dumps(obj, indent=2)
    except Exception:
        return str(obj)


def _has_dependents(rule_id: int, all_rules: list) -> bool:
    for r in all_rules:
        if rule_id in (r.get("depends_on") or []):
            return True
    return False


async def interrupt_asker(state: AgentState) -> dict:
    auto_plan: list[AutoPlanStep] = state.get("auto_plan") or []
    current_idx: int = state.get("current_rule_index", 0)
    auto_goal = state.get("auto_goal") or {}
    last_val: StepValidationResult | None = state.get("last_validation")
    reflection_history: dict = state.get("reflection_history") or {}
    user_id: str = state.get("user_id", "")
    session_id: str = state.get("session_id", "")
    model = "llama-3.3-70b-versatile"

    if not auto_plan or current_idx >= len(auto_plan):
        return {"interrupt_pending": True, "interrupt_question": None}

    failed_step = auto_plan[current_idx]
    rule_id: int = failed_step.get("rule_id", 0)
    rules = auto_goal.get("rules", [])
    rule = next((r for r in rules if r.get("rule_id") == rule_id), {})
    assertion = rule.get("assertion") or {}
    hist = reflection_history.get(failed_step["step_number"], [])
    has_deps = _has_dependents(rule_id, rules)
    sample_rows = (last_val or {}).get("sample_failures") or []

    user_msg = INTERRUPT_ASKER_USER.format(
        rule=_dumps(rule),
        assertion=_dumps(assertion),
        sample_rows=_dumps(sample_rows[:10]),
        attempt_history=_dumps(hist),
        has_dependents="Yes" if has_deps else "No",
    )

    _input_tok = _output_tok = 0
    try:
        response = await asyncio.wait_for(
            _get_llm().ainvoke([SystemMessage(content=INTERRUPT_ASKER_SYSTEM), HumanMessage(content=user_msg)]),
            timeout=30,
        )
        raw = str(response.content).strip()
        _um = getattr(response, "usage_metadata", None) or {}
        _input_tok = _um.get("input_tokens", 0)
        _output_tok = _um.get("output_tokens", 0)
    except asyncio.TimeoutError:
        _log_call(user_id=user_id, session_id=session_id, model_used=model,
                  query_type="interrupt", input_tokens=0, output_tokens=0)
        return {"interrupt_pending": True, "interrupt_question": None}
    except Exception as exc:
        _log_call(user_id=user_id, session_id=session_id, model_used=model,
                  query_type="interrupt", input_tokens=0, output_tokens=0)
        _logger.error("interrupt_asker error: %s", exc)
        return {"interrupt_pending": True, "interrupt_question": None}

    _log_call(user_id=user_id, session_id=session_id, model_used=model,
              query_type="interrupt", input_tokens=_input_tok, output_tokens=_output_tok)

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        _logger.error("interrupt_asker JSON parse failed: %s", raw[:300])
        return {"interrupt_pending": True, "interrupt_question": None}

    question: InterruptQuestion = {
        "rule_id": rule_id,
        "question": str(parsed.get("question", "")),
        "options": parsed.get("options") or [],
        "sample_rows": sample_rows[:10],
        "allow_freeform": bool(parsed.get("allow_freeform", True)),
        "blocks_other_rules": bool(parsed.get("blocks_other_rules", has_deps)),
    }

    _logger.info("interrupt_asker: question generated for rule=%d", rule_id)
    return {"interrupt_pending": True, "interrupt_question": question}
