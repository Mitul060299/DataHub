from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import hmac
from typing import Any

import razorpay

from ..config import settings
from ..razorpay_plans import MONTHLY_AMOUNTS_PAISE, RAZORPAY_PLAN_IDS
from . import billing_repository


_ALLOWED_PLANS = {"professional", "team", "business"}
_ALLOWED_BILLING_CYCLES = {"monthly", "annual"}


def _get_client() -> razorpay.Client:
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise RuntimeError("Razorpay credentials are not configured")
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        text = str(value).strip()
        if not text:
            return None
        text = text.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _normalize_plan_slug(plan: str) -> str:
    slug = billing_repository.to_plan_slug(plan)
    if slug not in _ALLOWED_PLANS:
        raise ValueError("Invalid plan. Must be professional, team, or business.")
    return slug


def _normalize_billing_cycle(billing_cycle: str) -> str:
    cycle = str(billing_cycle or "").strip().lower()
    if cycle not in _ALLOWED_BILLING_CYCLES:
        raise ValueError("Invalid billing cycle. Must be monthly or annual.")
    return cycle


def _calculate_proration(subscription: dict[str, Any]) -> int:
    now = datetime.now(timezone.utc)
    period_end = _parse_datetime(subscription.get("current_end"))
    period_start = _parse_datetime(subscription.get("current_start"))
    if not period_end or not period_start:
        return 0

    total_seconds = (period_end - period_start).total_seconds()
    remaining_seconds = (period_end - now).total_seconds()
    if total_seconds <= 0 or remaining_seconds <= 0:
        return 0

    plan_slug = billing_repository.to_plan_slug(subscription.get("plan"))
    monthly_amount = MONTHLY_AMOUNTS_PAISE.get(plan_slug, 0)
    if monthly_amount <= 0:
        return 0

    ratio = max(0.0, min(1.0, remaining_seconds / total_seconds))
    return int(ratio * monthly_amount)


async def create_subscription(
    user_id: str,
    plan: str,
    billing_cycle: str,
    quantity: int = 1,
    notify_email: str | None = None,
) -> dict[str, Any]:
    plan_slug = _normalize_plan_slug(plan)
    cycle = _normalize_billing_cycle(billing_cycle)
    plan_id = RAZORPAY_PLAN_IDS[plan_slug][cycle]
    if not plan_id or plan_id == "plan_REPLACE_ME":
        raise RuntimeError("Razorpay plan IDs are not configured")

    total_count = 12 if cycle == "monthly" else 1
    payload: dict[str, Any] = {
        "plan_id": plan_id,
        "total_count": total_count,
        "quantity": max(int(quantity or 1), 1),
        "customer_notify": 1,
        "notes": {
            "user_id": user_id,
            "plan": plan_slug,
            "billing_cycle": cycle,
        },
    }
    if notify_email:
        payload["notify_info"] = {"notify_email": notify_email}

    subscription = _get_client().subscription.create(payload)
    billing_repository.store_subscription(
        user_id=user_id,
        subscription=subscription,
        plan=plan_slug,
        billing_cycle=cycle,
        quantity=max(int(quantity or 1), 1),
    )
    return subscription


async def upgrade_subscription(user_id: str, new_plan: str, new_billing_cycle: str) -> dict[str, Any]:
    new_plan_slug = _normalize_plan_slug(new_plan)
    new_cycle = _normalize_billing_cycle(new_billing_cycle)

    current_sub = billing_repository.get_active_subscription(user_id)
    if not current_sub:
        raise ValueError("No active subscription to upgrade")

    current_razorpay_sub_id = str(current_sub.get("razorpay_subscription_id") or "")
    if not current_razorpay_sub_id:
        raise ValueError("Active subscription is missing Razorpay subscription id")

    _get_client().subscription.cancel(
        current_razorpay_sub_id,
        {"cancel_at_cycle_end": 1},
    )

    credit_paise = _calculate_proration(current_sub)

    new_sub = await create_subscription(user_id, new_plan_slug, new_cycle)
    billing_repository.store_proration_note(user_id, credit_paise, str(new_sub.get("id") or ""))

    return {
        "new_subscription": new_sub,
        "proration_credit_inr": round(credit_paise / 100, 2),
        "note": "Proration credit logged. Process via Razorpay dashboard or apply to next invoice.",
    }


async def cancel_subscription(user_id: str, at_cycle_end: bool = True) -> dict[str, Any]:
    current_sub = billing_repository.get_active_subscription(user_id)
    if not current_sub:
        raise ValueError("No active subscription found")

    current_razorpay_sub_id = str(current_sub.get("razorpay_subscription_id") or "")
    if not current_razorpay_sub_id:
        raise ValueError("Active subscription is missing Razorpay subscription id")

    result = _get_client().subscription.cancel(
        current_razorpay_sub_id,
        {"cancel_at_cycle_end": 1 if at_cycle_end else 0},
    )
    return result


async def get_invoices(user_id: str) -> list[dict[str, Any]]:
    current_sub = billing_repository.get_active_subscription(user_id)
    if not current_sub:
        return []

    current_razorpay_sub_id = str(current_sub.get("razorpay_subscription_id") or "")
    if not current_razorpay_sub_id:
        return []

    invoices = _get_client().invoice.all(
        {
            "subscription_id": current_razorpay_sub_id,
            "count": 12,
        }
    )
    return invoices.get("items", [])


async def get_invoice_pdf_url(invoice_id: str) -> str:
    invoice = _get_client().invoice.fetch(invoice_id)
    return str(invoice.get("short_url") or "")


def verify_payment_signature(
    razorpay_payment_id: str,
    razorpay_subscription_id: str,
    razorpay_signature: str,
) -> bool:
    if not settings.razorpay_key_secret:
        return False

    body = f"{razorpay_payment_id}|{razorpay_subscription_id}"
    expected = hmac.new(
        settings.razorpay_key_secret.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, razorpay_signature)


def verify_webhook_signature(body: bytes, signature: str | None) -> bool:
    if not settings.razorpay_webhook_secret or not signature:
        return False

    expected = hmac.new(
        settings.razorpay_webhook_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def get_subscription_status(user_id: str) -> dict[str, Any]:
    latest = billing_repository.get_latest_subscription(user_id)
    active = billing_repository.get_active_subscription(user_id)
    if latest and latest.get("razorpay_subscription_id"):
        try:
            fetched = _get_client().subscription.fetch(str(latest.get("razorpay_subscription_id")))
            short_url = fetched.get("short_url")
            if short_url:
                latest = {**latest, "short_url": short_url}
        except Exception:
            pass
    return {
        "subscription": latest,
        "has_active_subscription": active is not None,
    }


async def log_payment_event(
    *,
    user_id: str | None,
    subscription_id: str | None,
    event_type: str,
    payload: dict[str, Any],
    payment_id: str | None = None,
    invoice_id: str | None = None,
    amount: int | None = None,
    currency: str = "INR",
    status: str | None = None,
) -> None:
    billing_repository.log_payment_event(
        user_id=user_id,
        subscription_id=subscription_id,
        event_type=event_type,
        payload=payload,
        payment_id=payment_id,
        invoice_id=invoice_id,
        amount=amount,
        currency=currency,
        status=status,
    )
