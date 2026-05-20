from fastapi import APIRouter, HTTPException, Header, Depends, Request
import logging
import uuid
import httpx
from pydantic import BaseModel, Field
from sqlalchemy import text as sql_text
from ..security import (
    create_access_token,
    _verify_supabase_token,
    _verify_app_token,
    _is_jwt,
)
from ..db import get_db
from sqlalchemy.orm import Session
from ..services.plan_guard import resolve_user_plan, enforce_sso
from ..services.oidc import build_auth_url, exchange_code, fetch_userinfo, verify_id_token, register_state, consume_state
from ..config import settings
from ..models import AuthToken, AuditEntry
from ..models_db import User
from ..services.audit import audit_store
from ..services.rate_limiter import limiter
from ..dependencies import get_current_user, CurrentUser

ANON_USERNAME_PREFIX = "anon_"

# Tables that carry a user_id column (string FK by convention, no DB constraint).
# When an anonymous user signs up we re-point all their rows to the new account.
_USER_ID_TABLES: tuple[str, ...] = (
    "projects",
    "user_usage",
    "dataset_meta",
    "dataset_sessions",
    "connector_credentials",
    "import_tables",
    "import_connections",
    "organization_members",
    "project_members",
)

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
    # Fire-and-forget welcome email (T+0, best-effort)
    try:
        from ..services.email_service import send_welcome_email
        send_welcome_email(to=current_user.email, username=body.name or None)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Welcome email failed for %s: %s", current_user.email, exc)
    return {"ok": True}


# ── Anonymous account flow ────────────────────────────────────────────────────
#
# Lets first-time visitors use the full product without signing up.  We mint a
# real User row whose username is `anon_<uuid>` and issue an app-signed JWT.
# When the visitor later signs up via Supabase we re-point all of their data
# rows from the anon user_id to their real Supabase user_id (see /claim).

class AnonymousResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    is_anonymous: bool = True


@router.post("/anonymous", response_model=AnonymousResponse)
@limiter.limit("120/minute")
def create_anonymous_account(
    request: Request,
    db: Session = Depends(get_db),
) -> AnonymousResponse:
    """Mint a fresh anonymous account + JWT.  No email, no password."""
    anon_id = f"{ANON_USERNAME_PREFIX}{uuid.uuid4().hex}"
    user = User(
        id=anon_id,
        username=anon_id,
        role="editor",   # anon users need to be able to create projects/upload
        plan="Free",
    )
    db.add(user)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create anonymous account")

    token = create_access_token(anon_id, role="editor", expires_minutes=60 * 24 * 30)  # 30 days
    try:
        audit_store.add(AuditEntry(
            action="auth.anonymous_created",
            actor=anon_id,
            target=f"user:{anon_id}",
            metadata={"ip": request.client.host if request.client else "unknown"},
        ))
    except Exception:
        pass
    return AnonymousResponse(access_token=token["access_token"], user_id=anon_id)


class ClaimRequest(BaseModel):
    supabase_token: str = Field(..., min_length=20)
    name: str | None = None


@router.post("/claim")
@limiter.limit("10/minute")
def claim_anonymous_account(
    request: Request,
    body: ClaimRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """
    Migrate an anonymous user's data to a freshly-created Supabase account.

    Bearer token in `Authorization` header  = the anonymous user's JWT.
    `supabase_token` in body                = the JWT issued by Supabase signup.

    On success every row owned by `anon_<uuid>` is re-pointed to the Supabase
    user_id and the anonymous user record is replaced.  The Supabase token is
    what the frontend must use from then on.
    """
    # 1. Verify the anonymous bearer
    if not authorization or " " not in authorization:
        raise HTTPException(status_code=401, detail="Missing anonymous bearer token")
    scheme, token = authorization.split(" ", 1)
    if scheme.lower() != "bearer" or not _is_jwt(token):
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    anon_claims = _verify_app_token(token) or {}
    anon_id = anon_claims.get("sub")
    if not anon_id or not anon_id.startswith(ANON_USERNAME_PREFIX):
        raise HTTPException(status_code=400, detail="Bearer token is not an anonymous token")

    # 2. Verify the supabase token
    sb_claims = _verify_supabase_token(body.supabase_token) or {}
    sb_id = sb_claims.get("sub")
    sb_email = sb_claims.get("email") or sb_claims.get("preferred_username")
    if not sb_id or not sb_email:
        raise HTTPException(status_code=400, detail="Invalid Supabase token")

    # 3. Locate the anon user row
    anon_user = db.query(User).filter(User.id == anon_id).first()
    if not anon_user:
        # Nothing to migrate — Supabase user will be auto-created on next request.
        return {"ok": True, "migrated": False, "user_id": sb_id}

    # 4. Existing Supabase user?  If so, just delete the anon row (no merge).
    existing_sb = db.query(User).filter(User.id == sb_id).first()
    if existing_sb:
        try:
            db.delete(anon_user)
            db.commit()
        except Exception:
            db.rollback()
        return {"ok": True, "migrated": False, "user_id": sb_id}

    # 5. Repoint every owned row, then swap the User PK.
    try:
        for table in _USER_ID_TABLES:
            db.execute(
                sql_text(f"UPDATE {table} SET user_id = :new WHERE user_id = :old"),
                {"new": sb_id, "old": anon_id},
            )
        # Update the user row itself.  Easiest is delete + insert because PK changes.
        plan = anon_user.plan
        role = anon_user.role
        db.delete(anon_user)
        db.flush()
        new_user = User(
            id=sb_id,
            username=sb_email,
            role=role,
            plan=plan,
            has_completed_onboarding=False,
            has_uploaded_first_file=False,
        )
        db.add(new_user)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.exception("Anonymous claim failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to migrate anonymous account")

    # 6. Brevo + audit
    try:
        _add_to_brevo(sb_email, body.name)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Brevo claim hook failed for %s: %s", sb_email, exc)
    try:
        audit_store.add(AuditEntry(
            action="auth.anonymous_claimed",
            actor=sb_email,
            target=f"user:{sb_id}",
            metadata={"from_anon_id": anon_id},
        ))
    except Exception:
        pass

    return {"ok": True, "migrated": True, "user_id": sb_id}
