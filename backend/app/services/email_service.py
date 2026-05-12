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
    """Send a transactional email via Brevo (primary) or Resend (fallback).

    Returns True on success, False on failure (never raises).
    """
    import email.utils as _eu
    from ..config import settings

    # -- Brevo transactional API (primary) ------------------------------------
    brevo_key = settings.brevo_api_key
    if brevo_key:
        try:
            import urllib.request
            import json as _json
            import ssl

            raw_from = settings.email_from_address
            from_name, from_addr = _eu.parseaddr(raw_from)
            if not from_addr:
                from_addr = raw_from
                from_name = "DataHub"

            payload = _json.dumps({
                "sender": {"name": from_name or "DataHub", "email": from_addr},
                "to": [{"email": to}],
                "subject": subject,
                "htmlContent": html,
                **({"textContent": text} if text else {}),
            }).encode()

            req = urllib.request.Request(
                "https://api.brevo.com/v3/smtp/email",
                data=payload,
                headers={
                    "api-key": brevo_key,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                method="POST",
            )
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
                if resp.status < 300:
                    logger.info("Brevo: sent to %s subject=%r", to, subject)
                    return True
                body = resp.read().decode()
                logger.warning("Brevo: unexpected status %d for %s: %s", resp.status, to, body)
        except Exception as exc:
            logger.warning("Brevo: failed to send to %s: %s", to, exc)
        return False

    # -- Resend fallback ------------------------------------------------------
    resend_key = settings.resend_api_key
    if not resend_key:
        logger.debug("No email provider configured -- skipping email to %s", to)
        return False

    try:
        import resend  # type: ignore

        resend.api_key = resend_key
        params: dict = {
            "from": settings.email_from_address,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if text:
            params["text"] = text
        resend.Emails.send(params)
        logger.info("Resend: sent to %s subject=%r", to, subject)
        return True
    except Exception as exc:
        logger.warning("Resend: failed to send to %s: %s", to, exc)
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


def send_project_invite(
    to: str,
    inviter_name: str,
    project_name: str,
    accept_url: str,
) -> bool:
    """Send a project-collaboration invite email."""
    html = f"""<!DOCTYPE html>
<html>
<body style="background:#0a0a0c;color:#e8e8f0;font-family:Inter,sans-serif;padding:32px;">
  <div style="max-width:520px;margin:0 auto;">
    <h2 style="color:#5B6AF0;margin-bottom:8px;">DataHub</h2>
    <h3 style="margin-bottom:16px;">You've been invited to join <strong>{project_name}</strong></h3>
    <p style="color:#a0a0a8;margin-bottom:24px;">
      <strong>{inviter_name}</strong> has invited you to collaborate on the
      <strong>{project_name}</strong> project in DataHub.
    </p>
    <a href="{accept_url}"
       style="display:inline-block;background:#5B6AF0;color:#fff;text-decoration:none;
              padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
      Accept Invitation
    </a>
    <p style="color:#55555f;font-size:12px;margin-top:24px;">
      Or copy this link: {accept_url}
    </p>
    <p style="color:#55555f;font-size:12px;">
      This invite expires when revoked by the project owner.
    </p>
  </div>
</body>
</html>"""
    return send_email(
        to=to,
        subject=f"You've been invited to {project_name} on DataHub",
        html=html,
    )


def send_org_invite(
    to: str,
    inviter_name: str,
    org_name: str,
    accept_url: str,
) -> bool:
    """Send an organization (Team-tier) invite email."""
    html = f"""<!DOCTYPE html>
<html>
<body style="background:#0a0a0c;color:#e8e8f0;font-family:Inter,sans-serif;padding:32px;">
  <div style="max-width:520px;margin:0 auto;">
    <h2 style="color:#5B6AF0;margin-bottom:8px;">DataHub</h2>
    <h3 style="margin-bottom:16px;">Join the <strong>{org_name}</strong> team on DataHub</h3>
    <p style="color:#a0a0a8;margin-bottom:24px;">
      <strong>{inviter_name}</strong> has invited you to join their team account
      on DataHub. You'll get your own login and projects, and share the team's
      paid plan and quota.
    </p>
    <a href="{accept_url}"
       style="display:inline-block;background:#5B6AF0;color:#fff;text-decoration:none;
              padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
      Accept Invitation
    </a>
    <p style="color:#55555f;font-size:12px;margin-top:24px;">
      Or copy this link: {accept_url}
    </p>
    <p style="color:#55555f;font-size:12px;">
      This invite expires when revoked by the team owner.
    </p>
  </div>
</body>
</html>"""
    return send_email(
        to=to,
        subject=f"Join {org_name} on DataHub",
        html=html,
    )


# -- Lifecycle / activation email templates ------------------------------------

def send_welcome_email(
    to: str,
    username: str | None = None,
    app_url: str = "https://datahub.org.in",
) -> bool:
    """T+0 welcome email triggered on signup.

    Contains a single CTA: open the workspace with the Customers sample
    pre-loaded so the user can reach value in one click.
    """
    name = (username or to.split("@")[0]).split()[0].capitalize()
    deep_link = f"{app_url}/workspace?welcome=1"
    html = f"""<!DOCTYPE html>
<html>
<body style="background:#0a0a0c;color:#e8e8f0;font-family:Inter,sans-serif;padding:32px;">
  <div style="max-width:520px;margin:0 auto;">
    <h2 style="color:#5B6AF0;margin-bottom:4px;">Welcome to DataHub, {name}!</h2>
    <p style="color:#c8c8d8;font-size:14px;line-height:1.6;">
      Your workspace is ready.  In 60 seconds you can ask AI questions about
      your own data \u2014 no SQL experience needed.
    </p>
    <p style="color:#c8c8d8;font-size:14px;line-height:1.6;">
      We\u2019ve pre-loaded a sample dataset so you can try it instantly:
    </p>
    <a href="{deep_link}"
       style="display:inline-block;margin-top:8px;background:#5B6AF0;color:#fff;
              text-decoration:none;padding:12px 24px;border-radius:8px;
              font-size:14px;font-weight:600;">
      Open your workspace \u2192
    </a>
    <p style="color:#44445a;font-size:11px;margin-top:28px;">
      You\u2019re receiving this because you just signed up for DataHub.
      <a href="{app_url}/unsubscribe" style="color:#5B6AF0;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>"""
    text = (
        f"Welcome to DataHub, {name}!\n\n"
        f"Your workspace is ready. Open it here: {deep_link}\n\n"
        f"Unsubscribe: {app_url}/unsubscribe"
    )
    return send_email(to=to, subject=f"Welcome to DataHub, {name}!", html=html, text=text)


def send_stalled_upload_email(
    to: str,
    username: str | None = None,
    dataset_name: str = "your dataset",
    suggestions: list[str] | None = None,
    app_url: str = "https://datahub.org.in",
) -> bool:
    """Day-1 email for users who uploaded data but haven\u2019t asked the AI yet."""
    name = (username or to.split("@")[0]).split()[0].capitalize()
    sugg = suggestions or [
        "Show top 10 rows by revenue",
        "Find duplicate rows",
        "Summarise this dataset",
    ]
    chips = "".join(
        f'<li style="margin:6px 0;color:#c8c8d8;font-size:13px;">\u2022 {s}</li>'
        for s in sugg[:3]
    )
    deep_link = f"{app_url}/workspace"
    html = f"""<!DOCTYPE html>
<html>
<body style="background:#0a0a0c;color:#e8e8f0;font-family:Inter,sans-serif;padding:32px;">
  <div style="max-width:520px;margin:0 auto;">
    <h2 style="color:#5B6AF0;margin-bottom:4px;">Your data is waiting, {name}</h2>
    <p style="color:#c8c8d8;font-size:14px;line-height:1.6;">
      You uploaded <strong>{dataset_name}</strong> but haven\u2019t asked the AI
      anything yet.  Here are 3 questions to get you started:
    </p>
    <ul style="list-style:none;padding:0;margin:12px 0;">{chips}</ul>
    <a href="{deep_link}"
       style="display:inline-block;margin-top:8px;background:#5B6AF0;color:#fff;
              text-decoration:none;padding:12px 24px;border-radius:8px;
              font-size:14px;font-weight:600;">
      Ask the AI now \u2192
    </a>
    <p style="color:#44445a;font-size:11px;margin-top:28px;">
      <a href="{app_url}/unsubscribe" style="color:#5B6AF0;">Unsubscribe from these tips</a>
    </p>
  </div>
</body>
</html>"""
    return send_email(to=to, subject=f"You uploaded {dataset_name} \u2014 here\u2019s what to ask it", html=html)


def send_ghost_nudge_email(
    to: str,
    username: str | None = None,
    app_url: str = "https://datahub.org.in",
) -> bool:
    """Day-1 email for users who signed up but never opened the workspace."""
    name = (username or to.split("@")[0]).split()[0].capitalize()
    deep_link = f"{app_url}/workspace?welcome=1"
    html = f"""<!DOCTYPE html>
<html>
<body style="background:#0a0a0c;color:#e8e8f0;font-family:Inter,sans-serif;padding:32px;">
  <div style="max-width:520px;margin:0 auto;">
    <h2 style="color:#5B6AF0;margin-bottom:4px;">Your workspace is ready, {name}</h2>
    <p style="color:#c8c8d8;font-size:14px;line-height:1.6;">
      It takes about 60 seconds to go from a CSV to an AI-powered insight.
      No SQL experience needed \u2014 just type what you want in plain English.
    </p>
    <a href="{deep_link}"
       style="display:inline-block;margin-top:8px;background:#5B6AF0;color:#fff;
              text-decoration:none;padding:12px 24px;border-radius:8px;
              font-size:14px;font-weight:600;">
      Try it now (60 seconds) \u2192
    </a>
    <p style="color:#44445a;font-size:11px;margin-top:28px;">
      <a href="{app_url}/unsubscribe" style="color:#5B6AF0;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>"""
    return send_email(to=to, subject="Your DataHub workspace is ready \u2014 60 seconds to first insight", html=html)


def send_day3_education_email(
    to: str,
    username: str | None = None,
    app_url: str = "https://datahub.org.in",
) -> bool:
    """Day-3 email for users who haven\u2019t had their first AI answer yet."""
    name = (username or to.split("@")[0]).split()[0].capitalize()
    deep_link = f"{app_url}/workspace"
    html = f"""<!DOCTYPE html>
<html>
<body style="background:#0a0a0c;color:#e8e8f0;font-family:Inter,sans-serif;padding:32px;">
  <div style="max-width:520px;margin:0 auto;">
    <h2 style="color:#5B6AF0;margin-bottom:4px;">See what DataHub can do, {name}</h2>
    <p style="color:#c8c8d8;font-size:14px;line-height:1.6;">
      Here\u2019s how a typical analyst uses DataHub in 3 steps:
    </p>
    <ol style="color:#c8c8d8;font-size:13px;line-height:2;padding-left:18px;">
      <li>Upload a CSV (or try the Customers sample)</li>
      <li>Ask: <em>\u201cShow top 10 customers by revenue\u201d</em></li>
      <li>Approve the transformation \u2014 download or share the result</li>
    </ol>
    <a href="{deep_link}"
       style="display:inline-block;margin-top:12px;background:#5B6AF0;color:#fff;
              text-decoration:none;padding:12px 24px;border-radius:8px;
              font-size:14px;font-weight:600;">
      Open DataHub \u2192
    </a>
    <p style="color:#44445a;font-size:11px;margin-top:28px;">
      <a href="{app_url}/unsubscribe" style="color:#5B6AF0;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>"""
    return send_email(to=to, subject=f"Here\u2019s how DataHub works, {name}", html=html)


def send_day7_winback_email(
    to: str,
    username: str | None = None,
    app_url: str = "https://datahub.org.in",
) -> bool:
    """Day-7 plain-text win-back email.  No images, founder voice, asks for a reply."""
    name = (username or to.split("@")[0]).split()[0].capitalize()
    text = (
        f"Hi {name},\n\n"
        f"You signed up for DataHub a week ago but haven\u2019t had a chance to try it yet.\n\n"
        f"I wanted to reach out personally \u2014 is there something that stopped you? "
        f"Too complicated, wrong use case, or just busy?\n\n"
        f"If you reply to this email I read every message and would love to help.\n\n"
        f"If you\u2019re ready to try, your workspace is here: {app_url}/workspace\n\n"
        f"Best,\nThe DataHub Team\n\n"
        f"---\nUnsubscribe: {app_url}/unsubscribe"
    )
    # Plain text only for higher deliverability
    return send_email(to=to, subject=f"Did DataHub not click, {name}? (honest question)", html=f"<pre>{text}</pre>", text=text)


def send_dormant_email(
    to: str,
    username: str | None = None,
    last_dataset: str = "your dataset",
    app_url: str = "https://datahub.org.in",
) -> bool:
    """Activated-but-dormant (7+ days since last visit) re-engagement."""
    name = (username or to.split("@")[0]).split()[0].capitalize()
    deep_link = f"{app_url}/workspace"
    html = f"""<!DOCTYPE html>
<html>
<body style="background:#0a0a0c;color:#e8e8f0;font-family:Inter,sans-serif;padding:32px;">
  <div style="max-width:520px;margin:0 auto;">
    <h2 style="color:#5B6AF0;margin-bottom:4px;">Pick up where you left off, {name}</h2>
    <p style="color:#c8c8d8;font-size:14px;line-height:1.6;">
      Your dataset <strong>{last_dataset}</strong> is waiting in your workspace.
    </p>
    <a href="{deep_link}"
       style="display:inline-block;margin-top:8px;background:#5B6AF0;color:#fff;
              text-decoration:none;padding:12px 24px;border-radius:8px;
              font-size:14px;font-weight:600;">
      Continue your analysis \u2192
    </a>
    <p style="color:#44445a;font-size:11px;margin-top:28px;">
      <a href="{app_url}/unsubscribe" style="color:#5B6AF0;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>"""
    return send_email(to=to, subject=f"Your dataset \u2018{last_dataset}\u2019 is waiting for you", html=html)