from typing import Any

from ..config import settings
from ..models import AIOperatingControlsOut, AIOperatingControlsUpdate


_default_prompt_starters: dict[str, list[str]] = {
    "viewer": [
        "Summarize key trends in this dataset.",
        "Show the top anomalies worth investigating.",
    ],
    "editor": [
        "Create a clean transformation plan for this dataset.",
        "Suggest quality fixes and show expected impact.",
    ],
    "admin": [
        "Provide a governance-focused quality summary.",
        "Highlight data risks and recommended controls.",
    ],
}


_policy: dict[str, Any] = {
    "enable_durable_memory": bool(settings.ai_controls_enable_durable_memory),
    "max_message_chars": max(10, int(settings.ai_controls_max_message_chars)),
    "max_stream_events": max(1, int(settings.ai_controls_max_stream_events)),
    "allowed_intents": settings.ai_controls_allowed_intents or ["analyze", "transform", "visualize", "general"],
    "prompt_starters": _default_prompt_starters,
}


def get_ai_operating_controls() -> AIOperatingControlsOut:
    return AIOperatingControlsOut(**_policy)


def update_ai_operating_controls(payload: AIOperatingControlsUpdate) -> AIOperatingControlsOut:
    updates = payload.dict(exclude_unset=True)
    if "allowed_intents" in updates and updates["allowed_intents"] is not None:
        updates["allowed_intents"] = [str(intent).strip().lower() for intent in updates["allowed_intents"] if str(intent).strip()]
    if "prompt_starters" in updates and updates["prompt_starters"] is not None:
        normalized: dict[str, list[str]] = {}
        for role, starters in updates["prompt_starters"].items():
            key = str(role).strip().lower()
            normalized[key] = [str(item).strip() for item in starters if str(item).strip()]
        updates["prompt_starters"] = normalized

    _policy.update(updates)
    _policy["max_message_chars"] = max(10, int(_policy["max_message_chars"]))
    _policy["max_stream_events"] = max(1, int(_policy["max_stream_events"]))
    _policy["allowed_intents"] = _policy.get("allowed_intents") or ["general"]
    _policy["prompt_starters"] = _policy.get("prompt_starters") or _default_prompt_starters
    return get_ai_operating_controls()


def classify_intent(message: str) -> str:
    text = (message or "").strip().lower()
    if not text:
        return "general"
    transform_tokens = ["transform", "clean", "dedupe", "normalize", "convert"]
    visualize_tokens = ["chart", "plot", "dashboard", "visual", "graph"]
    analyze_tokens = ["analy", "insight", "summary", "trend", "anomaly", "profile"]
    if any(token in text for token in transform_tokens):
        return "transform"
    if any(token in text for token in visualize_tokens):
        return "visualize"
    if any(token in text for token in analyze_tokens):
        return "analyze"
    return "general"


def get_prompt_starters_for_role(role: str) -> list[str]:
    policy = get_ai_operating_controls()
    key = (role or "viewer").strip().lower()
    starters = (policy.prompt_starters or {}).get(key)
    if starters:
        return starters
    return (policy.prompt_starters or {}).get("viewer", [])