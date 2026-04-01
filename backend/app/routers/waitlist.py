from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..db import SessionLocal
from ..models_db import WaitlistEntryDB

router = APIRouter()


class WaitlistRequest(BaseModel):
    email: str
    plan: str  # "professional" | "team" | "business"
    region: str | None = None


@router.post("/waitlist")
async def join_waitlist(req: WaitlistRequest):
    db = SessionLocal()
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
    finally:
        db.close()
