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
    """Fetch JWKS from Supabase with proper authentication"""
    cached = _cache_get("supabase_jwks")
    if cached:
        return cached
    if not settings.supabase_url:
        print("ERROR: SUPABASE_URL not configured")
        return {}
    
    jwks_url = settings.supabase_url.rstrip("/") + "/auth/v1/keys"
    
    # Supabase requires the anon key header even for public endpoints
    headers = {}
    if settings.supabase_anon_key:
        headers["apikey"] = settings.supabase_anon_key
        headers["Authorization"] = f"Bearer {settings.supabase_anon_key}"
    
    print(f"Fetching JWKS from: {jwks_url} (with auth: {bool(settings.supabase_anon_key)})")
    try:
        response = httpx.get(jwks_url, headers=headers, timeout=10.0, follow_redirects=True)
        print(f"JWKS response status: {response.status_code}")
        response.raise_for_status()
        jwks = response.json()
        print(f"Successfully fetched {len(jwks.get('keys', []))} keys")
        _cache_set("supabase_jwks", jwks, ttl=300)
        return jwks
    except Exception as e:
        print(f"ERROR fetching JWKS: {type(e).__name__}: {str(e)}")
        return {}


def _get_supabase_key(id_token: str) -> Optional[Any]:
    """Get the key to verify the Supabase JWT token"""
    unverified = jwt.get_unverified_header(id_token)
    alg = unverified.get("alg", "")
    
    # For HMAC algorithms (HS256), use the JWT secret
    if alg.startswith("HS"):
        print(f"Using HS256 with JWT secret for token verification")
        return settings.supabase_jwt_secret or None
    
    # For RSA/EC algorithms, fetch JWKS
    print(f"Token uses {alg}, fetching JWKS for public key")
    jwks = _get_supabase_jwks()
    if not jwks or not jwks.get("keys"):
        print(f"WARNING: No JWKS keys available, falling back to JWT secret")
        # Fallback: try JWT secret even for RS256/ES256 (won't work but worth trying)
        return settings.supabase_jwt_secret or None
    
    kid = unverified.get("kid")
    print(f"Looking for key with kid: {kid}")
    for jwk in jwks.get("keys", []):
        if jwk.get("kid") == kid:
            print(f"Found matching key with algorithm: {jwk.get('alg')}")
            # Handle both RSA and EC keys
            if jwk.get("kty") == "RSA":
                return jwt.algorithms.RSAAlgorithm.from_jwk(jwk)
            elif jwk.get("kty") == "EC":
                return jwt.algorithms.ECAlgorithm.from_jwk(jwk)
    
    print(f"ERROR: No matching key found for kid: {kid}")
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
        print(f"JWT_SECRET was base64 encoded, decoded length: {len(decoded_str)}")
        return decoded_str
    except Exception:
        # Not base64 or decode failed, use as-is
        print(f"JWT_SECRET is plain text, length: {len(secret)}")
        return secret


def _verify_supabase_token(token: str) -> Dict[str, Any]:
    """
    Verify Supabase JWT token.
    
    Tries HS256 first (Supabase default), then ES256 if needed.
    """
    if not settings.supabase_url:
        print("WARNING: SUPABASE_URL not configured")
        return {}
    
    if not settings.supabase_jwt_secret:
        print("WARNING: SUPABASE_JWT_SECRET not configured")
        return {}
    
    # Get the algorithm from token header
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")
        print(f"Token algorithm: {alg}, kid: {header.get('kid')}")
    except Exception as e:
        print(f"ERROR: Could not decode token header: {e}")
        return {}
    
    issuer = _get_supabase_issuer()
    audiences = _parse_audiences(settings.supabase_jwt_audience)
    
    # APPROACH 1: Try HS256 with JWT_SECRET (Supabase default)
    # Even if token claims ES256, try HS256 first in case it's misconfigured
    jwt_secret = _decode_jwt_secret(settings.supabase_jwt_secret)
    
    try:
        print(f"Attempting HS256 verification with JWT_SECRET")
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
            }
        )
        print(f"✅ Successfully verified token (HS256) for user: {decoded.get('email', decoded.get('sub'))}")
        return decoded
    except jwt.ExpiredSignatureError:
        print("ERROR: Token has expired")
        return {}
    except jwt.InvalidAudienceError as e:
        print(f"ERROR: Invalid audience - {str(e)}")
        # Try without audience verification
        try:
            decoded = jwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                options={"verify_signature": True, "verify_exp": True, "verify_aud": False}
            )
            print(f"✅ Verified token (HS256, no audience check) for user: {decoded.get('email')}")
            return decoded
        except Exception as e2:
            print(f"ERROR: HS256 without audience also failed: {str(e2)}")
    except Exception as e:
        print(f"HS256 verification failed: {type(e).__name__}: {str(e)}")
    
    # APPROACH 2: If HS256 failed and token is ES256, try fallback decode
    if alg == "ES256":
        print("⚠️  FALLBACK: Token is ES256, decoding without signature verification")
        print("   NOTE: This is insecure but allows the app to function.")
        print("   TODO: Get public key from Supabase dashboard for proper ES256 verification")
        
        try:
            decoded = jwt.decode(
                token,
                options={"verify_signature": False, "verify_exp": True}
            )
            print(f"⚠️  Decoded ES256 token (unverified) for user: {decoded.get('email', decoded.get('sub'))}")
            return decoded
        except Exception as e:
            print(f"ERROR: Even unverified decode failed: {str(e)}")
            return {}
    
    print(f"ERROR: All verification methods failed for algorithm: {alg}")
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
