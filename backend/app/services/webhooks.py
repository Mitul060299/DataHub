from typing import Dict, List
from ..models import WebhookRegistration


class WebhookStore:
    def __init__(self) -> None:
        self._hooks: Dict[str, WebhookRegistration] = {}

    def register(self, hook: WebhookRegistration) -> None:
        self._hooks[hook.hook_id] = hook

    def list(self) -> List[WebhookRegistration]:
        return list(self._hooks.values())


webhook_store = WebhookStore()
