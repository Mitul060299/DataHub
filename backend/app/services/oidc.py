from __future__ import annotations

from typing import Any, Dict, Optional
import time
import httpx
import jwt

from ..config import settings

_CACHE: Dict[str, Any] = {}
_CACHE_EXPIRES: Dict[str, float] = {}

# Server-side OIDC state store — prevents CSRF on the OIDC callback.
# States expire after 10 minutes (more than enough for any real OIDC flow).
_PENDING_STATES: Dict[str, float] = {}
_STATE_TTL_SECONDS = 600  # 10 minutes


def register_state(state: str) -> None:
    """Record a state token before redirecting to the IdP."""
    # Prune expired entries to avoid unbounded growth
    now = time.time()
    expired = [k for k, v in _PENDING_STATES.items() if v < now]
    for k in expired:
        del _PENDING_STATES[k]
    _PENDING_STATES[state] = now + _STATE_TTL_SECONDS


def consume_state(state: str) -> bool:
    """Return True and remove the state if it is valid and unexpired, else False."""
    expiry = _PENDING_STATES.pop(state, None)
    if expiry is None:
        return False
    return time.time() < expiry


def _cache_get(key: str) -> Optional[Any]:
    expires = _CACHE_EXPIRES.get(key)
    if expires and expires > time.time():
        return _CACHE.get(key)
    return None


def _cache_set(key: str, value: Any, ttl: int = 300) -> None:
    _CACHE[key] = value
    _CACHE_EXPIRES[key] = time.time() + ttl


def get_discovery() -> Dict[str, Any]:
    cached = _cache_get("discovery")
    if cached:
        return cached
    if not settings.oidc_issuer:
        return {}
    url = settings.oidc_issuer.rstrip("/") + "/.well-known/openid-configuration"
    response = httpx.get(url, timeout=10.0)
    response.raise_for_status()
    data = response.json()
    _cache_set("discovery", data, ttl=300)
    return data


def get_jwks() -> Dict[str, Any]:
    cached = _cache_get("jwks")
    if cached:
        return cached
    discovery = get_discovery()
    jwks_uri = discovery.get("jwks_uri")
    if not jwks_uri:
        return {}
    response = httpx.get(jwks_uri, timeout=10.0)
    response.raise_for_status()
    jwks = response.json()
    _cache_set("jwks", jwks, ttl=300)
    return jwks


def build_auth_url(state: str) -> str:
    discovery = get_discovery()
    auth_url = discovery.get("authorization_endpoint", "")
    if not auth_url:
        return ""
    params = {
        "response_type": "code",
        "client_id": settings.oidc_client_id,
        "redirect_uri": settings.oidc_redirect_uri,
        "scope": "openid email profile",
        "state": state,
    }
    query = httpx.QueryParams(params)
    return f"{auth_url}?{query}"


def exchange_code(code: str) -> Dict[str, Any]:
    discovery = get_discovery()
    token_url = discovery.get("token_endpoint", "")
    if not token_url:
        raise ValueError("OIDC token endpoint not configured")
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": settings.oidc_client_id,
        "client_secret": settings.oidc_client_secret,
        "redirect_uri": settings.oidc_redirect_uri,
    }
    response = httpx.post(token_url, data=payload, timeout=10.0)
    response.raise_for_status()
    return response.json()


def fetch_userinfo(access_token: str) -> Dict[str, Any]:
    discovery = get_discovery()
    userinfo_url = discovery.get("userinfo_endpoint", "")
    if not userinfo_url:
        return {}
    response = httpx.get(
        userinfo_url,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10.0,
    )
    response.raise_for_status()
    return response.json()


def verify_id_token(id_token: str) -> Dict[str, Any]:
    jwks = get_jwks()
    if not jwks:
        return {}
    unverified = jwt.get_unverified_header(id_token)
    kid = unverified.get("kid")
    key = None
    for jwk in jwks.get("keys", []):
        if jwk.get("kid") == kid:
            key = jwt.algorithms.RSAAlgorithm.from_jwk(jwk)
            break
    if not key:
        return {}
    return jwt.decode(
        id_token,
        key=key,
        algorithms=[unverified.get("alg", "RS256")],
        audience=settings.oidc_client_id,
        options={"verify_exp": True},
    )
