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