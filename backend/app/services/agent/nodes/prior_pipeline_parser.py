"""
prior_pipeline_parser.py
=========================
Auto Mode node — normalises a prior pipeline artefact (SQL, Python, text,
dbt YAML, recipe_id, pipeline_run_id) into a list of ReferenceStep + inferred
ColumnExpectation objects.

Inputs  (from AgentState):
  - prior_pipeline      : PriorPipeline | None  — from API body or recipe lookup
  - schema              : dict

Outputs (merged into AgentState):
  - reference_steps     : list[ReferenceStep]
  - inferred_expectations : list[ColumnExpectation]
  - prior_trust_level   : str
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from ...llm_provider import get_chat_model

from ..auto_prompts import PRIOR_PIPELINE_PARSER_SYSTEM, PRIOR_PIPELINE_PARSER_USER
from ..auto_types import ColumnExpectation, PriorPipeline, ReferenceStep
from ..state import AgentState
from ...token_tracking_service import log_call as _log_call

_logger = logging.getLogger(__name__)


def _get_llm():
    return get_chat_model(model="llama-3.3-70b-versatile", temperature=0)


def _dumps(obj: Any) -> str:
    try:
        return json.dumps(obj, indent=2)
    except Exception:
        return str(obj)


def _load_recipe(recipe_id: str) -> str | None:
    """Load recipe content from DB; returns None on failure."""
    try:
        from ....db import SessionLocal
        from sqlalchemy import text
        db = SessionLocal()
        try:
            row = db.execute(
                text("SELECT goal_text, rules, reference_steps FROM agent_recipes WHERE id = :id"),
                {"id": recipe_id},
            ).fetchone()
            if row:
                return json.dumps({"goal_text": row[0], "rules": row[1], "reference_steps": row[2]})
            return None
        finally:
            db.close()
    except Exception as exc:
        _logger.warning("prior_pipeline_parser: recipe load failed: %s", exc)
        return None


def _load_pipeline_run(run_id: str) -> str | None:
    """Load executed steps from pipeline_runs_v2; returns None on failure."""
    try:
        from ....db import SessionLocal
        from sqlalchemy import text
        db = SessionLocal()
        try:
            rows = db.execute(
                text(
                    "SELECT operation, parameters, step_number, rule_justification "
                    "FROM pipeline_steps WHERE pipeline_run_id = :id ORDER BY step_number"
                ),
                {"id": run_id},
            ).fetchall()
            if rows:
                steps = [
                    {"step_number": r[2], "operation": r[0], "parameters": r[1] or {}}
                    for r in rows
                ]
                return json.dumps(steps)
            return None
        finally:
            db.close()
    except Exception as exc:
        _logger.warning("prior_pipeline_parser: pipeline run load failed: %s", exc)
        return None


async def prior_pipeline_parser(state: AgentState) -> dict:
    prior: PriorPipeline | None = state.get("prior_pipeline")
    schema = state.get("schema", {})
    user_id: str = state.get("user_id", "")
    session_id: str = state.get("session_id", "")
    model = "llama-3.3-70b-versatile"

    if not prior:
        return {"reference_steps": [], "inferred_expectations": [], "prior_trust_level": "guide"}

    fmt: str = prior.get("format", "text")
    content: str = prior.get("content", "")
    trust_level: str = prior.get("trust_level", "guide")

    # Resolve recipe_id / pipeline_run_id to actual content
    if fmt == "recipe_id":
        loaded = _load_recipe(content)
        if loaded:
            content = loaded
            fmt = "text"  # treat expanded recipe as text for the LLM
        else:
            return {"reference_steps": [], "inferred_expectations": [], "prior_trust_level": trust_level}

    elif fmt == "pipeline_run_id":
        loaded = _load_pipeline_run(content)
        if loaded:
            content = loaded
            fmt = "text"
        else:
            return {"reference_steps": [], "inferred_expectations": [], "prior_trust_level": trust_level}

    user_msg = PRIOR_PIPELINE_PARSER_USER.format(
        source_format=fmt,
        schema=_dumps(schema),
        content=content[:8000],  # guard against enormous pastes
    )

    _input_tok = _output_tok = 0
    try:
        response = await asyncio.wait_for(
            _get_llm().ainvoke(
                [SystemMessage(content=PRIOR_PIPELINE_PARSER_SYSTEM), HumanMessage(content=user_msg)]
            ),
            timeout=30,
        )
        raw = str(response.content).strip()
        _um = getattr(response, "usage_metadata", None) or {}
        _input_tok = _um.get("input_tokens", 0)
        _output_tok = _um.get("output_tokens", 0)
    except asyncio.TimeoutError:
        _log_call(user_id=user_id, session_id=session_id, model_used=model,
                  query_type="classify", input_tokens=0, output_tokens=0)
        return {"reference_steps": [], "inferred_expectations": [], "prior_trust_level": trust_level}
    except Exception as exc:
        _log_call(user_id=user_id, session_id=session_id, model_used=model,
                  query_type="classify", input_tokens=0, output_tokens=0)
        _logger.error("prior_pipeline_parser error: %s", exc)
        return {"reference_steps": [], "inferred_expectations": [], "prior_trust_level": trust_level}

    _log_call(user_id=user_id, session_id=session_id, model_used=model,
              query_type="classify", input_tokens=_input_tok, output_tokens=_output_tok)

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        _logger.error("prior_pipeline_parser JSON parse failed: %s", raw[:300])
        return {"reference_steps": [], "inferred_expectations": [], "prior_trust_level": trust_level}

    steps_raw = parsed.get("reference_steps", [])
    exp_raw = parsed.get("expectations", [])

    steps: list[ReferenceStep] = []
    for s in steps_raw:
        if isinstance(s, dict):
            steps.append(ReferenceStep(
                order=int(s.get("order", len(steps) + 1)),
                operation=str(s.get("operation", "sql_query")),
                parameters=s.get("parameters") or {},
                source_quote=str(s.get("source_quote", "")),
                covers_rules=[],  # filled in by goal_parser join pass
                confidence=float(s.get("confidence", 1.0)),
            ))

    expectations: list[ColumnExpectation] = []
    for e in exp_raw:
        if isinstance(e, dict):
            expectations.append(ColumnExpectation(
                column=str(e.get("column", "")),
                kind=str(e.get("kind", "not_null")),
                params=e.get("params") or {},
                tolerance=float(e.get("tolerance", 0.05)),
                source="inferred",
            ))

    _logger.info("prior_pipeline_parser: %d steps, %d expectations", len(steps), len(expectations))
    return {
        "reference_steps": steps,
        "inferred_expectations": expectations,
        "prior_trust_level": trust_level,
    }
