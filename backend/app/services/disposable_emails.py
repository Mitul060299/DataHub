"""
disposable_emails.py
====================
Static blocklist of disposable / temporary-email domains used to prevent
trial-abuse signups.

The list is intentionally short and conservative — only the most common
domains used by abuse rings. A maintained, larger list can be plugged in
later via env config (``DISPOSABLE_EMAIL_DOMAINS_FILE``) without code
changes.
"""
from __future__ import annotations

# Common disposable email providers (lowercase, no leading dot).
# Source: aggregated from the public ``disposable-email-domains`` list,
# trimmed to the most-abused providers to keep the in-memory set small.
_DISPOSABLE_DOMAINS: frozenset[str] = frozenset({
    "10minutemail.com",
    "10minutemail.net",
    "20minutemail.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "guerrillamail.org",
    "guerrillamail.biz",
    "sharklasers.com",
    "grr.la",
    "mailinator.com",
    "mailinator.net",
    "mailinator.org",
    "mailinator2.com",
    "tempmail.com",
    "temp-mail.org",
    "temp-mail.io",
    "tempmail.net",
    "tempmailaddress.com",
    "throwawaymail.com",
    "yopmail.com",
    "yopmail.net",
    "yopmail.fr",
    "trashmail.com",
    "trashmail.net",
    "trashmail.io",
    "fakeinbox.com",
    "getnada.com",
    "getairmail.com",
    "maildrop.cc",
    "moakt.com",
    "mohmal.com",
    "mvrht.net",
    "spamgourmet.com",
    "dispostable.com",
    "burnermail.io",
    "incognitomail.org",
    "mailnesia.com",
    "tempinbox.com",
    "tmpmail.org",
    "harakirimail.com",
    "anonbox.net",
    "byom.de",
    "mintemail.com",
    "spam4.me",
    "tempmailo.com",
    "trbvm.com",
    "wegwerfmail.de",
    "wegwerfmail.net",
    "wegwerfmail.org",
    "yopmail.net",
})


def is_disposable_email(email: str) -> bool:
    """Return True if *email*'s domain is on the static disposable blocklist.

    Comparison is case-insensitive on the domain part only. Invalid or empty
    addresses return False (callers should validate format separately).
    """
    if not email or "@" not in email:
        return False
    try:
        domain = email.rsplit("@", 1)[1].strip().lower()
    except IndexError:
        return False
    if not domain:
        return False
    return domain in _DISPOSABLE_DOMAINS
