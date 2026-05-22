import asyncio
import json
import logging
import re as _re

from langchain_core.messages import HumanMessage, SystemMessage

from ...llm_provider import get_chat_model

from ..prompts import PLANNER_SYSTEM_PROMPT
from ..state import AgentState, PlanStep
from ...echarts_builder import infer_chart_type
from ...token_tracking_service import log_call as _log_call

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

_llm_cache: dict = {}


def _load_glossary(project_id: str) -> dict:
    """Load project glossary from Context table; best-effort, returns {} on any failure."""
    if not project_id:
        return {}
    try:
        from ....db import SessionLocal
        from ....models_db import Context
        db = SessionLocal()
        try:
            ctx = db.query(Context).filter(Context.workspace_id == project_id).first()
            if ctx and ctx.glossary:
                return dict(ctx.glossary)
            return {}
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        _logger.debug("_load_glossary failed (non-fatal): %s", exc)
        return {}


def _get_llm(goal: str = ""):
    from ..model_router import select_model
    model = select_model("plan", goal=goal)
    cached = _llm_cache.get(model)
    if cached is None:
        cached = get_chat_model(model=model, temperature=0.1)
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

    _glossary = _load_glossary(state.get("project_id", ""))
    system_prompt = PLANNER_SYSTEM_PROMPT.format(
        schema=_dumps(state.get("schema", {})),
        stats=_dumps(state.get("stats", {})),
        sample_rows=_dumps(state.get("sample_rows", [])[:10]),
        glossary=_dumps(_glossary) if _glossary else "(none)",
        pipeline_steps=_dumps(_ps),
        available_templates=_dumps(state.get("available_templates", [])),
        calculated_columns=_dumps(state.get("calculated_columns", [])),
        dashboards=_dumps(state.get("dashboards", [])),
        secondary_datasets=_dumps(state.get("secondary_schemas", {})),
        cross_pipeline_inputs=_dumps(state.get("cross_pipeline_inputs", [])),
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
        _planner_input_tok = _planner_output_tok = 0
        _planner_user_id: str = state.get("user_id", "")
        _planner_session_id: str = state.get("session_id", "")
        from ..model_router import select_model as _sel
        _planner_model: str = _sel("plan", goal=user_goal)
        response = await asyncio.wait_for(
            _get_llm(user_goal).ainvoke(
                [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=human_content),
                ]
            ),
            timeout=30,
        )
        raw = str(response.content).strip()
        _um = getattr(response, "usage_metadata", None) or {}
        _planner_input_tok = _um.get("input_tokens", 0)
        _planner_output_tok = _um.get("output_tokens", 0)
    except asyncio.TimeoutError:
        _log_call(user_id=_planner_user_id, session_id=_planner_session_id,
                  model_used=_planner_model, query_type="plan",
                  input_tokens=0, output_tokens=0)
        _logger.error("planner LLM timed out after 30s")
        raise RuntimeError("AI service timed out while building plan. Please try again.")
    except Exception as exc:
        _log_call(user_id=_planner_user_id, session_id=_planner_session_id,
                  model_used=_planner_model, query_type="plan",
                  input_tokens=0, output_tokens=0)
        _logger.error("planner LLM error: %s", exc)
        raise RuntimeError(f"AI service error while building plan: {exc}") from exc
    _log_call(
        user_id=_planner_user_id, session_id=_planner_session_id,
        model_used=_planner_model, query_type="plan",
        input_tokens=_planner_input_tok, output_tokens=_planner_output_tok,
    )

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

    # ── Deterministic plan linter (leakage, DAG, schema, anti-patterns) ──
    try:
        from ..plan_linter import lint_plan as _lint_plan
        _lint_report = _lint_plan(
            plan,
            schema=state.get("schema"),
            target_column=state.get("target_column"),
        )
        if _lint_report.get("warnings"):
            _logger.info(
                "PLAN_LINT_WARNINGS: count=%d details=%s",
                len(_lint_report["warnings"]), _lint_report["warnings"][:5],
            )
        if _lint_report.get("errors"):
            _logger.warning(
                "PLAN_LINT_ERRORS: count=%d details=%s",
                len(_lint_report["errors"]), _lint_report["errors"][:5],
            )
            # ── Lint-error retry (one shot) ───────────────────────────────
            # If the LLM produced a plan that violates deterministic rules,
            # re-invoke with the errors injected so it can self-correct.
            # This is non-blocking: if the retry also fails, the original
            # plan is returned with a warning.
            try:
                _err_msgs = [
                    f"  Step {e.get('step_number','?')}: [{e['code']}] {e['message']}"
                    for e in _lint_report["errors"]
                ]
                _retry_human = (
                    human_content
                    + "\n\nIMPORTANT — your previous plan had the following validation errors. "
                    "Fix ALL of them in the revised plan:\n"
                    + "\n".join(_err_msgs)
                    + "\n\nReturn a corrected JSON plan that resolves every error above."
                )
                _logger.info(
                    "PLAN_LINT_RETRY: errors=%d",
                    len(_lint_report["errors"]),
                )
                _retry_response = await asyncio.wait_for(
                    _get_llm(user_goal).ainvoke(
                        [
                            SystemMessage(content=system_prompt),
                            HumanMessage(content=_retry_human),
                        ]
                    ),
                    timeout=30,
                )
                _retry_raw = str(_retry_response.content).strip()
                _um2 = getattr(_retry_response, "usage_metadata", None) or {}
                _log_call(
                    user_id=_planner_user_id, session_id=_planner_session_id,
                    model_used=_planner_model, query_type="plan_retry",
                    input_tokens=_um2.get("input_tokens", 0),
                    output_tokens=_um2.get("output_tokens", 0),
                )
                # Parse retry response
                if _retry_raw.startswith("```"):
                    _retry_raw = _retry_raw.split("```")[1]
                    if _retry_raw.startswith("json"):
                        _retry_raw = _retry_raw[4:]
                _retry_raw = _retry_raw.strip()
                _retry_parsed = None
                try:
                    _retry_parsed = json.loads(_retry_raw)
                except json.JSONDecodeError:
                    _jm = _re.search(r'\{[\s\S]*\}', _retry_raw)
                    if _jm:
                        try:
                            _retry_parsed = json.loads(_jm.group())
                        except json.JSONDecodeError:
                            pass
                if _retry_parsed is not None:
                    _retry_steps = _retry_parsed.get("steps", []) if isinstance(_retry_parsed, dict) else []
                    _retry_plan: list[PlanStep] = []
                    for _ri, _rs in enumerate(_retry_steps, start=1):
                        if not isinstance(_rs, dict):
                            continue
                        _retry_plan.append({
                            "step_number": int(_rs.get("step_number", _ri)),
                            "operation": str(_rs.get("operation") or "transform"),
                            "description": str(_rs.get("description") or "Execute transformation step"),
                            "parameters": _rs.get("parameters") if isinstance(_rs.get("parameters"), dict) else {},
                            "sql": str(
                                _rs.get("sql")
                                or (_rs.get("parameters", {}).get("sql")
                                    if isinstance(_rs.get("parameters"), dict) else "")
                                or ""
                            ),
                            "template_id": str(_rs.get("template_id")) if _rs.get("template_id") else None,
                            "estimated_rows": str(_rs.get("estimated_rows") or "Estimated rows unavailable"),
                            "reversible": bool(_rs.get("reversible", True)),
                            "depends_on": [int(d) for d in _rs.get("depends_on", [])] if _rs.get("depends_on") else [],
                        })
                    if _step_offset and _retry_plan:
                        for _rs2 in _retry_plan:
                            _on = _rs2["step_number"]
                            _rs2["step_number"] = _on + _step_offset
                            if _rs2.get("depends_on"):
                                _rs2["depends_on"] = [d + _step_offset for d in _rs2["depends_on"]]
                    _retry_plan = _sanitize_depends_on(_retry_plan, logger=_logger)
                    # Re-lint the retry plan; if it's cleaner, adopt it
                    _retry_lint = _lint_plan(
                        _retry_plan,
                        schema=state.get("schema"),
                        target_column=state.get("target_column"),
                    )
                    if len(_retry_lint.get("errors", [])) < len(_lint_report["errors"]):
                        _logger.info(
                            "PLAN_LINT_RETRY_ACCEPTED: original_errors=%d retry_errors=%d",
                            len(_lint_report["errors"]), len(_retry_lint.get("errors", [])),
                        )
                        plan = _retry_plan
                        _lint_report = _retry_lint
                    else:
                        _logger.info(
                            "PLAN_LINT_RETRY_REJECTED: original_errors=%d retry_errors=%d (kept original)",
                            len(_lint_report["errors"]), len(_retry_lint.get("errors", [])),
                        )
            except Exception as _retry_exc:  # noqa: BLE001
                _logger.warning("PLAN_LINT_RETRY_FAILED: %s", _retry_exc)
    except Exception as _lint_exc:
        _logger.warning("PLAN_LINT_FAILED: %s", _lint_exc)
        _lint_report = {"warnings": [], "errors": [], "auto_fixes": [], "ok": True}

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
