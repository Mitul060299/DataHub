"""
goal_parser.py
==============
Auto Mode node that parses a free-text / structured goal into a list of
atomic, testable AutoRule objects.

Inputs  (from AgentState):
  - auto_goal_raw      : str  — the user's raw goal text
  - schema, stats      : dict — already loaded by context_loader
  - project_id         : str  — for glossary lookup

Outputs (merged into AgentState):
  - auto_goal          : AutoGoal
"""
from __future__ import annotations

import asyncio
import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from ...llm_provider import get_chat_model

from ..auto_prompts import GOAL_PARSER_SYSTEM, GOAL_PARSER_USER
from ..auto_types import AutoGoal, AutoRule
from ..state import AgentState
from ...token_tracking_service import log_call as _log_call

_logger = logging.getLogger(__name__)

_llm_cache: dict = {}


def _get_llm():
    model = "llama-3.3-70b-versatile"
    cached = _llm_cache.get(model)
    if not cached:
        cached = get_chat_model(model=model, temperature=0)
        _llm_cache[model] = cached
    return cached


def _dumps(obj) -> str:
    try:
        import json as _j
        return _j.dumps(obj, indent=2)
    except Exception:
        return str(obj)


def _load_glossary(project_id: str) -> dict:
    """Load project glossary terms if available; returns empty dict otherwise."""
    try:
        from ....db import SessionLocal
        from ....models_db import ProjectDB
        db = SessionLocal()
        try:
            # Glossary stored as JSONB on project or context_store — best-effort
            proj = db.query(ProjectDB).filter(ProjectDB.id == project_id).first()
            if proj and hasattr(proj, "glossary") and proj.glossary:
                return dict(proj.glossary)
            return {}
        finally:
            db.close()
    except Exception:
        return {}


async def goal_parser(state: AgentState) -> dict:
    """Parse the raw auto goal into structured AutoRule list."""
    raw_goal: str = state.get("auto_goal_raw", "")
    schema = state.get("schema", {})
    stats = state.get("stats", {})
    project_id: str = state.get("project_id", "")
    user_id: str = state.get("user_id", "")
    session_id: str = state.get("session_id", "")
    model = "llama-3.3-70b-versatile"

    if not raw_goal:
        _logger.warning("goal_parser: empty auto_goal_raw")
        return {"auto_goal": AutoGoal(rules=[], total_rules=0, goal_summary="")}

    glossary = _load_glossary(project_id)
    system_msg = GOAL_PARSER_SYSTEM
    user_msg = GOAL_PARSER_USER.format(
        schema=_dumps(schema),
        stats=_dumps(stats),
        glossary=_dumps(glossary) if glossary else "(none)",
        goal_text=raw_goal,
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
                  query_type="classify", input_tokens=0, output_tokens=0)
        _logger.error("goal_parser timed out")
        return {"auto_goal": AutoGoal(rules=[], total_rules=0, goal_summary="(timeout)")}
    except Exception as exc:
        _log_call(user_id=user_id, session_id=session_id, model_used=model,
                  query_type="classify", input_tokens=0, output_tokens=0)
        _logger.error("goal_parser LLM error: %s", exc)
        return {"auto_goal": AutoGoal(rules=[], total_rules=0, goal_summary="(error)")}

    _log_call(user_id=user_id, session_id=session_id, model_used=model,
              query_type="classify", input_tokens=_input_tok, output_tokens=_output_tok)

    # Strip code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        _logger.error("goal_parser JSON parse failed: %s", raw[:500])
        return {"auto_goal": AutoGoal(rules=[], total_rules=0, goal_summary="(parse error)")}

    rules_raw = parsed.get("rules", [])
    goal_summary = parsed.get("goal_summary", "")

    # Validate: only keep rules with columns that exist in schema
    schema_cols = set(schema.keys()) if isinstance(schema, dict) else set()
    validated_rules: list[AutoRule] = []
    for r in rules_raw:
        if not isinstance(r, dict):
            continue
        # Filter target_columns to only those in the schema
        target_cols = [c for c in (r.get("target_columns") or []) if not schema_cols or c in schema_cols]
        rule: AutoRule = {
            "rule_id": int(r.get("rule_id", len(validated_rules) + 1)),
            "description": str(r.get("description", "")),
            "target_columns": target_cols,
            "operation_hint": r.get("operation_hint"),
            "assertion": r.get("assertion") or {"kind": "sql", "params": {"query": "SELECT 0"}, "tolerance": 0},
            "depends_on": [int(d) for d in (r.get("depends_on") or [])],
            "complexity": r.get("complexity", "simple"),
            "confidence": float(r.get("confidence", 1.0)),
        }
        validated_rules.append(rule)

    auto_goal = AutoGoal(
        rules=validated_rules,
        total_rules=len(validated_rules),
        goal_summary=goal_summary,
    )
    _logger.info("goal_parser: parsed %d rules for goal: %s", len(validated_rules), goal_summary[:80])
    return {"auto_goal": auto_goal}
