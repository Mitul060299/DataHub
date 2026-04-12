"""
job_queue.py
============
Phase 4: Upstash QStash background job publisher.

When QSTASH_TOKEN is set, long-running pipeline jobs are published to
QStash instead of executing synchronously in the request thread. QStash
delivers the job payload to POST /api/jobs/worker, where it runs in its
own request lifecycle (separate RAM budget, retries, dead-letter queue).

When QSTASH_TOKEN is absent (local dev / Render Starter), the module
falls back to in-process execution via FastAPI BackgroundTasks — zero
infrastructure changes required.

Trigger condition: enable when pipeline jobs start timing out (>30 s) or
OOM-killing the API under concurrent load.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any

from ..config import settings

logger = logging.getLogger(__name__)

_QSTASH_API = "https://qstash.upstash.io/v2/publish"


def is_enabled() -> bool:
    """Return True when QStash credentials are configured."""
    return bool(settings.qstash_token and settings.api_public_url)


def enqueue_pipeline_job(payload: dict[str, Any]) -> str | None:
    """
    Publish a pipeline job to QStash.

    Returns the QStash message ID on success, or None if QStash is not
    configured (caller should fall back to in-process execution).

    Payload must contain at minimum:
        job_type      — e.g. "agent_pipeline_run"
        dataset_id    — target dataset UUID
        user_id       — requesting user UUID
        session_id    — DuckDB session UUID (if any)
    """
    if not is_enabled():
        return None

    worker_url = f"{settings.api_public_url.rstrip('/')}/api/jobs/worker"

    try:
        import urllib.request as _req
        body = json.dumps(payload).encode()
        request = _req.Request(
            _QSTASH_API + f"/{worker_url}",
            data=body,
            headers={
                "Authorization": f"Bearer {settings.qstash_token}",
                "Content-Type": "application/json",
                "Upstash-Retries": "3",
                "Upstash-Retry-Delay": "10s",
            },
            method="POST",
        )
        with _req.urlopen(request, timeout=10) as resp:
            result = json.loads(resp.read())
            message_id = result.get("messageId") or result.get("message_id", "")
            logger.info("QStash job enqueued: %s (type=%s)", message_id, payload.get("job_type"))
            return message_id
    except Exception as exc:
        logger.warning("QStash publish failed, falling back to in-process: %s", exc)
        return None


def verify_qstash_signature(body: bytes, signature_header: str) -> bool:
    """
    Verify the Upstash-Signature header on incoming worker requests.

    QStash signs every delivery with HMAC-SHA256.  We check both the
    current and next signing keys (key rotation safe).

    Returns True if the signature is valid, False otherwise.
    """
    for key in (settings.qstash_current_signing_key, settings.qstash_next_signing_key):
        if not key:
            continue
        try:
            # QStash sends "v1:<base64-hmac>" or plain base64
            raw_sig = signature_header.removeprefix("v1:")
            import base64
            expected = base64.b64encode(
                hmac.new(key.encode(), body, hashlib.sha256).digest()
            ).decode()
            if hmac.compare_digest(expected, raw_sig):
                return True
        except Exception:
            continue
    return False
