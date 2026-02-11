from typing import List
import httpx
from ..db import SessionLocal
from ..models_db import WebhookDB


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
        return delivered
    finally:
        db.close()
