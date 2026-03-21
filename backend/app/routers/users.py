from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
import uuid
from ..db import get_db
from ..models import UserCreate, UserOut, UserProfileOut, UserUsage
from ..models_db import User, DatasetMetaDB, ImportTableDB
from ..security import get_current_role, get_current_subject, get_current_user_id, require_role
from ..services.plan_guard import resolve_user_plan

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/debug/token-inspect")
def debug_token_inspect(
    authorization: str | None = Header(default=None),
) -> dict:
    """Detailed token inspection with raw header/payload decode"""
    import base64
    import json
    
    if not authorization:
        return {"error": "No Authorization header provided"}
    
    try:
        # Extract token from "Bearer <token>"
        token = authorization.split(" ")[1] if " " in authorization else authorization
        
        # Split token into parts
        parts = token.split('.')
        if len(parts) != 3:
            return {"error": f"Invalid token format - has {len(parts)} parts, expected 3"}
        
        header_b64, payload_b64, signature_b64 = parts
        
        # Decode header (add padding if needed)
        header_b64_padded = header_b64 + '=' * (4 - len(header_b64) % 4)
        header_bytes = base64.urlsafe_b64decode(header_b64_padded)
        header = json.loads(header_bytes)
        
        # Decode payload
        payload_b64_padded = payload_b64 + '=' * (4 - len(payload_b64) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_b64_padded)
        payload = json.loads(payload_bytes)
        
        # Determine verification approach
        alg = header.get("alg", "UNKNOWN")
        
        return {
            "success": True,
            "raw_header": header,
            "raw_payload": payload,
            "algorithm": alg,
            "key_id": header.get("kid"),
            "token_type": header.get("typ"),
            "user_id": payload.get("sub"),
            "email": payload.get("email"),
            "audience": payload.get("aud"),
            "issuer": payload.get("iss"),
            "expires_at": payload.get("exp"),
            "issued_at": payload.get("iat"),
            "verification_note": f"Token uses {alg} - {'Use JWT_SECRET with HS256' if alg == 'HS256' else 'Need public key for ' + alg if alg in ['ES256', 'RS256'] else 'Unknown method'}"
        }
    except Exception as e:
        import traceback
        return {
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc()
        }


@router.get("/debug/token-algorithm")
def debug_token_algorithm(
    authorization: str | None = Header(default=None),
) -> dict:
    """Debug endpoint to check what algorithm the JWT token uses"""
    import jwt
    import base64
    import json
    
    if not authorization:
        return {"error": "No Authorization header provided"}
    
    try:
        # Extract token from "Bearer <token>"
        token = authorization.split(" ")[1] if " " in authorization else authorization
        
        # Decode header without verification
        header = jwt.get_unverified_header(token)
        
        # Decode payload without verification to see structure
        payload = jwt.decode(token, options={"verify_signature": False})
        
        # Determine verification approach
        alg = header.get("alg", "UNKNOWN")
        verification_method = ""
        needs_jwks = False
        
        if alg.startswith("HS"):
            verification_method = f"Use SUPABASE_JWT_SECRET directly with {alg}"
            needs_jwks = False
        elif alg.startswith("RS") or alg.startswith("ES"):
            verification_method = f"Need public key from JWKS for {alg}"
            needs_jwks = True
        else:
            verification_method = f"Unknown algorithm: {alg}"
        
        return {
            "success": True,
            "header": header,
            "algorithm": alg,
            "key_id": header.get("kid"),
            "verification_method": verification_method,
            "needs_jwks": needs_jwks,
            "payload_sample": {
                "sub": payload.get("sub"),
                "email": payload.get("email"),
                "role": payload.get("role"),
                "aud": payload.get("aud"),
                "iss": payload.get("iss"),
                "exp": payload.get("exp"),
                "iat": payload.get("iat"),
            }
        }
    except Exception as e:
        return {
            "error": str(e),
            "type": type(e).__name__
        }


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
    effective_plan = resolve_user_plan(db, authorization)
    return UserProfileOut(
        id=user.id,
        username=user.username,
        role=user.role,
        plan=effective_plan,
        usage=usage,
        has_completed_onboarding=getattr(user, "has_completed_onboarding", False) or False,
        has_uploaded_first_file=getattr(user, "has_uploaded_first_file", False) or False,
    )


@router.patch("/me/onboarding")
def update_onboarding(
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user = db.query(User).filter(User.username == subject).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if "completed" in payload:
        user.has_completed_onboarding = bool(payload["completed"])
    if "uploaded_first_file" in payload:
        user.has_uploaded_first_file = bool(payload["uploaded_first_file"])
    db.commit()
    return {
        "has_completed_onboarding": user.has_completed_onboarding,
        "has_uploaded_first_file": user.has_uploaded_first_file,
    }
def update_my_plan(
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    raise HTTPException(
        status_code=403,
        detail="Direct plan updates are disabled. Use billing checkout to change plans.",
    )


@router.get("/me/usage-stats")
def get_my_usage_stats(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return monthly usage counters + plan caps for the current user."""
    from ..services.usage_service import get_usage
    from ..config.plan_limits import get_limits

    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = get_current_user_id(authorization)
    plan = resolve_user_plan(db, authorization)
    usage = get_usage(user_id, db)
    limits = get_limits(plan)
    return {
        "plan": plan,
        "period": usage["period"],
        "usage": {
            "api_calls": usage["api_calls"],
            "pipeline_runs": usage["pipeline_runs"],
            "datasets_uploaded": usage["datasets_uploaded"],
            "storage_bytes_used": usage["storage_bytes_used"],
        },
        "limits": {
            "api_calls_per_month": limits["api_calls_per_month"],
            "pipeline_runs_per_month": limits["pipeline_runs_per_month"],
            "datasets_per_month": limits["datasets_per_month"],
            "storage_bytes": limits["storage_bytes"],
        },
    }
