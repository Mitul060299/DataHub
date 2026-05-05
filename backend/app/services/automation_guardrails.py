from typing import Any

from ..config import settings
from ..models import AutomationGuardrailPolicyOut, AutomationGuardrailPolicyUpdate


_policy: dict[str, Any] = {
    "enabled": bool(settings.automation_guardrails_enabled),
    "max_rows": max(1, int(settings.automation_guardrails_max_rows)),
    "max_columns": max(1, int(settings.automation_guardrails_max_columns)),
    "max_request_chars": max(10, int(settings.automation_guardrails_max_request_chars)),
    "max_steps": max(1, int(settings.automation_guardrails_max_steps)),
    "allow_ml_training": bool(settings.automation_guardrails_allow_ml_training),
    # Auto Mode specific limits
    "max_steps_per_auto_run": 50,
    "max_reflection_attempts": 3,
    "max_interrupt_questions": 10,
    "max_parallel_steps": 4,
    "auto_run_timeout_s": 600,
    "max_goal_chars": 32768,
    "max_tokens_per_run": 200_000,
}


def get_automation_guardrail_policy() -> AutomationGuardrailPolicyOut:
    return AutomationGuardrailPolicyOut(**_policy)


def update_automation_guardrail_policy(payload: AutomationGuardrailPolicyUpdate) -> AutomationGuardrailPolicyOut:
    updates = payload.dict(exclude_unset=True)
    if not updates:
        return get_automation_guardrail_policy()

    _policy.update(updates)
    _policy["max_rows"] = max(1, int(_policy["max_rows"]))
    _policy["max_columns"] = max(1, int(_policy["max_columns"]))
    _policy["max_request_chars"] = max(10, int(_policy["max_request_chars"]))
    _policy["max_steps"] = max(1, int(_policy["max_steps"]))

    return get_automation_guardrail_policy()


def allowed_automation_tools(policy: AutomationGuardrailPolicyOut) -> list[str]:
    base_tools = [
        "assess_quality",
        "clean_data",
        "transform_data",
        "compute_statistics",
        "create_visualization",
        "generate_insights",
        "make_plan",
        "ask_user",
    ]
    if policy.allow_ml_training:
        base_tools.append("train_ml_model")
    return base_tools


# ---------------------------------------------------------------------------
# Auto Mode guardrail helpers
# ---------------------------------------------------------------------------

def check_goal_length(goal_text: str) -> None:
    """Raise ValueError if goal exceeds max_goal_chars."""
    max_chars = int(_policy.get("max_goal_chars", 32768))
    if len(goal_text) > max_chars:
        raise ValueError(
            f"Goal text is too long ({len(goal_text)} chars). "
            f"Maximum allowed is {max_chars} chars."
        )


def check_auto_step_count(step_count: int) -> None:
    """Raise ValueError if plan exceeds max_steps_per_auto_run."""
    max_steps = int(_policy.get("max_steps_per_auto_run", 50))
    if step_count > max_steps:
        raise ValueError(
            f"Auto plan has {step_count} steps which exceeds the limit of {max_steps}."
        )


def get_auto_run_timeout() -> int:
    return int(_policy.get("auto_run_timeout_s", 600))


def get_max_reflection_attempts() -> int:
    return int(_policy.get("max_reflection_attempts", 3))


def get_max_interrupt_questions() -> int:
    return int(_policy.get("max_interrupt_questions", 10))


def get_max_tokens_per_run() -> int:
    return int(_policy.get("max_tokens_per_run", 200_000))