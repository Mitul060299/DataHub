"""Email notification service powered by Resend.

Usage
-----
>>> from app.services.email_service import send_email, send_pipeline_complete, send_usage_warning
>>> send_email(to="user@example.com", subject="Hello", html="<p>Hello</p>")

All functions are safe to call from background tasks — they never raise; errors
are silently swallowed so email failures never break the main request flow.
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, html: str, text: Optional[str] = None) -> bool:
    """Send a transactional email via Resend.

    Returns True on success, False on failure (never raises).
    """
    from ..config import settings

    api_key = settings.resend_api_key
    if not api_key:
        logger.debug("RESEND_API_KEY not set — skipping email to %s", to)
        return False

    try:
        import resend  # type: ignore

        resend.api_key = api_key
        params: dict = {
            "from": settings.email_from_address,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if text:
            params["text"] = text
        resend.Emails.send(params)
        logger.info("Email sent to %s subject=%r", to, subject)
        return True
    except Exception as exc:
        logger.warning("Failed to send email to %s: %s", to, exc)
        return False


# ── Named notification templates ──────────────────────────────────────────────

def send_pipeline_complete(
    to: str,
    pipeline_name: str,
    pipeline_id: str,
    status: str = "completed",
    output_rows: Optional[int] = None,
    app_url: str = "https://datahub.org.in",
) -> bool:
    """Notify the user that a pipeline run has finished."""
    status_colour = "#22b573" if status == "completed" else "#c94040"
    rows_line = f"<p style='color:#8888a0;font-size:13px;'>Output rows: <strong style='color:#e8e8f0'>{output_rows:,}</strong></p>" if output_rows is not None else ""
    html = f"""
<!DOCTYPE html>
<html>
<body style="background:#0a0a0c;color:#e8e8f0;font-family:Inter,sans-serif;padding:32px;">
  <div style="max-width:520px;margin:0 auto;">
    <h2 style="color:#5B6AF0;margin-bottom:8px;">DataHub</h2>
    <h3 style="margin-bottom:4px;">Pipeline <span style="color:{status_colour}">{status.capitalize()}</span></h3>
    <p style="color:#c8c8d8;font-size:14px;">Your pipeline <strong>{pipeline_name}</strong> has {status}.</p>
    {rows_line}
    <a href="{app_url}/home"
       style="display:inline-block;margin-top:16px;background:#5B6AF0;color:#fff;text-decoration:none;
              padding:10px 20px;border-radius:7px;font-size:13px;font-weight:600;">
      Open DataHub
    </a>
    <p style="color:#44445a;font-size:11px;margin-top:24px;">
      Pipeline ID: {pipeline_id}
    </p>
  </div>
</body>
</html>"""
    return send_email(
        to=to,
        subject=f"DataHub — Pipeline '{pipeline_name}' {status}",
        html=html,
    )


def send_usage_warning(
    to: str,
    username: str,
    field: str,
    used: int,
    cap: int,
    plan: str,
    app_url: str = "https://datahub.org.in",
) -> bool:
    """Warn the user they are approaching their plan limit (≥80 %)."""
    pct = int(min(100, used / cap * 100)) if cap > 0 else 100
    field_label = {
        "api_calls": "AI Chat Calls",
        "pipeline_runs": "Pipeline Runs",
        "datasets_uploaded": "Dataset Uploads",
        "storage_bytes_used": "Storage",
    }.get(field, field)
    html = f"""
<!DOCTYPE html>
<html>
<body style="background:#0a0a0c;color:#e8e8f0;font-family:Inter,sans-serif;padding:32px;">
  <div style="max-width:520px;margin:0 auto;">
    <h2 style="color:#5B6AF0;margin-bottom:8px;">DataHub</h2>
    <h3 style="margin-bottom:4px;color:#e8a020;">Usage Warning</h3>
    <p style="color:#c8c8d8;font-size:14px;">
      Hi {username}, you have used <strong>{pct}%</strong> of your monthly
      <strong>{field_label}</strong> allowance on the <strong>{plan}</strong> plan
      ({used:,} / {cap:,}).
    </p>
    <p style="color:#8888a0;font-size:13px;">
      Consider upgrading your plan to avoid service interruptions.
    </p>
    <a href="{app_url}/pricing"
       style="display:inline-block;margin-top:16px;background:#5B6AF0;color:#fff;text-decoration:none;
              padding:10px 20px;border-radius:7px;font-size:13px;font-weight:600;">
      View Plans
    </a>
  </div>
</body>
</html>"""
    return send_email(
        to=to,
        subject=f"DataHub — You've used {pct}% of your {field_label} allowance",
        html=html,
    )
