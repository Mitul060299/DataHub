"""
pre_plan_clarifier.py
=====================
Optional gate node that runs after goal_parser and before drift_detector /
auto_planner.  If any parsed rule is low-confidence or underspecified, it
asks ONE focused clarifying question and suspends the graph until the user
answers.  On resume the user's answer is appended to auto_goal_raw and the
graph re-enters at goal_parser.

Inputs  (from AgentState):
  - auto_goal          : AutoGoal  — parsed rules with confidence scores

Outputs (merged into AgentState):
  - goal_clarification_pending : str  — question text (set if clarification needed)
    OR  no-op dict {} if no clarification needed
"""
from __future__ import annotations

import logging
from typing import Any

from ..auto_types import AutoGoal
from ..state import AgentState

_logger = logging.getLogger(__name__)

# Rules with confidence below this threshold trigger a clarifying question.
_CONFIDENCE_THRESHOLD = 0.70

# Column-level ambiguity: if a rule targets >3 columns and has no specific
# assertion columns, ask the user to confirm scope.
_MAX_IMPLICIT_COLS = 3


def _pick_ambiguous_rule(rules: list[dict]) -> dict | None:
    """Return the most ambiguous rule, or None if all are clear."""
    # Priority 1: explicit low confidence
    for r in rules:
        conf = float(r.get("confidence", 1.0))
        if conf < _CONFIDENCE_THRESHOLD:
            return r

    # Priority 2: complex rules with >3 target columns and no specific assertion
    for r in rules:
        if r.get("complexity") == "complex":
            cols = r.get("target_columns") or []
            assertion = r.get("assertion") or {}
            assertion_kind = assertion.get("kind", "")
            if len(cols) > _MAX_IMPLICIT_COLS and assertion_kind not in ("sql", "python"):
                return r

    return None


def _make_question(rule: dict) -> str:
    """Generate a short, focused clarifying question for the ambiguous rule."""
    desc = rule.get("description", "this rule")
    cols = rule.get("target_columns") or []
    hint = rule.get("operation_hint") or ""
    conf = float(rule.get("confidence", 1.0))

    if conf < _CONFIDENCE_THRESHOLD:
        if cols:
            col_list = ", ".join(f"`{c}`" for c in cols[:5])
            return (
                f"To apply **{desc}**, I'll work on {col_list}. "
                f"Could you confirm these are the right columns, or list the specific ones you want me to target?"
            )
        return (
            f"I understood **{desc}**, but I'm not certain which columns to target. "
            f"Could you specify the column names?"
        )

    # Complex / broad scope
    col_list = ", ".join(f"`{c}`" for c in cols[:5])
    extra = f" (and {len(cols) - 5} more)" if len(cols) > 5 else ""
    return (
        f"This looks like a broad operation (**{hint or desc}**) across "
        f"{col_list}{extra}. Should I apply it to **all** these columns, "
        f"or would you like to narrow the scope?"
    )


async def pre_plan_clarifier(state: AgentState) -> dict[str, Any]:
    auto_goal: AutoGoal = state.get("auto_goal") or {}
    rules = auto_goal.get("rules") or []

    # If the user already answered a clarification (raw goal updated with answer),
    # or if there are no rules at all, skip this node.
    if not rules:
        return {}

    ambiguous = _pick_ambiguous_rule(rules)
    if ambiguous is None:
        # All rules are clear — pass through
        _logger.debug("pre_plan_clarifier: all rules clear, passing through")
        return {}

    question = _make_question(ambiguous)
    _logger.info(
        "pre_plan_clarifier: rule_id=%s confidence=%.2f → asking clarification",
        ambiguous.get("rule_id"), float(ambiguous.get("confidence", 1.0)),
    )
    return {"goal_clarification_pending": question}
