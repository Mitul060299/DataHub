from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import base64
import hashlib
import json
import logging
import time
import httpx
import jwt
from .config import settings
from fastapi import Header, HTTPException


# ── Connector credential encryption (Fernet / AES-128-CBC) ──────────────────

def _get_fernet():
    """Return a Fernet instance derived from CONNECTOR_ENCRYPTION_KEY (or APP_SECRET_KEY)."""
    from cryptography.fernet import Fernet
    key_str = settings.connector_encryption_key or settings.app_secret_key
    # Derive a stable 32-byte key, then base64url-encode for Fernet
    key_bytes = hashlib.sha256(key_str.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


def encrypt_connector_config(config: dict) -> str:
    """Encrypt a connector config dict to a URL-safe string."""
    plaintext = json.dumps(config, separators=(",", ":")).encode()
    return _get_fernet().encrypt(plaintext).decode()


def decrypt_connector_config(encrypted: str) -> dict:
    """Decrypt a connector config string back to a dict."""
    plaintext = _get_fernet().decrypt(encrypted.encode())
    return json.loads(plaintext.decode())



logger = logging.getLogger(__name__)


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
    """Fetch JWKS from Supabase with proper authentication"""
    cached = _cache_get("supabase_jwks")
    if cached:
        return cached
    if not settings.supabase_url:
        logger.error("SUPABASE_URL not configured")
        return {}
    
    jwks_url = settings.supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json"
    
    # Supabase requires the anon key header even for public endpoints
    headers = {}
    if settings.supabase_anon_key:
        headers["apikey"] = settings.supabase_anon_key
        headers["Authorization"] = f"Bearer {settings.supabase_anon_key}"
    
    logger.debug("Fetching JWKS from: %s (with auth: %s)", jwks_url, bool(settings.supabase_anon_key))
    try:
        response = httpx.get(jwks_url, headers=headers, timeout=10.0, follow_redirects=True)
        logger.debug("JWKS response status: %s", response.status_code)
        response.raise_for_status()
        jwks = response.json()
        logger.debug("Successfully fetched %s keys", len(jwks.get('keys', [])))
        _cache_set("supabase_jwks", jwks, ttl=300)
        return jwks
    except Exception as e:
        logger.error("ERROR fetching JWKS: %s: %s", type(e).__name__, str(e))
        return {}


def _get_supabase_key(id_token: str) -> Optional[Any]:
    """Get the key to verify the Supabase JWT token"""
    unverified = jwt.get_unverified_header(id_token)
    alg = unverified.get("alg", "")
    
    # For HMAC algorithms (HS256), use the JWT secret
    if alg.startswith("HS"):
        logger.debug("Using HS256 with JWT secret for token verification")
        if not settings.supabase_jwt_secret:
            return None
        return _decode_jwt_secret(settings.supabase_jwt_secret)
    
    # For RSA/EC algorithms, fetch JWKS
    logger.debug("Token uses %s, fetching JWKS for public key", alg)
    jwks = _get_supabase_jwks()
    if not jwks or not jwks.get("keys"):
        logger.warning("No JWKS keys available, falling back to JWT secret")
        # Fallback: try JWT secret even for RS256/ES256 (won't work but worth trying)
        return settings.supabase_jwt_secret or None
    
    kid = unverified.get("kid")
    logger.debug("Looking for key with kid: %s", kid)
    for jwk in jwks.get("keys", []):
        if jwk.get("kid") == kid:
            logger.debug("Found matching key with algorithm: %s", jwk.get('alg'))
            # Handle both RSA and EC keys
            if jwk.get("kty") == "RSA":
                return jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
            elif jwk.get("kty") == "EC":
                return jwt.algorithms.ECAlgorithm.from_jwk(json.dumps(jwk))
    
    logger.error("No matching key found for kid: %s", kid)
    return None


def _parse_audiences(value: str) -> list[str]:
    return [aud.strip() for aud in value.split(",") if aud.strip()]


def _decode_jwt_secret(secret: str) -> str:
    """Try to decode JWT secret if it's base64 encoded, otherwise return as-is"""
    if not secret:
        return secret
    
    try:
        # Try base64 decoding
        decoded_bytes = base64.b64decode(secret)
        decoded_str = decoded_bytes.decode('utf-8')
        logger.debug("JWT_SECRET was base64 encoded, decoded length: %s", len(decoded_str))
        return decoded_str
    except Exception:
        # Not base64 or decode failed, use as-is
        logger.debug("JWT_SECRET is plain text, length: %s", len(secret))
        return secret


def _verify_supabase_token(token: str) -> Dict[str, Any]:
    """
    Verify Supabase JWT token.
    
    Tries HS256 first (Supabase default), then ES256 if needed.
    """
    if not settings.supabase_url:
        logger.warning("SUPABASE_URL not configured")
        return {}
    
    # Get the algorithm from token header
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")
        logger.debug("Token algorithm: %s, kid: %s", alg, header.get('kid'))
    except Exception as e:
        logger.error("Could not decode token header: %s", e)
        return {}
    
    issuer = _get_supabase_issuer()
    audiences = _parse_audiences(settings.supabase_jwt_audience)

    verification_key = _get_supabase_key(token)
    if not verification_key:
        logger.error("Could not resolve verification key for algorithm %s", alg)
    else:
        try:
            logger.debug("Attempting %s verification with resolved key", alg)
            decoded = jwt.decode(
                token,
                verification_key,
                algorithms=[alg],
                audience=audiences if audiences else None,
                issuer=issuer if issuer else None,
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_aud": bool(audiences),
                    "verify_iss": bool(issuer),
                },
            )
            logger.debug("Successfully verified token (%s) for user: %s", alg, decoded.get('email', decoded.get('sub')))
            return decoded
        except jwt.ExpiredSignatureError:
            logger.warning("Token has expired")
            return {}
        except jwt.InvalidAudienceError as e:
            # Reject outright — retrying with audience checks disabled would allow
            # tokens issued for a different service to be accepted here.
            logger.warning("Token audience mismatch — rejecting: %s", str(e))
            return {}
        except Exception as e:
            logger.warning("%s verification failed: %s: %s", alg, type(e).__name__, str(e))

    if alg != "HS256" and settings.supabase_jwt_secret:
        jwt_secret = _decode_jwt_secret(settings.supabase_jwt_secret)
        try:
            logger.debug("Attempting HS256 verification fallback with JWT_SECRET")
            decoded = jwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                audience=audiences if audiences else None,
                issuer=issuer if issuer else None,
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_aud": bool(audiences),
                    "verify_iss": bool(issuer),
                },
            )
            logger.debug("Successfully verified token (HS256 fallback) for user: %s", decoded.get('email', decoded.get('sub')))
            return decoded
        except Exception as e:
            logger.debug("HS256 fallback failed: %s: %s", type(e).__name__, str(e))

    logger.error("All verification methods failed for algorithm: %s", alg)
    return {}


