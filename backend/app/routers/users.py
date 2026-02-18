from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
import uuid
from ..db import get_db
from ..models import UserCreate, UserOut, UserProfileOut, UserUsage
from ..models_db import User, DatasetMetaDB, ImportTableDB
from ..security import get_current_role, get_current_subject, get_current_user_id, require_role

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/debug/jwks")
def debug_jwks() -> dict:
    """Debug endpoint to check JWKS fetching"""
    import httpx
    from ..config import settings
    
    try:
        if not settings.supabase_url:
            return {"error": "SUPABASE_URL not configured"}
        
        jwks_url = settings.supabase_url.rstrip("/") + "/auth/v1/keys"
        print(f"Testing JWKS fetch from: {jwks_url}")
        
        response = httpx.get(jwks_url, timeout=10.0)
        print(f"Response status: {response.status_code}")
        response.raise_for_status()
        jwks = response.json()
        
        return {
            "success": True,
            "jwks_url": jwks_url,
            "keys_count": len(jwks.get("keys", [])),
            "key_ids": [key.get("kid") for key in jwks.get("keys", [])],
            "your_kid": "47e89e81-5372-4086-b372-06cadcb765fe"
        }
    except Exception as e:
        return {
            "error": str(e),
            "type": type(e).__name__,
            "jwks_url": settings.supabase_url.rstrip("/") + "/auth/v1/keys" if settings.supabase_url else "N/A"
        }


@router.get("/debug/auth")
def debug_auth(
    authorization: str | None = Header(default=None),
) -> dict:
    """Debug endpoint to check authentication parsing"""
    from ..security import get_current_subject, get_current_role, get_current_user_id
    from ..config import settings
    
    return {
        "has_auth_header": authorization is not None,
        "auth_header_preview": authorization[:50] + "..." if authorization and len(authorization) > 50 else authorization,
        "subject": get_current_subject(authorization),
        "role": get_current_role(authorization),
        "user_id": get_current_user_id(authorization),
        "config": {
            "supabase_url_set": bool(settings.supabase_url),
            "supabase_jwt_secret_set": bool(settings.supabase_jwt_secret),
            "supabase_jwt_audience": settings.supabase_jwt_audience,
        }
    }


@router.post("/", response_model=UserOut)
def create_user(
    payload: UserCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> UserOut:
    role = get_current_role(authorization)
    require_role("admin", role)
    user = User(id=str(uuid.uuid4()), username=payload.username, role=payload.role, plan=payload.plan)
    db.add(user)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="User already exists")
    db.refresh(user)
    return UserOut(id=user.id, username=user.username, role=user.role, plan=user.plan)


@router.get("/", response_model=list[UserOut])
def list_users(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    role = get_current_role(authorization)
    require_role("admin", role)
    users = db.query(User).all()
    return [UserOut(id=u.id, username=u.username, role=u.role, plan=u.plan) for u in users]


@router.get("/me", response_model=UserProfileOut)
def get_me(
    authorization: str | None = Header(default=None),
    workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> UserProfileOut:
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized - no subject found")
    role = get_current_role(authorization)
    user_id = get_current_user_id(authorization)
    
    # Try to find user by username (email) first
    user = db.query(User).filter(User.username == subject).first()
    if not user:
        # Create new user with Supabase user ID if available, otherwise use UUID
        user_id_to_use = user_id if user_id else str(uuid.uuid4())
        user = User(id=user_id_to_use, username=subject, role=role, plan="Free")
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except Exception as e:
            # Handle duplicate ID edge case
            db.rollback()
            print(f"Failed to create user with ID {user_id_to_use}: {str(e)}")
            user = User(id=str(uuid.uuid4()), username=subject, role=role, plan="Free")
            db.add(user)
            db.commit()
            db.refresh(user)
    workspace_filter = workspace_id or "default"
    datasets_used = (
        db.query(DatasetMetaDB)
        .filter(DatasetMetaDB.workspace_id == workspace_filter)
        .count()
    )
    storage_used = (
        db.query(ImportTableDB)
        .filter(ImportTableDB.workspace_id == workspace_filter)
        .with_entities(ImportTableDB.size_bytes)
        .all()
    )
    storage_total = sum(row[0] or 0 for row in storage_used)
    usage = UserUsage(
        datasetsUsed=datasets_used,
        storageUsed=storage_total,
        aiMessagesUsed=0,
    )
    return UserProfileOut(
        id=user.id,
        username=user.username,
        role=user.role,
        plan=user.plan,
        usage=usage,
    )
