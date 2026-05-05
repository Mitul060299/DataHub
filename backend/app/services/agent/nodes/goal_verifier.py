"""
goal_verifier.py
================
Auto Mode node — pure SQL, no LLM.

Re-runs ALL rule assertions on the final output table and generates a
GoalReport. Triggers up to one additional auto_planner + execution cycle
if rules are still failing (recursion cap = 1, enforced by
goal_verifier_recursions in state).

Inputs  (from AgentState):
  - auto_goal           : AutoGoal
  - active_table_name   : str
  - duckdb_conn_path    : str | None
  - goal_verifier_recursions : int  — incremented each time we recurse (max 1)

Outputs (merged into AgentState):
  - goal_report         : GoalReport
  - interrupt_pending   : True if still failing and recursion cap reached
"""
from __future__ import annotations

import logging
import time
from typing import Any

import duckdb

from ..auto_types import AutoGoal, DQAssertion, GoalReport, RuleFailure, StepValidationResult
from ..nodes.step_validator import _compile_assertion, _sample_failures
from ..state import AgentState

_logger = logging.getLogger(__name__)
_MAX_RECURSIONS = 1


async def goal_verifier(state: AgentState) -> dict:
    auto_goal: AutoGoal = state.get("auto_goal") or {}
    table: str = state.get("active_table_name", "") or state.get("source_table", "")
    duckdb_path: str | None = state.get("duckdb_conn_path")
    recursions: int = int(state.get("goal_verifier_recursions") or 0)

    start_ts = time.time()
    rules = auto_goal.get("rules", [])
    if not rules or not table:
        report = GoalReport(
            rules_satisfied=0,
            rules_failed=0,
            rules_skipped=len(rules),
            total_rules=len(rules),
            failures=[],
            duration_seconds=0.0,
            tokens_used=state.get("total_tokens_used", 0),
        )
        return {"goal_report": report, "interrupt_pending": False}

    try:
        if duckdb_path:
            conn = duckdb.connect(duckdb_path, read_only=True)
        else:
            conn = duckdb.connect()
    except Exception as exc:
        _logger.error("goal_verifier: could not open DuckDB: %s", exc)
        return {"goal_report": None, "interrupt_pending": False}

    satisfied = 0
    failed_rules: list[RuleFailure] = []
    skipped = 0

    try:
        for rule in rules:
            rule_id = rule.get("rule_id", 0)
            assertion: DQAssertion = rule.get("assertion") or {}
            tolerance: int = int(assertion.get("tolerance") or 0)

            sql = _compile_assertion(assertion, table)
            if not sql:
                skipped += 1
                continue

            try:
                residual: int = conn.execute(sql).fetchone()[0]  # type: ignore[index]
            except Exception as exc:
                _logger.warning("goal_verifier: assertion query failed rule=%d: %s", rule_id, exc)
                skipped += 1
                continue

            if residual <= tolerance:
                satisfied += 1
            else:
                sample = _sample_failures(conn, assertion, table)
                failed_rules.append(RuleFailure(
                    rule_id=rule_id,
                    description=str(rule.get("description", "")),
                    residual_count=residual,
                    sample=sample,
                ))
    finally:
        conn.close()

    duration = round(time.time() - start_ts, 3)
    report = GoalReport(
        rules_satisfied=satisfied,
        rules_failed=len(failed_rules),
        rules_skipped=skipped,
        total_rules=len(rules),
        failures=failed_rules,
        duration_seconds=duration,
        tokens_used=state.get("total_tokens_used", 0),
    )

    # Should we recurse for still-failing rules?
    if failed_rules and recursions < _MAX_RECURSIONS:
        _logger.info(
            "goal_verifier: %d rules still failing, triggering recursion %d/%d",
            len(failed_rules), recursions + 1, _MAX_RECURSIONS,
        )
        return {
            "goal_report": report,
            "goal_verifier_recursions": recursions + 1,
            "interrupt_pending": False,
            # Signal to the graph router to re-run auto_planner for the failed rules only
            "_verifier_trigger_replan": [f.get("rule_id") for f in failed_rules],
        }

    interrupt = bool(failed_rules)  # still failing after max recursions
    _logger.info(
        "goal_verifier: final — satisfied=%d failed=%d skipped=%d in %.2fs",
        satisfied, len(failed_rules), skipped, duration,
    )
    return {
        "goal_report": report,
        "interrupt_pending": interrupt,
        "goal_verifier_recursions": recursions,
        "_verifier_trigger_replan": [],
    }
