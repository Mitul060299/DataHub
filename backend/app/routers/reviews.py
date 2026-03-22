"""Reviews router — public POST to submit, public GET to read approved reviews."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from ..db import get_db
from ..models_db import ReviewDB

router = APIRouter(tags=["reviews"])
logger = logging.getLogger(__name__)


class ReviewRequest(BaseModel):
    name: str
    role: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)
    body: str


class ReviewOut(BaseModel):
    id: str
    name: str
    role: Optional[str]
    rating: int
    body: str

    class Config:
        from_attributes = True


@router.post("/reviews", response_model=dict)
async def submit_review(body: ReviewRequest, db: Session = Depends(get_db)) -> dict:
    name = body.name.strip()
    review_body = body.body.strip()

    if not name or not review_body:
        raise HTTPException(status_code=400, detail="name and body are required")

    review = ReviewDB(
        name=name,
        role=body.role.strip() if body.role else None,
        rating=body.rating,
        body=review_body,
        approved=False,
    )
    try:
        db.add(review)
        db.commit()
        db.refresh(review)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to persist review")
        raise HTTPException(status_code=500, detail="Failed to submit review") from exc

    logger.info("Review submitted by %s (rating=%d)", review.name, review.rating)
    return {"ok": True, "id": str(review.id)}


@router.get("/reviews", response_model=list[ReviewOut])
def get_approved_reviews(db: Session = Depends(get_db)) -> list[ReviewOut]:
    rows = (
        db.query(ReviewDB)
        .filter(ReviewDB.approved == True)  # noqa: E712
        .order_by(ReviewDB.created_at.desc())
        .all()
    )
    return [ReviewOut.from_orm(r) for r in rows]
