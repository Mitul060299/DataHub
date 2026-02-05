from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid
from ..db import get_db
from ..models import UserCreate, UserOut
from ..models_db import User

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", response_model=UserOut)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    user = User(id=str(uuid.uuid4()), username=payload.username, role=payload.role)
    db.add(user)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="User already exists")
    db.refresh(user)
    return UserOut(id=user.id, username=user.username, role=user.role)


@router.get("/", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[UserOut]:
    users = db.query(User).all()
    return [UserOut(id=u.id, username=u.username, role=u.role) for u in users]
