from typing import List
import httpx
from ..services.webhooks import webhook_store


def emit_event(event: str, payload: dict) -> List[str]:
    delivered: List[str] = []
    hooks = [hook for hook in webhook_store.list() if hook.event == event]

    for hook in hooks:
        try:
            httpx.post(hook.target_url, json={"event": event, "payload": payload}, timeout=5.0)
            delivered.append(hook.hook_id)
        except Exception:
            continue

    return delivered
