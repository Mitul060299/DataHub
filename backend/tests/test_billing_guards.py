"""Tests for the pre-launch billing safety guards.

Coverage
--------
  A — /billing/subscribe idempotency
        A1. Returns existing in-flight subscription instead of creating a duplicate
        A2. Creates a new subscription when no in-flight one exists
        A3. Creates a new subscription when the only existing one is cancelled

  B — USD launch gate
        B1. USD currency rejected with 400 when usd_billing_enabled=False
        B2. INR currency accepted when usd_billing_enabled=False
        B3. USD currency accepted when usd_billing_enabled=True

  C — plan-not-configured friendly error
        C1. RuntimeError with "plan ID ... is not configured" maps to 400 (not 503)
        C2. Other RuntimeError still maps to 503

  D — Webhook subscription.activated self-healing
        D1. Inserts a subs row when none exists, then marks active
        D2. Skips self-heal when subs row already exists
"""
from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

# Stub heavy optional deps before importing the app.
for _mod in [
    "chromadb", "chromadb.utils", "chromadb.config", "chromadb.api",
    "slowapi", "slowapi.util", "slowapi.errors", "slowapi.middleware",
]:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")
os.environ.setdefault("BILLING_ENABLED", "true")


def _make_user(uid: str = "user-1", email: str = "u@example.com", plan: str = "Free"):
    from app.dependencies import CurrentUser
    return CurrentUser(id=uid, email=email, role="admin", plan=plan)


class SubscribeIdempotencyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from app.routers import billing as billing_router
        self.billing_router = billing_router
        self.user = _make_user()

    async def test_A1_returns_existing_inflight_subscription(self):
        from app.routers.billing import subscribe, SubscribeRequest

        existing = {
            "razorpay_subscription_id": "sub_existing_123",
            "status": "created",
            "currency": "INR",
        }
        with patch("app.routers.billing.billing_repository.get_active_subscription",
                   return_value=existing), \
             patch("app.routers.billing.billing_service.get_subscription_short_url",
                   return_value="https://rzp.io/i/existing"), \
             patch("app.routers.billing.billing_service.create_subscription",
                   new_callable=AsyncMock) as mock_create:
            result = await subscribe(
                SubscribeRequest(plan="professional", billing_cycle="monthly", quantity=1, currency="INR"),
                user=self.user,
            )

        mock_create.assert_not_called()
        self.assertEqual(result["subscription_id"], "sub_existing_123")
        self.assertEqual(result["short_url"], "https://rzp.io/i/existing")
        self.assertTrue(result.get("reused_existing"))

    async def test_A2_creates_new_when_no_existing(self):
        from app.routers.billing import subscribe, SubscribeRequest

        with patch("app.routers.billing.billing_repository.get_active_subscription",
                   return_value=None), \
             patch("app.routers.billing.billing_service.create_subscription",
                   new_callable=AsyncMock,
                   return_value={"id": "sub_new_456", "short_url": "https://rzp.io/i/new"}) as mock_create:
            result = await subscribe(
                SubscribeRequest(plan="professional", billing_cycle="monthly", quantity=1, currency="INR"),
                user=self.user,
            )

        mock_create.assert_called_once()
        self.assertEqual(result["subscription_id"], "sub_new_456")
        self.assertNotIn("reused_existing", result)

    async def test_A3_creates_new_when_only_cancelled_exists(self):
        from app.routers.billing import subscribe, SubscribeRequest

        cancelled = {
            "razorpay_subscription_id": "sub_old",
            "status": "cancelled",
            "currency": "INR",
        }
        with patch("app.routers.billing.billing_repository.get_active_subscription",
                   return_value=cancelled), \
             patch("app.routers.billing.billing_service.create_subscription",
                   new_callable=AsyncMock,
                   return_value={"id": "sub_fresh", "short_url": "https://rzp.io/i/fresh"}) as mock_create:
            result = await subscribe(
                SubscribeRequest(plan="professional", billing_cycle="monthly", quantity=1, currency="INR"),
                user=self.user,
            )

        mock_create.assert_called_once()
        self.assertEqual(result["subscription_id"], "sub_fresh")


class UsdLaunchGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_B1_usd_rejected_when_disabled(self):
        from fastapi import HTTPException
        from app.routers.billing import subscribe, SubscribeRequest

        with patch("app.routers.billing.settings") as mock_settings:
            mock_settings.billing_enabled = True
            mock_settings.usd_billing_enabled = False
            mock_settings.razorpay_key_id = "rzp_test_x"
            with self.assertRaises(HTTPException) as ctx:
                await subscribe(
                    SubscribeRequest(plan="professional", billing_cycle="monthly", quantity=1, currency="USD"),
                    user=_make_user(),
                )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail.get("error"), "usd_billing_unavailable")

    async def test_B2_inr_accepted_when_usd_disabled(self):
        from app.routers.billing import subscribe, SubscribeRequest

        with patch("app.routers.billing.settings") as mock_settings, \
             patch("app.routers.billing.billing_repository.get_active_subscription", return_value=None), \
             patch("app.routers.billing.billing_service.create_subscription",
                   new_callable=AsyncMock,
                   return_value={"id": "sub_inr", "short_url": "x"}):
            mock_settings.billing_enabled = True
            mock_settings.usd_billing_enabled = False
            mock_settings.razorpay_key_id = "rzp_test_x"
            result = await subscribe(
                SubscribeRequest(plan="professional", billing_cycle="monthly", quantity=1, currency="INR"),
                user=_make_user(),
            )
        self.assertEqual(result["currency"], "INR")

    async def test_B3_usd_accepted_when_enabled(self):
        from app.routers.billing import subscribe, SubscribeRequest

        with patch("app.routers.billing.settings") as mock_settings, \
             patch("app.routers.billing.billing_repository.get_active_subscription", return_value=None), \
             patch("app.routers.billing.billing_service.create_subscription",
                   new_callable=AsyncMock,
                   return_value={"id": "sub_usd", "short_url": "x"}):
            mock_settings.billing_enabled = True
            mock_settings.usd_billing_enabled = True
            mock_settings.razorpay_key_id = "rzp_test_x"
            result = await subscribe(
                SubscribeRequest(plan="professional", billing_cycle="monthly", quantity=1, currency="USD"),
                user=_make_user(),
            )
        self.assertEqual(result["currency"], "USD")


