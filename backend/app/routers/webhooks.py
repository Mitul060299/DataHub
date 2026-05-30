from fastapi import APIRouter, Header, Depends, HTTPException
from fastapi.responses import Response
import uuid
import ipaddress
import socket
from urllib.parse import urlparse
from sqlalchemy.orm import Session
from ..models import WebhookRegistration
from ..models_db import WebhookDB
from ..db import get_db
from ..security import get_current_role, get_current_user_id, require_role
from ..services.plan_guard import resolve_user_plan, enforce_webhooks

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

_ALLOWED_SCHEMES = {"https", "http"}
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / AWS metadata
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def _validate_webhook_url(url: str) -> None:
    """Reject localhost, private RFC-1918 addresses, and non-http(s) schemes."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in _ALLOWED_SCHEMES:
            raise ValueError(f"Scheme '{parsed.scheme}' not allowed")
        hostname = parsed.hostname
        if not hostname:
            raise ValueError("Missing hostname")
        try:
            resolved = socket.getaddrinfo(hostname, None)
        except socket.gaierror:
            raise ValueError(f"Cannot resolve hostname: {hostname}")
        for (_family, _type, _proto, _canonname, sockaddr) in resolved:
            ip = ipaddress.ip_address(sockaddr[0])
            if any(ip in net for net in _PRIVATE_NETWORKS):
                raise ValueError(f"Webhook target resolves to a private address: {ip}")
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Invalid webhook URL: {exc}") from exc


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
    try:
        _validate_webhook_url(target_url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    user_id = get_current_user_id(authorization)
    hook_id = str(uuid.uuid4())
    db.add(WebhookDB(id=hook_id, user_id=user_id, target_url=target_url, event=event))
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
    user_id = get_current_user_id(authorization)
    q = db.query(WebhookDB)
    if user_id:
        q = q.filter(WebhookDB.user_id == user_id)
    rows = q.order_by(WebhookDB.created_at.desc()).all()
    return [WebhookRegistration(hook_id=row.id, target_url=row.target_url, event=row.event) for row in rows]


@router.delete("/{hook_id}", status_code=204, response_class=Response)
def delete_hook(
    hook_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Response:
    role = get_current_role(authorization)
    require_role("editor", role)
    user_plan = resolve_user_plan(db, authorization)
    enforce_webhooks(user_plan)
    current_user_id = get_current_user_id(authorization)
    hook = db.query(WebhookDB).filter(WebhookDB.id == hook_id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    if hook.user_id and hook.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this webhook")
    db.delete(hook)
    db.commit()
    return Response(status_code=204)
