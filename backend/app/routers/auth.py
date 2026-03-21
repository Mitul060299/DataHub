from fastapi import APIRouter, HTTPException, Header, Depends, Request
import uuid
from ..security import create_access_token
from ..db import get_db
from sqlalchemy.orm import Session
from ..services.plan_guard import resolve_user_plan, enforce_sso
from ..services.oidc import build_auth_url, exchange_code, fetch_userinfo, verify_id_token
from ..config import settings
from ..models import AuthToken, AuditEntry
from ..services.audit import audit_store
from ..services.rate_limiter import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthToken)
@limiter.limit("10/minute")
def login(request: Request, username: str) -> AuthToken:
    token_data = create_access_token(username, role="viewer")
    try:
        audit_store.add(AuditEntry(
            action="auth.login",
            actor=username,
            target=f"auth:{username}",
            metadata={"ip": request.client.host if request.client else "unknown"},
        ))
    except Exception:
        pass
    return AuthToken(**token_data)


@router.get("/oidc/login")
def oidc_login(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    if not settings.oidc_issuer or not settings.oidc_client_id or not settings.oidc_redirect_uri:
        raise HTTPException(status_code=400, detail="OIDC is not configured")
    user_plan = resolve_user_plan(db, authorization)
    enforce_sso(user_plan)
    state = str(uuid.uuid4())
    url = build_auth_url(state)
    if not url:
        raise HTTPException(status_code=400, detail="OIDC discovery failed")
    return {"auth_url": url, "state": state}


@router.get("/sso/status")
def sso_status(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user_plan = resolve_user_plan(db, authorization)
    return {
        "enabled": user_plan in {"Business", "Enterprise"},
        "plan": user_plan,
        "providers": ["google", "azure-ad", "okta"] if user_plan in {"Business", "Enterprise"} else [],
    }


@router.get("/oidc/callback", response_model=AuthToken)
def oidc_callback(code: str) -> AuthToken:
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")
    token_data = exchange_code(code)
    id_token = token_data.get("id_token")
    access_token = token_data.get("access_token")
    claims = verify_id_token(id_token) if id_token else {}
    if not claims and access_token:
        claims = fetch_userinfo(access_token)
    subject = claims.get("email") or claims.get("preferred_username") or claims.get("sub")
    if not subject:
        raise HTTPException(status_code=400, detail="OIDC subject not found")
    app_token = create_access_token(subject, role="viewer")
    return AuthToken(**app_token)
