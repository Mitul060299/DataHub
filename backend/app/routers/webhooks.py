from fastapi import APIRouter, Header
import uuid
from ..models import WebhookRegistration
from ..services.webhooks import webhook_store
from ..security import get_current_role, require_role

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/", response_model=WebhookRegistration)
def register_hook(target_url: str, event: str, authorization: str | None = Header(default=None)) -> WebhookRegistration:
    role = get_current_role(authorization)
    require_role("editor", role)
    hook = WebhookRegistration(hook_id=str(uuid.uuid4()), target_url=target_url, event=event)
    webhook_store.register(hook)
    return hook


@router.get("/", response_model=list[WebhookRegistration])
def list_hooks() -> list[WebhookRegistration]:
    return webhook_store.list()
