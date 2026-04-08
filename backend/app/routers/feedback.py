import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models_db import FeedbackDB
from ..services.rate_limiter import limiter

router = APIRouter(tags=["feedback"])
logger = logging.getLogger(__name__)


class FeedbackRequest(BaseModel):
    name: str
    email: str
    subject: str = ""
    message: str


class FeedbackResponse(BaseModel):
    success: bool
    id: str


@router.post("/feedback", response_model=FeedbackResponse)
@limiter.limit("5/minute")
async def submit_feedback(request: Request, body: FeedbackRequest, db: Session = Depends(get_db)) -> FeedbackResponse:
    name = body.name.strip()
    email = body.email.strip()
    message = body.message.strip()
    subject = body.subject.strip() if body.subject else None

    if not name or not email or not message:
        raise HTTPException(status_code=400, detail="name, email, and message are required")

    feedback = FeedbackDB(
        name=name,
        email=email,
        subject=subject,
        message=message,
    )

    try:
        db.add(feedback)
        db.commit()
        db.refresh(feedback)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to persist feedback")
        raise HTTPException(status_code=500, detail="Failed to submit feedback") from exc

    logger.info("Feedback submitted by %s <%s>", feedback.name, feedback.email)
    return FeedbackResponse(success=True, id=str(feedback.id))