def _map_supabase_role(claims: Dict[str, Any]) -> str:
    raw_role = None
    if isinstance(claims.get("app_metadata"), dict):
        raw_role = claims["app_metadata"].get("role")
    if not raw_role and isinstance(claims.get("user_metadata"), dict):
        raw_role = claims["user_metadata"].get("role")
    # NOTE: claims.get("role") is intentionally NOT checked here.
    # Supabase always injects role="authenticated" (a PostgreSQL role) as a
    # top-level JWT claim on every token.  Reading it would make raw_role
    # truthy for every user, bypassing the "admin" default below and causing
    # every authenticated user to be treated as "viewer".
    if not raw_role:
        # Any valid authenticated Supabase user is treated as admin of their
        # own account.  Explicit demotion (viewer/editor) must be set in
        # app_metadata or user_metadata to restrict a specific user.
        return "admin"
    normalized = str(raw_role).lower()
    if normalized in {"service_role", "supabase_admin", "admin", "authenticated"}:
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


def _decode_jwt_unverified(token: str) -> Dict[str, Any]:
    try:
        decoded = jwt.decode(
            token,
            options={
                "verify_signature": False,
                "verify_exp": True,
                "verify_aud": False,
                "verify_iss": False,
            },
        )
        return decoded if isinstance(decoded, dict) else {}
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


def get_current_subject(authorization: str | None = Header(default=None)) -> Optional[str]:
    if not authorization:
        return None
    try:
        scheme, token = authorization.split(" ")
        if scheme.lower() != "bearer":
            return None
        if _is_jwt(token):
            claims = _verify_supabase_token(token)
            if not claims:
                claims = _verify_app_token(token)
            if claims:
                return (
                    claims.get("email")
                    or claims.get("preferred_username")
                    or claims.get("sub")
                )
        decoded = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        parts = decoded.split("|")
        return parts[0] if parts else None
    except Exception:
        return None


def get_current_user_id(authorization: str | None = Header(default=None)) -> Optional[str]:
    """Extract the user ID (sub claim) from JWT token for database primary key"""
    if not authorization:
        return None
    try:
        scheme, token = authorization.split(" ")
        if scheme.lower() != "bearer":
            return None
        if _is_jwt(token):
            claims = _verify_supabase_token(token)
            if not claims:
                claims = _verify_app_token(token)
            if claims:
                return claims.get("sub")
        return None
    except Exception:
        return None


def require_role(required: str, role: str) -> None:
    allowed = {"viewer": 1, "editor": 2, "admin": 3}
    if allowed.get(role, 1) < allowed.get(required, 1):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
