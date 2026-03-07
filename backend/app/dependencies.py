from __future__ import annotations

from dataclasses import dataclass
import uuid

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models_db import User
from .security import get_current_role, get_current_subject, get_current_user_id
from .services.plan_guard import normalize_plan


@dataclass
class CurrentUser:
    id: str
    email: str
    role: str
    plan: str


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> CurrentUser:
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")

    role = get_current_role(authorization)
    user_id = get_current_user_id(authorization)

    user = None
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = db.query(User).filter(User.username == subject).first()

    if not user:
        created_id = user_id or str(uuid.uuid4())
        user = User(
            id=created_id,
            username=subject,
            role=role,
            plan="Free",
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except Exception:
            db.rollback()
            raise HTTPException(status_code=500, detail="Failed to initialize user")

    return CurrentUser(
        id=str(user.id),
        email=str(user.username),
        role=str(user.role),
        plan=normalize_plan(user.plan),
    )
