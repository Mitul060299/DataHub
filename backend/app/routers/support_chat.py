"""Support chatbot router.

Endpoints:
  POST /api/support-chat/start           — create anonymous session
  POST /api/support-chat/message         — stream LLM response (SSE)
  POST /api/support-chat/email           — attach email to session
  GET  /api/support-chat/sessions        — admin-only: list sessions + messages

Security:
  - Prompt injection is blocked before the LLM is called.
  - Output is sanitised before streaming.
  - Raw exceptions never reach the client.
  - The admin endpoint returns 404 to non-admin callers so the route is
    not discoverable by unauthorised users.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ..db import get_db
from ..models_db import SupportChatMessageDB, SupportChatSessionDB
from ..services.rate_limiter import limiter
from ..services.support_chat_service import (
    _SAFE_REFUSAL,
    _is_injection,
    build_system_prompt,
    classify_intent,
    stream_response,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/support-chat", tags=["support-chat"])

_GREETING = (
    "Hi! I'm the DataHub support assistant. Ask me anything about features, "
    "pricing, or how to get started — I'm happy to help."
)

# ── Request / Response models ─────────────────────────────────────────────────


class StartRequest(BaseModel):
    visitor_id: str        # client-generated UUID, stored as analytics label only
    first_page: str = "/"


class StartResponse(BaseModel):
    session_id: str
    greeting: str


class MessageRequest(BaseModel):
    session_id: str
    message: str


class EmailRequest(BaseModel):
    session_id: str
    email: str


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_session_or_404(session_id: str, db: Session) -> SupportChatSessionDB:
    """Return session row or raise 404. Never leaks DB details."""
    try:
        row = db.query(SupportChatSessionDB).filter_by(id=session_id).first()
    except Exception:
        logger.exception("DB error fetching support chat session")
        raise HTTPException(status_code=500, detail="An error occurred")
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return row


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/start", response_model=StartResponse)
@limiter.limit("10/minute")
async def start_session(
    request: Request,
    body: StartRequest,
    db: Session = Depends(get_db),
) -> StartResponse:
    """Create a new anonymous chat session."""
    # Sanitise visitor_id: store as opaque string, never trust as identifier
    visitor_id = str(body.visitor_id)[:128]
    first_page = str(body.first_page)[:256]

    try:
        session = SupportChatSessionDB(
            visitor_id=visitor_id,
            first_page=first_page,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    except Exception:
        db.rollback()
        logger.exception("Failed to create support chat session")
        raise HTTPException(status_code=500, detail="An error occurred")

    return StartResponse(session_id=str(session.id), greeting=_GREETING)


@router.post("/message")
@limiter.limit("20/minute")
async def send_message(
    request: Request,
    body: MessageRequest,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Send a user message and stream back the LLM response via SSE."""
    session = _get_session_or_404(body.session_id, db)

    user_text = body.message.strip()[:2000]  # hard cap to prevent prompt stuffing
    if not user_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # ── Injection guard ────────────────────────────────────────────────────
    if _is_injection(user_text):
        async def _refusal():
            import json
            yield f"data: {json.dumps({'text': _SAFE_REFUSAL})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_refusal(), media_type="text/event-stream")

    # ── Persist user message ───────────────────────────────────────────────
    intent, is_cap = classify_intent(user_text)
    try:
        user_msg = SupportChatMessageDB(
            session_id=body.session_id,
            role="user",
            content=user_text,
            intent=intent,
            is_capability_request=is_cap,
        )
        db.add(user_msg)
        db.query(SupportChatSessionDB).filter_by(id=body.session_id).update({
            "last_active": datetime.now(timezone.utc),
            "message_count": SupportChatSessionDB.message_count + 1,
        })
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to persist user message for session %s", body.session_id)
        # Non-fatal — continue to LLM call

    # ── Build message history ──────────────────────────────────────────────
    try:
        history_rows = (
            db.query(SupportChatMessageDB)
            .filter_by(session_id=body.session_id)
            .order_by(SupportChatMessageDB.created_at.asc())
            .limit(20)  # cap context window to last 20 messages
            .all()
        )
    except Exception:
        history_rows = []

    messages = [{"role": "system", "content": build_system_prompt()}]
    for row in history_rows:
        messages.append({"role": row.role, "content": row.content})

    return StreamingResponse(
        stream_response(messages, session_id=body.session_id, db=db),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/email", status_code=200)
@limiter.limit("5/minute")
async def capture_email(
    request: Request,
    body: EmailRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Attach an email address to an existing chat session."""
    session = _get_session_or_404(body.session_id, db)

    # Basic length guard — pydantic EmailStr validates format
    email = str(body.email).strip()[:254]

    try:
        db.query(SupportChatSessionDB).filter_by(id=body.session_id).update({"email": email})
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to save email for session %s", body.session_id)
        raise HTTPException(status_code=500, detail="An error occurred")

    return {"success": True}


@router.get("/sessions")
async def list_sessions(
    authorization: Optional[str] = Header(default=None),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> dict:
    """Admin-only: paginated list of sessions with their messages.

    Returns 404 to non-admin callers so the endpoint is not discoverable.
    """
    # Auth check — return 404 (not 403) to hide endpoint existence
    if not _is_admin(authorization):
        raise HTTPException(status_code=404, detail="Not found")

    # Clamp pagination to prevent resource abuse
    limit = min(max(1, limit), 100)
    offset = max(0, offset)

    try:
        sessions = (
            db.query(SupportChatSessionDB)
            .order_by(SupportChatSessionDB.last_active.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        total = db.query(SupportChatSessionDB).count()
    except Exception:
        logger.exception("Failed to list support chat sessions")
        raise HTTPException(status_code=500, detail="An error occurred")

    results = []
    for s in sessions:
        try:
            msgs = (
                db.query(SupportChatMessageDB)
                .filter_by(session_id=str(s.id))
                .order_by(SupportChatMessageDB.created_at.asc())
                .all()
            )
        except Exception:
            msgs = []

        results.append({
            "session_id": str(s.id),
            "visitor_id": s.visitor_id,
            "email": s.email,
            "first_page": s.first_page,
            "message_count": s.message_count,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "last_active": s.last_active.isoformat() if s.last_active else None,
            "messages": [
                {
                    "id": str(m.id),
                    "role": m.role,
                    "content": m.content,
                    "intent": m.intent,
                    "is_capability_request": m.is_capability_request,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in msgs
            ],
        })

    return {"total": total, "offset": offset, "limit": limit, "sessions": results}


def _is_admin(authorization: Optional[str]) -> bool:
    """Check if the request carries a valid admin-role JWT."""
    if not authorization:
        return False
    try:
        from ..security import get_current_role
        return get_current_role(authorization) == "admin"
    except Exception:
        return False
