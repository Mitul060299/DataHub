
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.dependencies import CurrentUser, get_current_user
from app.services import billing_repository, billing_service
from app.services.analytics import track


router = APIRouter(prefix="/billing", tags=["billing"])


class SubscribeRequest(BaseModel):
    plan: str
    billing_cycle: str
    quantity: int = Field(default=1, ge=1)


class UpgradeRequest(BaseModel):
    new_plan: str
    new_billing_cycle: str


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str


def _ensure_billing_enabled() -> None:
    if not settings.billing_enabled:
        raise HTTPException(status_code=404, detail="Billing is not enabled")


def _normalize_plan_slug(plan: str) -> str:
    slug = billing_repository.to_plan_slug(plan)
    if slug not in {"professional", "team", "business"}:
        raise HTTPException(status_code=400, detail="Invalid plan. Must be professional, team, or business.")
    return slug


def _normalize_cycle(cycle: str) -> str:
    value = str(cycle or "").strip().lower()
    if value not in {"monthly", "annual"}:
        raise HTTPException(status_code=400, detail="Invalid billing cycle. Must be monthly or annual.")
    return value


@router.post("/subscribe")
async def subscribe(
    payload: SubscribeRequest,
    user: CurrentUser = Depends(get_current_user),
):
    _ensure_billing_enabled()

    plan = _normalize_plan_slug(payload.plan)
    billing_cycle = _normalize_cycle(payload.billing_cycle)

    try:
        subscription = await billing_service.create_subscription(
            user_id=user.id,
            plan=plan,
            billing_cycle=billing_cycle,
            quantity=payload.quantity,
            notify_email=user.email,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "subscription_id": subscription.get("id"),
        "short_url": subscription.get("short_url"),
        "razorpay_key_id": settings.razorpay_key_id,
    }


@router.post("/upgrade")
async def upgrade(
    payload: UpgradeRequest,
    user: CurrentUser = Depends(get_current_user),
):
    _ensure_billing_enabled()
    raise HTTPException(
        status_code=410,
        detail="Direct upgrade endpoint is disabled. Use checkout via /billing/subscribe.",
    )


