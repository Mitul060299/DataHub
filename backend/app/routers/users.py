from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
import uuid
from ..db import get_db
from ..models import UserCreate, UserOut
from ..models_db import User
from ..security import get_current_role, require_role

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", response_model=UserOut)
def create_user(
    payload: UserCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> UserOut:
    role = get_current_role(authorization)
    require_role("admin", role)
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
def list_users(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    role = get_current_role(authorization)
    require_role("admin", role)
    users = db.query(User).all()
    return [UserOut(id=u.id, username=u.username, role=u.role) for u in users]
