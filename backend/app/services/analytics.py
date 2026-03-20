"""
analytics.py
============
PostHog event tracking — fire-and-forget.
All calls are wrapped in try/except so analytics never blocks the API.
No-ops silently if POSTHOG_API_KEY is not configured.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    try:
        from ..config import settings
        if not settings.posthog_api_key:
            return None
        import posthog
        posthog.api_key = settings.posthog_api_key
        posthog.host = "https://app.posthog.com"
        posthog.disabled = False
        _client = posthog
    except Exception as exc:
        logger.debug("PostHog init failed (non-fatal): %s", exc)
        _client = None
    return _client


def track(user_id: str, event: str, properties: dict[str, Any] | None = None) -> None:
    """Fire-and-forget PostHog capture. Never raises."""
    try:
        client = _get_client()
        if client is None:
            return
        client.capture(user_id, event, properties or {})
    except Exception as exc:
        logger.debug("PostHog track failed (non-fatal): %s", exc)