@router.post("/cancel")
async def cancel(
    at_cycle_end: bool = True,
    user: CurrentUser = Depends(get_current_user),
):
    _ensure_billing_enabled()

    try:
        return await billing_service.cancel_subscription(user.id, at_cycle_end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/verify")
async def verify_payment(
    payload: VerifyPaymentRequest,
    user: CurrentUser = Depends(get_current_user),
):
    _ensure_billing_enabled()

    verified = billing_service.verify_payment_signature(
        payload.razorpay_payment_id,
        payload.razorpay_subscription_id,
        payload.razorpay_signature,
    )
    if not verified:
        raise HTTPException(status_code=400, detail="Payment verification failed — invalid signature")

    # Signature is valid — promote subscription to active immediately.
    # store_subscription already wrote the correct plan when checkout was
    # initiated; this just flips status from "created" to "active" so
    # get_effective_plan returns the paid plan on the next page load.
    sub = billing_repository.get_subscription_by_razorpay_id(payload.razorpay_subscription_id)
    if sub:
        billing_repository.update_subscription_status(
            payload.razorpay_subscription_id,
            "active",
            user.id,
            sub.get("plan"),
        )

    effective_plan = billing_repository.get_effective_plan(user.id)
    return {
        "verified": True,
        "user_id": user.id,
        "plan": effective_plan,
    }


@router.get("/status")
async def billing_status(user: CurrentUser = Depends(get_current_user)):
    _ensure_billing_enabled()

    status = await billing_service.get_subscription_status(user.id)
    effective_plan = billing_repository.get_effective_plan(user.id) or user.plan
    return {
        "plan": effective_plan,
        "subscription": status.get("subscription"),
        "has_active_subscription": bool(status.get("has_active_subscription")),
    }


@router.get("/invoices")
async def list_invoices(user: CurrentUser = Depends(get_current_user)):
    _ensure_billing_enabled()

    try:
        return await billing_service.get_invoices(user.id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, user: CurrentUser = Depends(get_current_user)):
    _ensure_billing_enabled()

    try:
        return {"pdf_url": await billing_service.get_invoice_pdf_url(invoice_id)}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/webhook/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str | None = Header(default=None),
):
    _ensure_billing_enabled()

    body = await request.body()
    if not billing_service.verify_webhook_signature(body, x_razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        payload = json.loads(body)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc

    event = str(payload.get("event") or "")
    entities = payload.get("payload", {})

    # Plan authority note:
    # users.plan must only be updated through webhook status handlers below
    # via billing_repository.update_subscription_status.
    handlers = {
        "subscription.activated": _on_activated,
        "subscription.charged": _on_charged,
        "subscription.halted": _on_halted,
        "subscription.cancelled": _on_cancelled,
        "payment.failed": _on_payment_failed,
    }
    handler = handlers.get(event)
    if handler:
        await handler(entities, payload)

    return {"status": "ok"}


def _subscription_entity(entities: dict[str, Any]) -> dict[str, Any]:
    return entities.get("subscription", {}).get("entity", {}) if isinstance(entities, dict) else {}


def _payment_entity(entities: dict[str, Any]) -> dict[str, Any]:
    return entities.get("payment", {}).get("entity", {}) if isinstance(entities, dict) else {}


async def _on_activated(entities: dict[str, Any], payload: dict[str, Any]):
    sub = _subscription_entity(entities)
    notes = sub.get("notes") if isinstance(sub.get("notes"), dict) else {}
    user_id = notes.get("user_id")
    plan = notes.get("plan")
    razorpay_sub_id = str(sub.get("id") or "")
    if razorpay_sub_id and user_id and plan:
        billing_repository.update_subscription_status(razorpay_sub_id, "active", str(user_id), str(plan))
    await _log(str(user_id) if user_id else None, razorpay_sub_id or None, "subscription.activated", payload)


async def _on_charged(entities: dict[str, Any], payload: dict[str, Any]):
    sub = _subscription_entity(entities)
    payment = _payment_entity(entities)
    notes = sub.get("notes") if isinstance(sub.get("notes"), dict) else {}
    user_id = notes.get("user_id")
    plan = notes.get("plan") or ""
    amount = payment.get("amount")
    track(
        str(user_id) if user_id else "unknown",
        "payment_completed",
        {"plan": plan, "amount_inr": (amount / 100) if isinstance(amount, (int, float)) else None, "subscription_id": str(sub.get("id") or "")},
    )
    await _log(
        str(user_id) if user_id else None,
        str(sub.get("id") or "") or None,
        "subscription.charged",
        payload,
        payment_id=str(payment.get("id") or "") or None,
        invoice_id=str(payment.get("invoice_id") or "") or None,
        amount=amount,
        status="captured",
    )


async def _on_halted(entities: dict[str, Any], payload: dict[str, Any]):
    sub = _subscription_entity(entities)
    notes = sub.get("notes") if isinstance(sub.get("notes"), dict) else {}
    user_id = notes.get("user_id")
    razorpay_sub_id = str(sub.get("id") or "")
    if razorpay_sub_id and user_id:
        billing_repository.update_subscription_status(razorpay_sub_id, "halted", str(user_id), "free")
    await _log(str(user_id) if user_id else None, razorpay_sub_id or None, "subscription.halted", payload)


async def _on_cancelled(entities: dict[str, Any], payload: dict[str, Any]):
    sub = _subscription_entity(entities)
    notes = sub.get("notes") if isinstance(sub.get("notes"), dict) else {}
    user_id = notes.get("user_id")
    razorpay_sub_id = str(sub.get("id") or "")
    if razorpay_sub_id:
        # Check whether the user still has paid access (at_cycle_end cancellation)
        existing = billing_repository.get_subscription_by_razorpay_id(razorpay_sub_id)
        current_end_raw = existing.get("current_end") if existing else None
        still_active = False
        if current_end_raw:
            try:
                current_end = datetime.fromisoformat(
                    str(current_end_raw).replace("Z", "+00:00")
                )
                if not current_end.tzinfo:
                    current_end = current_end.replace(tzinfo=timezone.utc)
                still_active = current_end > datetime.now(timezone.utc)
            except Exception:
                pass
        if still_active:
            # Keep paid plan active until period end; get_effective_plan will
            # downgrade automatically once current_end passes.
            plan = existing.get("plan") if existing else None
            billing_repository.update_subscription_status(
                razorpay_sub_id, "pending_cancellation", str(user_id) if user_id else None, plan
            )
        else:
            billing_repository.update_subscription_status(
                razorpay_sub_id, "cancelled", str(user_id) if user_id else None, "free"
            )
    await _log(str(user_id) if user_id else None, razorpay_sub_id or None, "subscription.cancelled", payload)


async def _on_payment_failed(entities: dict[str, Any], payload: dict[str, Any]):
    payment = _payment_entity(entities)
    await _log(
        None,
        str(payment.get("subscription_id") or "") or None,
        "payment.failed",
        payload,
        payment_id=str(payment.get("id") or "") or None,
        invoice_id=str(payment.get("invoice_id") or "") or None,
        amount=payment.get("amount"),
        status="failed",
    )


async def _log(
    user_id: str | None,
    subscription_id: str | None,
    event_type: str,
    payload: dict[str, Any],
    payment_id: str | None = None,
    invoice_id: str | None = None,
    amount: int | None = None,
    status: str | None = None,
):
    await billing_service.log_payment_event(
        user_id=user_id,
        subscription_id=subscription_id,
        event_type=event_type,
        payload=payload,
        payment_id=payment_id,
        invoice_id=invoice_id,
        amount=amount,
        status=status,
    )
