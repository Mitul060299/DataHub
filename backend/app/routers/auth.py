from fastapi import APIRouter, HTTPException, Header, Depends, Request
import logging
import uuid
import httpx
from pydantic import BaseModel
from ..security import create_access_token
from ..db import get_db
from sqlalchemy.orm import Session
from ..services.plan_guard import resolve_user_plan, enforce_sso
from ..services.oidc import build_auth_url, exchange_code, fetch_userinfo, verify_id_token, register_state, consume_state
from ..config import settings
from ..models import AuthToken, AuditEntry
from ..services.audit import audit_store
from ..services.rate_limiter import limiter
from ..dependencies import get_current_user, CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthToken)
@limiter.limit("10/minute")
def login(request: Request, username: str) -> AuthToken:
    # This endpoint is only available in non-production environments.
    # In production, authentication is handled exclusively by Supabase.
    if settings.app_env == "production":
        raise HTTPException(
            status_code=404,
            detail="Not found",
        )
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
    register_state(state)
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
@limiter.limit("20/minute")
def oidc_callback(request: Request, code: str, state: str | None = None) -> AuthToken:
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")
    # Validate state to prevent CSRF attacks on the OIDC flow.
    if state is None or not consume_state(state):
        raise HTTPException(status_code=400, detail="Invalid or expired OIDC state parameter")
    token_data = exchange_code(code)
    id_token = token_data.get("id_token")
    access_token = token_data.get("access_token")
    claims = verify_id_token(id_token) if id_token else {}
    if not claims and access_token:
        claims = fetch_userinfo(access_token)
    subject = claims.get("email") or claims.get("preferred_username") or claims.get("sub")
    if not subject:
        raise HTTPException(status_code=400, detail="OIDC subject not found")
    # Use the role embedded in OIDC claims if present; fall back to "editor" (not viewer)
    # so that SSO users can actually use the product.
    oidc_role = claims.get("datahub_role") or claims.get("role") or "editor"
    app_token = create_access_token(subject, role=oidc_role)
    return AuthToken(**app_token)


# ── Brevo contact helper ───────────────────────────────────────────────────────

def _add_to_brevo(email: str, name: str | None) -> None:
    """
    Add a new user to the 'DataHub Signups' Brevo contact list.
    Called fire-and-forget inside a try/except — never raises.
    """
    if not settings.brevo_api_key or not settings.brevo_list_id:
        return
    payload: dict = {
        "email": email,
        "listIds": [settings.brevo_list_id],
    }
    if name:
        payload["attributes"] = {"FIRSTNAME": name}
    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(
                "https://api.brevo.com/v3/contacts",
                json=payload,
                headers={
                    "api-key": settings.brevo_api_key,
                    "Content-Type": "application/json",
                },
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Brevo contact creation failed for %s: %s", email, exc)


# ── Signup endpoint ────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    name: str | None = None


@router.post("/signup")
@limiter.limit("10/minute")
def signup(
    request: Request,
    body: SignupRequest = SignupRequest(),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    Called by the frontend immediately after a successful Supabase signup.
    Creates the local user record (via the get_current_user dependency) and
    registers the user in the Brevo 'DataHub Signups' contact list.
    """
    try:
        _add_to_brevo(current_user.email, body.name)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Brevo signup hook failed for %s: %s", current_user.email, exc)
    return {"ok": True}
