from fastapi import APIRouter, Header, Depends
import uuid
from sqlalchemy.orm import Session
from ..models import WebhookRegistration
from ..models_db import WebhookDB
from ..db import get_db
from ..security import get_current_role, require_role
from ..services.plan_guard import resolve_user_plan, enforce_webhooks

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/", response_model=WebhookRegistration)
def register_hook(
    target_url: str,
    event: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> WebhookRegistration:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_plan = resolve_user_plan(db, authorization)
    enforce_webhooks(user_plan)
    hook_id = str(uuid.uuid4())
    db.add(WebhookDB(id=hook_id, target_url=target_url, event=event))
    db.commit()
    return WebhookRegistration(hook_id=hook_id, target_url=target_url, event=event)


@router.get("/", response_model=list[WebhookRegistration])
def list_hooks(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[WebhookRegistration]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_plan = resolve_user_plan(db, authorization)
    enforce_webhooks(user_plan)
    rows = db.query(WebhookDB).order_by(WebhookDB.created_at.desc()).all()
    return [WebhookRegistration(hook_id=row.id, target_url=row.target_url, event=row.event) for row in rows]


@router.delete("/{hook_id}", status_code=204)
def delete_hook(
    hook_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> None:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_plan = resolve_user_plan(db, authorization)
    enforce_webhooks(user_plan)
    hook = db.query(WebhookDB).filter(WebhookDB.id == hook_id).first()
    if not hook:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Webhook not found")
    db.delete(hook)
    db.commit()
