
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.dependencies import CurrentUser, get_current_user
from app.services import billing_repository, billing_service
from app.services.analytics import track
from app.services.rate_limiter import limiter


router = APIRouter(prefix="/billing", tags=["billing"])


class SubscribeRequest(BaseModel):
    plan: str
    billing_cycle: str
    quantity: int = Field(default=1, ge=1)
    currency: str = Field(default="INR", description="ISO 4217 currency code (INR or USD)")


class UpgradeRequest(BaseModel):
    new_plan: str
    new_billing_cycle: str


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str


class UpdateSeatsRequest(BaseModel):
    quantity: int = Field(ge=1, description="New total seat count (must be >= included seats)")


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
            currency=payload.currency,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "subscription_id": subscription.get("id"),
        "short_url": subscription.get("short_url"),
        "razorpay_key_id": settings.razorpay_key_id,
        "currency": (payload.currency or "INR").upper(),
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


@router.post("/seats")
@limiter.limit("10/minute")
async def update_seats(
    request: Request,
    payload: UpdateSeatsRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Add or reduce seats on the active subscription.

    Increases take effect immediately (prorated by Razorpay).
    Decreases take effect at the next billing cycle.
    """
    _ensure_billing_enabled()

    try:
        result = await billing_service.update_seat_count(user.id, payload.quantity)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return result


@router.get("/seat-usage")
async def seat_usage(user: CurrentUser = Depends(get_current_user)):
    """Return current seat utilisation for the calling user's account."""
    _ensure_billing_enabled()

    from app.razorpay_plans import INCLUDED_SEATS, get_per_seat_amount
    from app.services.plan_limits import get_limits

    effective_plan = billing_repository.get_effective_plan(user.id) or user.plan
    plan_slug = billing_repository.to_plan_slug(effective_plan)
    limits = get_limits(effective_plan)

    included = INCLUDED_SEATS.get(plan_slug, limits.get("included_seats", 1))
    sub = billing_repository.get_active_subscription(user.id)
    purchased = max(int(sub.get("quantity") or included), included) if sub else included
    sub_currency = (sub or {}).get("currency") or "INR"

    # Count distinct member emails across all workspaces AND projects owned by
    # this user. During the workspace→project cutover, the union ensures a
    # migrated invite isn't counted twice. Workspace counting is removed in
    # the workspace tear-down phase.
    from app.db import SessionLocal
    from app.models_db import ProjectDB, ProjectMemberDB, Workspace, WorkspaceMemberDB
    db = SessionLocal()
    try:
        owned_ws_ids = [
            ws.id for ws in
            db.query(Workspace.id).filter(Workspace.owner_id == user.id).all()
        ]
        owned_project_ids = [
            p.id for p in
            db.query(ProjectDB.id).filter(ProjectDB.user_id == user.id).all()
        ]

        ws_emails: set[str] = set()
        if owned_ws_ids:
            ws_emails = {
                (e or "").lower()
                for (e,) in db.query(WorkspaceMemberDB.email)
                .filter(
                    WorkspaceMemberDB.workspace_id.in_(owned_ws_ids),
                    WorkspaceMemberDB.status.in_(["active", "pending"]),
                )
                .all()
            }

        proj_emails: set[str] = set()
        if owned_project_ids:
            proj_emails = {
                (e or "").lower()
                for (e,) in db.query(ProjectMemberDB.email)
                .filter(
                    ProjectMemberDB.project_id.in_(owned_project_ids),
                    ProjectMemberDB.status.in_(["active", "pending"]),
                )
                .all()
            }

        used = 1 + len(ws_emails | proj_emails)  # +1 for owner
    finally:
        db.close()

    extra_seat_price = get_per_seat_amount(plan_slug, sub_currency)

    return {
        "current_seats": used,
        "included_seats": included,
        "purchased_seats": purchased,
        "max_seats": limits.get("max_seats", 1),
        "currency": str(sub_currency).upper(),
        "extra_seat_price_paise": extra_seat_price if str(sub_currency).upper() == "INR" else 0,
        "extra_seat_price_inr": round(extra_seat_price / 100, 2) if str(sub_currency).upper() == "INR" and extra_seat_price else 0,
        "extra_seat_price_minor": extra_seat_price,
        "extra_seat_price_major": round(extra_seat_price / 100, 2) if extra_seat_price else 0,
        "can_invite_more": used < purchased,
    }


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

    # Signature is valid — promote subscription to active.
    sub = billing_repository.get_subscription_by_razorpay_id(payload.razorpay_subscription_id)
    if sub:
        # SECURITY: verify this subscription was created by the calling user.
        # Prevents an attacker from replaying another user's valid payment
        # signature to claim their subscription.
        if str(sub.get("user_id", "")) != user.id:
            raise HTTPException(
                status_code=403,
                detail="Subscription ownership mismatch — this subscription does not belong to your account.",
            )
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

    # Razorpay webhooks may be retried; dedupe on the event id.
    razorpay_event_id = (
        str(payload.get("id") or payload.get("event_id") or "") or None
    )

    # Plan authority note:
    # users.plan must only be updated through webhook status handlers below
    # via billing_repository.update_subscription_status.
    handlers = {
        "subscription.activated": _on_activated,
        "subscription.charged": _on_charged,
        "subscription.halted": _on_halted,
        "subscription.cancelled": _on_cancelled,
        "subscription.updated": _on_updated,
        "payment.failed": _on_payment_failed,
    }
    handler = handlers.get(event)
    if handler:
        await handler(entities, payload, razorpay_event_id)

    return {"status": "ok"}


def _subscription_entity(entities: dict[str, Any]) -> dict[str, Any]:
    return entities.get("subscription", {}).get("entity", {}) if isinstance(entities, dict) else {}


def _payment_entity(entities: dict[str, Any]) -> dict[str, Any]:
    return entities.get("payment", {}).get("entity", {}) if isinstance(entities, dict) else {}


async def _on_activated(entities: dict[str, Any], payload: dict[str, Any], event_id: str | None = None):
    sub = _subscription_entity(entities)
    notes = sub.get("notes") if isinstance(sub.get("notes"), dict) else {}
    user_id = notes.get("user_id")
    plan = notes.get("plan")
    razorpay_sub_id = str(sub.get("id") or "")
    if razorpay_sub_id and user_id and plan:
        billing_repository.update_subscription_status(razorpay_sub_id, "active", str(user_id), str(plan), verify_ownership=False)
    await _log(str(user_id) if user_id else None, razorpay_sub_id or None, "subscription.activated", payload, event_id=event_id)


async def _on_updated(entities: dict[str, Any], payload: dict[str, Any], event_id: str | None = None):
    """Handle subscription.updated.

    Razorpay subscription ``quantity`` is intentionally pinned at 1 in our
    flow (extras billed via add-ons), so we no longer mirror it into our
    DB — our ``subscriptions.quantity`` column is the source of truth for
    purchased seats.
    """
    sub = _subscription_entity(entities)
    razorpay_sub_id = str(sub.get("id") or "")
    notes = sub.get("notes") if isinstance(sub.get("notes"), dict) else {}
    user_id = notes.get("user_id")
    await _log(str(user_id) if user_id else None, razorpay_sub_id or None, "subscription.updated", payload, event_id=event_id)


async def _on_charged(entities: dict[str, Any], payload: dict[str, Any], event_id: str | None = None):
    sub = _subscription_entity(entities)
    payment = _payment_entity(entities)
    notes = sub.get("notes") if isinstance(sub.get("notes"), dict) else {}
    user_id = notes.get("user_id")
    plan = notes.get("plan") or ""
    amount = payment.get("amount")
    currency = str(payment.get("currency") or notes.get("currency") or "INR").upper()
    razorpay_sub_id = str(sub.get("id") or "")

    # Queue extra-seat add-on for the *next* invoice so the per-seat
    # overage continues to bill recurringly. Safe to call every cycle:
    # it is a no-op when the user has no extras.
    try:
        billing_service.queue_next_cycle_seat_addon(razorpay_sub_id)
    except Exception:
        pass

    track(
        str(user_id) if user_id else "unknown",
        "payment_completed",
        {"plan": plan, "amount": (amount / 100) if isinstance(amount, (int, float)) else None, "currency": currency, "subscription_id": razorpay_sub_id},
    )
    await _log(
        str(user_id) if user_id else None,
        razorpay_sub_id or None,
        "subscription.charged",
        payload,
        payment_id=str(payment.get("id") or "") or None,
        invoice_id=str(payment.get("invoice_id") or "") or None,
        amount=amount,
        currency=currency,
        status="captured",
        event_id=event_id,
    )


async def _on_halted(entities: dict[str, Any], payload: dict[str, Any], event_id: str | None = None):
    sub = _subscription_entity(entities)
    notes = sub.get("notes") if isinstance(sub.get("notes"), dict) else {}
    user_id = notes.get("user_id")
    razorpay_sub_id = str(sub.get("id") or "")
    if razorpay_sub_id and user_id:
        billing_repository.update_subscription_status(razorpay_sub_id, "halted", str(user_id), "free", verify_ownership=False)
    await _log(str(user_id) if user_id else None, razorpay_sub_id or None, "subscription.halted", payload, event_id=event_id)


async def _on_cancelled(entities: dict[str, Any], payload: dict[str, Any], event_id: str | None = None):
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
                razorpay_sub_id, "pending_cancellation", str(user_id) if user_id else None, plan,
                verify_ownership=False,
            )
        else:
            billing_repository.update_subscription_status(
                razorpay_sub_id, "cancelled", str(user_id) if user_id else None, "free",
                verify_ownership=False,
            )
    await _log(str(user_id) if user_id else None, razorpay_sub_id or None, "subscription.cancelled", payload, event_id=event_id)


async def _on_payment_failed(entities: dict[str, Any], payload: dict[str, Any], event_id: str | None = None):
    payment = _payment_entity(entities)
    currency = str(payment.get("currency") or "INR").upper()
    await _log(
        None,
        str(payment.get("subscription_id") or "") or None,
        "payment.failed",
        payload,
        payment_id=str(payment.get("id") or "") or None,
        invoice_id=str(payment.get("invoice_id") or "") or None,
        amount=payment.get("amount"),
        currency=currency,
        status="failed",
        event_id=event_id,
    )


async def _log(
    user_id: str | None,
    subscription_id: str | None,
    event_type: str,
    payload: dict[str, Any],
    payment_id: str | None = None,
    invoice_id: str | None = None,
    amount: int | None = None,
    currency: str = "INR",
    status: str | None = None,
    event_id: str | None = None,
):
    await billing_service.log_payment_event(
        user_id=user_id,
        subscription_id=subscription_id,
        event_type=event_type,
        payload=payload,
        payment_id=payment_id,
        invoice_id=invoice_id,
        amount=amount,
        currency=currency,
        status=status,
        razorpay_event_id=event_id,
    )
