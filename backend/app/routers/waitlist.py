from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from ..models_db import WaitlistEntryDB
from ..services.rate_limiter import limiter

router = APIRouter()


class WaitlistRequest(BaseModel):
    email: str
    plan: str  # "professional" | "team" | "business"
    region: str | None = None


@router.post("/waitlist")
@limiter.limit("5/minute")
async def join_waitlist(request: Request, req: WaitlistRequest, db: Session = Depends(get_db)):
    try:
        existing = db.query(WaitlistEntryDB).filter(
            WaitlistEntryDB.email == req.email
        ).first()
        if existing:
            return {"status": "already_registered"}
        entry = WaitlistEntryDB(
            email=req.email,
            plan=req.plan,
            region=req.region or "unknown",
        )
        db.add(entry)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
