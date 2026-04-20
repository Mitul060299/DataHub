from __future__ import annotations

import hmac
import hashlib
from typing import Optional
from ..config import settings


def sign_token(token: str) -> Optional[str]:
    if not settings.share_signing_secret:
        return None
    digest = hmac.new(
        settings.share_signing_secret.encode("utf-8"),
        msg=token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return digest


def verify_token(token: str, signature: str | None) -> bool:
    if not settings.share_signing_secret:
        # Fail closed: if no secret is configured, all signature checks fail.
        # This prevents share links from being universally accessible when the
        # operator forgets to set SHARE_SIGNING_SECRET.
        return False
    if not signature:
        return False
    expected = sign_token(token)
    if not expected:
        return False
    return hmac.compare_digest(expected, signature)
