"""Margin-safeguard LLM router.

When ``LLM_ROUTER_ENABLED=true`` (env), trivial / classification calls are routed
to a cheaper Groq model (default ``llama-3.1-8b-instant``) while complex
reasoning (planning, code-gen, error recovery) keeps the default versatile model
(``llama-3.3-70b-versatile``).

Disabled by default for safe rollout. Set ``LLM_ROUTER_ENABLED=true`` to opt in.
"""

from __future__ import annotations

import os
from typing import Literal

CallKind = Literal["classify", "converse", "transform", "plan", "reflect"]

_FAST_MODEL_ENV = "GROQ_FAST_MODEL"
_VERSATILE_MODEL_ENV = "GROQ_MODEL"
_FAST_DEFAULT = "llama-3.1-8b-instant"
_VERSATILE_DEFAULT = "llama-3.3-70b-versatile"

# Kinds that are short, low-stakes, and cost-sensitive at scale.
_FAST_KINDS: frozenset[CallKind] = frozenset({"classify", "converse"})


def _router_enabled() -> bool:
    return os.getenv("LLM_ROUTER_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def select_model(kind: CallKind) -> str:
    """Return the Groq model id appropriate for the given call kind.

    When the router is disabled, always return the default versatile model so
    behaviour is identical to the pre-router pipeline.
    """
    versatile = os.getenv(_VERSATILE_MODEL_ENV, _VERSATILE_DEFAULT)
    if not _router_enabled():
        return versatile
    if kind in _FAST_KINDS:
        return os.getenv(_FAST_MODEL_ENV, _FAST_DEFAULT)
    return versatile
