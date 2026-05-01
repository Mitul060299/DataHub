from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid


from supabase import Client, create_client

from ..config import settings


_ACTIVE_STATUSES = {"active", "authenticated"}
_TERMINAL_STATUSES = {"halted", "cancelled", "completed", "expired"}

_PLAN_SLUG_TO_CANONICAL = {
    "starter": "Starter",
    "professional": "Professional",
    "team": "Team",
    "business": "Business",
    "free": "Free",
}

_PLAN_CANONICAL_TO_SLUG = {value: key for key, value in _PLAN_SLUG_TO_CANONICAL.items()}

_supabase_client: Client | None = None


def _client() -> Client | None:
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client
    if not settings.supabase_url:
        return None

    service_key = settings.supabase_service_role_key or settings.supabase_anon_key
    if not service_key:
        return None

    try:
        _supabase_client = create_client(settings.supabase_url, service_key)
    except Exception:
        _supabase_client = None
    return _supabase_client


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _timestamp_to_iso(value: Any) -> str | None:
    if value is None:
        return None
    try:
        timestamp = int(value)
    except Exception:
        return None
    if timestamp <= 0:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def to_canonical_plan(plan: str | None) -> str:
    if not plan:
        return "Free"
    lowered = str(plan).strip().lower()
    if lowered in _PLAN_SLUG_TO_CANONICAL:
        return _PLAN_SLUG_TO_CANONICAL[lowered]
    titled = str(plan).strip().title()
    if titled in _PLAN_CANONICAL_TO_SLUG:
        return titled
    return "Free"


def to_plan_slug(plan: str | None) -> str:
    canonical = to_canonical_plan(plan)
    return _PLAN_CANONICAL_TO_SLUG.get(canonical, "free")


def billing_ready() -> bool:
    return bool(settings.billing_enabled and _client())


