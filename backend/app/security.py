from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import base64
import time
import httpx
import jwt
from .config import settings
from fastapi import Header, HTTPException



_JWKS_CACHE: Dict[str, Any] = {}
_JWKS_EXPIRES: Dict[str, float] = {}


def _cache_get(key: str) -> Optional[Any]:
    expires = _JWKS_EXPIRES.get(key)
    if expires and expires > time.time():
        return _JWKS_CACHE.get(key)
    return None


def _cache_set(key: str, value: Any, ttl: int = 300) -> None:
    _JWKS_CACHE[key] = value
    _JWKS_EXPIRES[key] = time.time() + ttl


def _is_jwt(token: str) -> bool:
    return token.count(".") == 2


def _get_supabase_issuer() -> str:
    if not settings.supabase_url:
        return ""
    return settings.supabase_url.rstrip("/") + "/auth/v1"


def _get_supabase_jwks() -> Dict[str, Any]:
    cached = _cache_get("supabase_jwks")
    if cached:
        return cached
    if not settings.supabase_url:
        return {}
    jwks_url = settings.supabase_url.rstrip("/") + "/auth/v1/keys"
    response = httpx.get(jwks_url, timeout=10.0)
    response.raise_for_status()
    jwks = response.json()
    _cache_set("supabase_jwks", jwks, ttl=300)
    return jwks


def _get_supabase_key(id_token: str) -> Optional[Any]:
    unverified = jwt.get_unverified_header(id_token)
    alg = unverified.get("alg", "")
    if alg.startswith("HS"):
        return settings.supabase_jwt_secret or None
    jwks = _get_supabase_jwks()
    kid = unverified.get("kid")
    for jwk in jwks.get("keys", []):
        if jwk.get("kid") == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(jwk)
    return None


def _parse_audiences(value: str) -> list[str]:
    return [aud.strip() for aud in value.split(",") if aud.strip()]


def _verify_supabase_token(token: str) -> Dict[str, Any]:
    if not settings.supabase_url:
        return {}
    key = _get_supabase_key(token)
    if not key:
        return {}
    issuer = _get_supabase_issuer()
    audiences = _parse_audiences(settings.supabase_jwt_audience)
    options = {"verify_exp": True}
    if not audiences:
        options["verify_aud"] = False
    try:
        return jwt.decode(
            token,
            key=key,
            algorithms=[jwt.get_unverified_header(token).get("alg", "RS256")],
            issuer=issuer or None,
            audience=audiences or None,
            options=options,
        )
    except Exception:
        return {}


def _map_supabase_role(claims: Dict[str, Any]) -> str:
    raw_role = None
    if isinstance(claims.get("app_metadata"), dict):
        raw_role = claims["app_metadata"].get("role")
    if not raw_role and isinstance(claims.get("user_metadata"), dict):
        raw_role = claims["user_metadata"].get("role")
    if not raw_role:
        raw_role = claims.get("role")
    if not raw_role:
        return "viewer"
    normalized = str(raw_role).lower()
    if normalized in {"service_role", "supabase_admin", "admin"}:
        return "admin"
    if normalized in {"editor", "writer"}:
        return "editor"
    return "viewer"


def _verify_app_token(token: str) -> Dict[str, Any]:
    if not settings.app_secret_key:
        return {}
    try:
        return jwt.decode(
            token,
            settings.app_secret_key,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
    except Exception:
        return {}


def create_access_token(subject: str, role: str = "viewer", expires_minutes: int = 60) -> Dict[str, str]:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    token = jwt.encode(payload, settings.app_secret_key, algorithm="HS256")
    return {"access_token": token, "token_type": "bearer"}


def get_current_role(authorization: str | None = Header(default=None)) -> str:
    if not authorization:
        return "viewer"
    try:
        scheme, token = authorization.split(" ")
        if scheme.lower() != "bearer":
            return "viewer"
        if _is_jwt(token):
            claims = _verify_supabase_token(token)
            if not claims:
                claims = _verify_app_token(token)
            if claims:
                return _map_supabase_role(claims)
        decoded = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        parts = decoded.split("|")
        return parts[1] if len(parts) > 2 else "viewer"
    except Exception:
        return "viewer"


def require_role(required: str, role: str) -> None:
    allowed = {"viewer": 1, "editor": 2, "admin": 3}
    if allowed.get(role, 1) < allowed.get(required, 1):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
