from typing import List
import httpx
from ..db import SessionLocal
from ..models_db import WebhookDB
from .analytics import track as _ph_track


def emit_event(event: str, payload: dict) -> List[str]:
    delivered: List[str] = []
    db = SessionLocal()
    try:
        hooks = db.query(WebhookDB).filter(WebhookDB.event == event).all()
        for hook in hooks:
            try:
                httpx.post(hook.target_url, json={"event": event, "payload": payload}, timeout=5.0)
                delivered.append(hook.id)
            except Exception:
                continue
        # Mirror to PostHog for product analytics (no-op if POSTHOG_API_KEY unset).
        # Use payload.user_id when present, otherwise the actor field, else "anonymous".
        try:
            actor = (
                (isinstance(payload, dict) and (payload.get("user_id") or payload.get("actor") or payload.get("owner_id")))
                or "anonymous"
            )
            _ph_track(str(actor), event, payload if isinstance(payload, dict) else {"value": payload})
        except Exception:
            pass
        return delivered
    finally:
        db.close()
