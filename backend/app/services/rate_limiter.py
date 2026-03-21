"""
rate_limiter.py
===============
Centralised slowapi Limiter instance shared across all routers.

Key function: extract the authenticated user-id (JWT sub) so each user
gets their own counter bucket.  Falls back to client IP for unauthenticated
routes (auth/*, public dashboard share).

Redis (Upstash) is used as the backing store so limits persist across
Render restarts and work correctly when multiple workers are deployed.
"""
from __future__ import annotations

import os
import logging
from typing import Optional

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..config import settings

logger = logging.getLogger(__name__)


def _get_user_or_ip(request: Request) -> str:
    """Return user_id from bearer token, or client IP as fallback."""
    try:
        auth: Optional[str] = request.headers.get("Authorization", "")
        if auth and auth.startswith("Bearer "):
            import jwt  # pyjwt — lazy import to keep module load fast
            token = auth.split(" ", 1)[1]
            # Decode without verification — we only need the sub claim
            # for bucketing.  Actual verification happens in get_current_user.
            payload = jwt.decode(token, options={"verify_signature": False})
            sub = payload.get("sub") or payload.get("user_id")
            if sub:
                return str(sub)
    except Exception:
        pass
    return get_remote_address(request)


# Build storage URI — slowapi uses limits library storage URIs.
# Redis: "redis://..." → "redis+cluster://..." for Upstash
# Use memory as last resort so the app still starts without Redis.
_storage_uri: str = settings.redis_url or "memory://"

limiter = Limiter(
    key_func=_get_user_or_ip,
    storage_uri=_storage_uri,
    # Global default applied to every decorated endpoint
    default_limits=["60/minute"],
)