class PlanNotConfiguredErrorTests(unittest.IsolatedAsyncioTestCase):
    async def test_C1_plan_not_configured_returns_400(self):
        from fastapi import HTTPException
        from app.routers.billing import subscribe, SubscribeRequest

        with patch("app.routers.billing.settings") as mock_settings, \
             patch("app.routers.billing.billing_repository.get_active_subscription", return_value=None), \
             patch("app.routers.billing.billing_service.create_subscription",
                   new_callable=AsyncMock,
                   side_effect=RuntimeError(
                       "Razorpay plan ID for professional/monthly/USD is not configured. "
                       "Run scripts/setup_razorpay_plans.py or set the corresponding env var."
                   )):
            mock_settings.billing_enabled = True
            mock_settings.usd_billing_enabled = True  # bypass USD gate to reach plan check
            mock_settings.razorpay_key_id = "rzp_test_x"
            with self.assertRaises(HTTPException) as ctx:
                await subscribe(
                    SubscribeRequest(plan="professional", billing_cycle="monthly", quantity=1, currency="USD"),
                    user=_make_user(),
                )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail.get("error"), "plan_not_configured")

    async def test_C2_other_runtime_error_still_503(self):
        from fastapi import HTTPException
        from app.routers.billing import subscribe, SubscribeRequest

        with patch("app.routers.billing.billing_repository.get_active_subscription", return_value=None), \
             patch("app.routers.billing.billing_service.create_subscription",
                   new_callable=AsyncMock,
                   side_effect=RuntimeError("Razorpay client unavailable")):
            with self.assertRaises(HTTPException) as ctx:
                await subscribe(
                    SubscribeRequest(plan="professional", billing_cycle="monthly", quantity=1, currency="INR"),
                    user=_make_user(),
                )
        self.assertEqual(ctx.exception.status_code, 503)


class ActivatedWebhookSelfHealTests(unittest.IsolatedAsyncioTestCase):
    async def test_D1_self_heals_when_row_missing(self):
        from app.routers.billing import _on_activated

        entities = {
            "subscription": {
                "entity": {
                    "id": "sub_orphan_999",
                    "plan_id": "plan_X",
                    "status": "active",
                    "quantity": 1,
                    "current_start": 1700000000,
                    "current_end": 1702592000,
                    "notes": {
                        "user_id": "user-1",
                        "plan": "professional",
                        "billing_cycle": "monthly",
                        "currency": "INR",
                    },
                }
            }
        }
        with patch("app.routers.billing.billing_repository.get_subscription_by_razorpay_id",
                   return_value=None) as mock_get, \
             patch("app.routers.billing.billing_repository.store_subscription") as mock_store, \
             patch("app.routers.billing.billing_repository.update_subscription_status") as mock_update, \
             patch("app.routers.billing._log", new_callable=AsyncMock):
            await _on_activated(entities, {"event": "subscription.activated"}, event_id="evt_1")

        mock_get.assert_called_once_with("sub_orphan_999")
        mock_store.assert_called_once()
        store_kwargs = mock_store.call_args.kwargs
        self.assertEqual(store_kwargs["user_id"], "user-1")
        self.assertEqual(store_kwargs["plan"], "professional")
        self.assertEqual(store_kwargs["billing_cycle"], "monthly")
        self.assertEqual(store_kwargs["currency"], "INR")
        mock_update.assert_called_once()

    async def test_D2_skips_selfheal_when_row_exists(self):
        from app.routers.billing import _on_activated

        entities = {
            "subscription": {
                "entity": {
                    "id": "sub_exists_111",
                    "notes": {
                        "user_id": "user-2",
                        "plan": "team",
                        "billing_cycle": "annual",
                        "currency": "INR",
                    },
                }
            }
        }
        with patch("app.routers.billing.billing_repository.get_subscription_by_razorpay_id",
                   return_value={"id": "row-uuid", "razorpay_subscription_id": "sub_exists_111"}), \
             patch("app.routers.billing.billing_repository.store_subscription") as mock_store, \
             patch("app.routers.billing.billing_repository.update_subscription_status") as mock_update, \
             patch("app.routers.billing._log", new_callable=AsyncMock):
            await _on_activated(entities, {"event": "subscription.activated"}, event_id="evt_2")

        mock_store.assert_not_called()
        mock_update.assert_called_once()


if __name__ == "__main__":
    unittest.main()
