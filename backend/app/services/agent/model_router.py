"""Margin-safeguard LLM router.

When ``LLM_ROUTER_ENABLED=true`` (env), trivial / classification calls are routed
to a cheaper Groq model (default ``llama-3.1-8b-instant``) while complex
reasoning (planning, code-gen, error recovery) keeps the default versatile model
(``llama-3.3-70b-versatile``).

Plan-complexity routing: if the agent goal looks "simple" (short phrase, no
analytical keywords) the planner also uses the fast model, saving cost on
single-step transformations and basic queries.

Disabled by default for safe rollout. Set ``LLM_ROUTER_ENABLED=true`` to opt in.
"""

from __future__ import annotations

import os
import re
from typing import Literal

CallKind = Literal["classify", "converse", "transform", "plan", "reflect"]

_FAST_MODEL_ENV = "GROQ_FAST_MODEL"
_VERSATILE_MODEL_ENV = "GROQ_MODEL"
_FAST_DEFAULT = "llama-3.1-8b-instant"
_VERSATILE_DEFAULT = "llama-3.3-70b-versatile"

# Kinds that are always fast (low-stakes, cost-sensitive).
_FAST_KINDS: frozenset[CallKind] = frozenset({"classify", "converse"})

# Keywords that imply a complex plan needing the versatile model.
_COMPLEX_PLAN_KEYWORDS: frozenset[str] = frozenset({
    # analytics
    "cohort", "retention", "funnel", "rfm", "segmentation",
    "t-test", "ttest", "chi-square", "chisquare", "anova", "statistical",
    "forecast", "arima", "prophet", "exponential", "seasonal", "anomaly",
    "haversine", "geospatial", "distance", "coordinate", "lat", "lon",
    "sessionize", "sessionization",
    # ml
    "train", "model", "feature", "encode", "scale", "pca", "dimensionality",
    "split", "classification", "regression", "cluster", "vectorize", "tfidf",
    # multi-step goals
    "pipeline", "dashboard", "report", "multiple", "then", "and then",
    "after that", "step", "workflow",
})

# A plan goal is "simple" when it has ≤ this many words AND no complex keywords.
_SIMPLE_WORD_LIMIT = 10


def _router_enabled() -> bool:
    return os.getenv("LLM_ROUTER_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def is_simple_plan_goal(goal: str) -> bool:
    """Return True when the user's goal is likely a single-step, cheap operation.

    Heuristic: phrase is short AND does not contain any analytical/ML keywords
    that imply a multi-step or reasoning-heavy plan.
    """
    normalized = goal.lower()
    word_count = len(re.split(r"\s+", normalized.strip()))
    if word_count > _SIMPLE_WORD_LIMIT:
        return False
    for kw in _COMPLEX_PLAN_KEYWORDS:
        if kw in normalized:
            return False
    return True


def select_model(kind: CallKind, goal: str = "") -> str:
    """Return the Groq model id appropriate for the given call kind.

    When the router is disabled, always return the default versatile model so
    behaviour is identical to the pre-router pipeline.

    For ``kind="plan"``: additionally applies goal-complexity heuristic —
    a short, keyword-free goal is routed to the fast model to save cost.
    """
    versatile = os.getenv(_VERSATILE_MODEL_ENV, _VERSATILE_DEFAULT)
    fast = os.getenv(_FAST_MODEL_ENV, _FAST_DEFAULT)
    if not _router_enabled():
        return versatile
    if kind in _FAST_KINDS:
        return fast
    if kind == "plan" and goal and is_simple_plan_goal(goal):
        return fast
    return versatile