def get_subscription_by_razorpay_id(razorpay_subscription_id: str) -> dict[str, Any] | None:
    client = _client()
    if not client or not razorpay_subscription_id:
        return None
    try:
        response = (
            client.table("subscriptions")
            .select("*")
            .eq("razorpay_subscription_id", razorpay_subscription_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception:
        return None


def get_latest_subscription(user_id: str) -> dict[str, Any] | None:
    client = _client()
    if not client or not user_id:
        return None
    try:
        response = (
            client.table("subscriptions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception:
        return None


def get_active_subscription(user_id: str) -> dict[str, Any] | None:
    client = _client()
    if not client or not user_id:
        return None
    try:
        response = (
            client.table("subscriptions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        rows = response.data or []
        for row in rows:
            status = str(row.get("status") or "").lower()
            if status in _ACTIVE_STATUSES:
                return row
        return None
    except Exception:
        return None


def get_effective_plan(user_id: str) -> str | None:
    if not settings.billing_enabled:
        return None
    latest = get_latest_subscription(user_id)
    if not latest:
        return None

    status = str(latest.get("status") or "").lower()

    # Cancelled-at-cycle-end: keep paid plan until period expires
    if status == "pending_cancellation":
        current_end_raw = latest.get("current_end")
        if current_end_raw:
            try:
                current_end = datetime.fromisoformat(
                    str(current_end_raw).replace("Z", "+00:00")
                )
                if not current_end.tzinfo:
                    current_end = current_end.replace(tzinfo=timezone.utc)
                if current_end > datetime.now(timezone.utc):
                    return to_canonical_plan(latest.get("plan"))
            except Exception:
                pass
        return "Free"

    if status in _ACTIVE_STATUSES:
        return to_canonical_plan(latest.get("plan"))
    if status in _TERMINAL_STATUSES:
        return "Free"
    return None


def store_subscription(
    user_id: str,
    subscription: dict[str, Any],
    plan: str,
    billing_cycle: str,
    quantity: int,
    currency: str = "INR",
) -> dict[str, Any]:
    client = _client()
    if not client:
        raise RuntimeError("Supabase client is not configured")

    razorpay_subscription_id = str(subscription.get("id") or "").strip()
    if not razorpay_subscription_id:
        raise ValueError("Missing Razorpay subscription id")

    existing = get_subscription_by_razorpay_id(razorpay_subscription_id)
    subscription_row_id = str(existing.get("id")) if existing and existing.get("id") else str(uuid.uuid4())

    current_start = _timestamp_to_iso(
        subscription.get("current_start")
        or subscription.get("start_at")
        or subscription.get("charge_at")
    )
    current_end = _timestamp_to_iso(
        subscription.get("current_end")
        or subscription.get("end_at")
    )

    payload = {
        "id": subscription_row_id,
        "user_id": user_id,
        "razorpay_subscription_id": razorpay_subscription_id,
        "razorpay_plan_id": str(subscription.get("plan_id") or ""),
        "plan": to_plan_slug(plan),
        "billing_cycle": str(billing_cycle).lower(),
        "status": str(subscription.get("status") or "created").lower(),
        "current_start": current_start,
        "current_end": current_end,
        "quantity": max(int(quantity or 1), 1),
        "currency": (currency or "INR").upper(),
        "updated_at": _now_iso(),
    }

    try:
        client.table("subscriptions").upsert(payload, on_conflict="razorpay_subscription_id").execute()
    except Exception as exc:
        # ``currency`` column is added in alembic 0062; fall back so older
        # databases (pre-migration) keep working until the migration runs.
        if "currency" in str(exc).lower():
            payload.pop("currency", None)
            client.table("subscriptions").upsert(payload, on_conflict="razorpay_subscription_id").execute()
        else:
            raise

    user_update: dict[str, Any] = {"subscription_id": subscription_row_id}
    try:
        client.table("users").update(user_update).eq("id", user_id).execute()
    except Exception:
        pass

    return payload


def update_subscription_quantity(
    razorpay_subscription_id: str,
    quantity: int,
    *,
    expected_user_id: str | None = None,
) -> None:
    """Update the seat count (quantity) on a subscription row.

    Pass *expected_user_id* from user-facing call sites to prevent an
    attacker from modifying another user's subscription quantity.
    """
    client = _client()
    if not client:
        raise RuntimeError("Supabase client is not configured")

    # SECURITY: verify ownership when caller provides expected_user_id
    if expected_user_id:
        existing = get_subscription_by_razorpay_id(razorpay_subscription_id)
        if existing and str(existing.get("user_id", "")) != str(expected_user_id):
            raise ValueError(
                f"Ownership mismatch: subscription {razorpay_subscription_id} "
                f"does not belong to user {expected_user_id}"
            )

    client.table("subscriptions").update({
        "quantity": max(int(quantity), 1),
        "updated_at": _now_iso(),
    }).eq("razorpay_subscription_id", razorpay_subscription_id).execute()


def update_subscription_status(
    razorpay_subscription_id: str,
    status: str,
    user_id: str | None,
    plan: str | None,
    *,
    verify_ownership: bool = True,
) -> None:
    client = _client()
    if not client:
        raise RuntimeError("Supabase client is not configured")

    normalized_status = str(status or "").lower()
    if not normalized_status:
        raise ValueError("status is required")

    # SECURITY: When called from a user-facing endpoint, verify the subscription
    # belongs to the caller before updating their plan.  Webhook paths set
    # verify_ownership=False because ownership is implicit from the event payload.
    if verify_ownership and user_id:
        existing = get_subscription_by_razorpay_id(razorpay_subscription_id)
        if existing and str(existing.get("user_id", "")) != str(user_id):
            raise ValueError(
                f"Ownership mismatch: subscription {razorpay_subscription_id} "
                f"does not belong to user {user_id}"
            )

    updates = {
        "status": normalized_status,
        "updated_at": _now_iso(),
    }
    client.table("subscriptions").update(updates).eq("razorpay_subscription_id", razorpay_subscription_id).execute()

    if not user_id:
        row = get_subscription_by_razorpay_id(razorpay_subscription_id)
        user_id = str(row.get("user_id")) if row and row.get("user_id") else None

    if not user_id:
        return

    if normalized_status in _ACTIVE_STATUSES:
        target_plan = to_canonical_plan(plan)
    elif normalized_status in _TERMINAL_STATUSES:
        target_plan = "Free"
    else:
        target_plan = to_canonical_plan(plan)

    try:
        client.table("users").update({"plan": target_plan}).eq("id", user_id).execute()
    except Exception:
        pass


def log_payment_event(
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
    razorpay_event_id: str | None = None,
) -> bool:
    """Persist a webhook/payment event with idempotency.

    Returns ``True`` if a new row was inserted, ``False`` if the event was
    already recorded (deduplicated by ``razorpay_event_id``).
    """
    client = _client()
    if not client:
        raise RuntimeError("Supabase client is not configured")

    if razorpay_event_id:
        try:
            existing = (
                client.table("payment_events")
                .select("id")
                .eq("razorpay_event_id", razorpay_event_id)
                .limit(1)
                .execute()
            )
            if existing.data:
                return False
        except Exception:
            # Column may not exist yet (pre-migration). Fall through and insert.
            pass

    row: dict[str, Any] = {
        "user_id": user_id,
        "subscription_id": subscription_id,
        "razorpay_payment_id": payment_id,
        "razorpay_invoice_id": invoice_id,
        "event_type": event_type,
        "amount": amount,
        "currency": currency,
        "status": status,
        "payload": payload,
    }
    if razorpay_event_id:
        row["razorpay_event_id"] = razorpay_event_id

    try:
        client.table("payment_events").insert(row).execute()
    except Exception as exc:
        if "razorpay_event_id" in str(exc).lower():
            row.pop("razorpay_event_id", None)
            client.table("payment_events").insert(row).execute()
        else:
            raise
    return True


def store_proration_note(user_id: str, credit_paise: int, new_subscription_id: str) -> None:
    payload = {
        "credit_paise": max(int(credit_paise), 0),
        "new_subscription_id": new_subscription_id,
        "note": "manual processing required",
    }
    log_payment_event(
        user_id=user_id,
        subscription_id=new_subscription_id,
        event_type="proration_credit",
        payload=payload,
        amount=max(int(credit_paise), 0),
        status="pending",
    )
