"""Razorpay plan + pricing matrix.

DataHub bills via Razorpay. Indian customers are charged in INR using
plans created in the Razorpay dashboard. International customers (anyone
outside India) are charged in USD using a parallel set of USD-denominated
plans on the same Razorpay account (requires "International payments" to
be enabled by Razorpay support).

Pricing config layout
---------------------
* ``PLAN_AMOUNTS`` – source-of-truth amount per plan / currency / cycle in
  the smallest sub-unit (paise for INR, cents for USD).
* ``RAZORPAY_PLAN_IDS`` – Razorpay plan ID per plan / currency / cycle.
* ``INCLUDED_SEATS`` – seats included in the base plan (all plans = 1
  in the new 3-tier model; no per-seat add-ons).

Plan overview (when BILLING_ENABLED=true)
-----------------------------------------
    Starter       free   ($0 / ₹0)     — no Razorpay plan needed
    Professional  $49/mo (₹1,999/mo)
    Expert        $99/mo (₹3,999/mo)

NOTE: Starter is free so it has no Razorpay plan ID. The plan IDs below
were created via scripts/setup_razorpay_plans.py (May 2026). Override any
ID via the corresponding env var without redeploying.
"""

from __future__ import annotations

import os

_IS_TEST = os.getenv("RAZORPAY_KEY_ID", "").startswith("rzp_test_")

# Test-mode plan ID (single plan that covers both INR/USD in test mode).
_TEST_PLAN = "plan_SW9abXgqVnqDXQ"

# ---------------------------------------------------------------------------
# Razorpay plan IDs — created via scripts/setup_razorpay_plans.py (May 2026).
#
# Live INR:  professional → plan_SugB0jUThUjLYj (₹1,999/mo)
#            expert       → plan_SugB0xDaPeYumH (₹3,999/mo)
# Live USD:  professional → plan_SugB1ANN7YOqf7 ($49/mo)
#            expert       → plan_SugB1Tg6LsbnpM ($99/mo)
#
# Override via env vars (no redeploy needed):
#   RAZORPAY_PRO_INR_PLAN, RAZORPAY_PRO_USD_PLAN
#   RAZORPAY_EXPERT_INR_PLAN, RAZORPAY_EXPERT_USD_PLAN
# ---------------------------------------------------------------------------

RAZORPAY_PLAN_IDS: dict[str, dict[str, dict[str, str]]] = {
    # Starter is free — no Razorpay plan needed.
    "professional": {
        "INR": {
            "monthly": _TEST_PLAN if _IS_TEST else os.getenv("RAZORPAY_PRO_INR_PLAN", "plan_SugB0jUThUjLYj"),
        },
        "USD": {
            "monthly": _TEST_PLAN if _IS_TEST else os.getenv("RAZORPAY_PRO_USD_PLAN", "plan_SugB1ANN7YOqf7"),
        },
    },
    "expert": {
        "INR": {
            "monthly": _TEST_PLAN if _IS_TEST else os.getenv("RAZORPAY_EXPERT_INR_PLAN", "plan_SugB0xDaPeYumH"),
        },
        "USD": {
            "monthly": _TEST_PLAN if _IS_TEST else os.getenv("RAZORPAY_EXPERT_USD_PLAN", "plan_SugB1Tg6LsbnpM"),
        },
    },
}


# ---------------------------------------------------------------------------
# Plan amounts (smallest currency unit). Used for proration.
# Starter is free so it has no entry here.
# ---------------------------------------------------------------------------

PLAN_AMOUNTS: dict[str, dict[str, dict[str, int]]] = {
    "professional": {
        "INR": {"monthly": 199_900},   # ₹1,999/mo
        "USD": {"monthly": 4_900},     # $49/mo
    },
    "expert": {
        "INR": {"monthly": 399_900},   # ₹3,999/mo
        "USD": {"monthly": 9_900},     # $99/mo
    },
}


INCLUDED_SEATS: dict[str, int] = {
    "starter": 1,
    "professional": 1,
    "expert": 1,
}


SUPPORTED_CURRENCIES: tuple[str, ...] = ("INR", "USD")


# ---------------------------------------------------------------------------
# Back-compat shims (legacy single-currency callers).
# ---------------------------------------------------------------------------

PLAN_AMOUNTS_PAISE = {p: {"monthly": PLAN_AMOUNTS[p]["INR"]["monthly"]} for p in PLAN_AMOUNTS}
MONTHLY_AMOUNTS_PAISE = {p: PLAN_AMOUNTS[p]["INR"]["monthly"] for p in PLAN_AMOUNTS}
# PER_SEAT_PAISE removed — no seat-based billing in new 3-tier model.


# ---------------------------------------------------------------------------
# Helpers.
# ---------------------------------------------------------------------------

def normalize_currency(value: str | None) -> str:
    """Coerce arbitrary input to a supported ISO 4217 code (defaults to INR)."""
    code = (value or "INR").upper().strip()
    if code not in SUPPORTED_CURRENCIES:
        raise ValueError(
            f"Unsupported currency {value!r}. Supported: {', '.join(SUPPORTED_CURRENCIES)}"
        )
    return code


def get_plan_id(plan_slug: str, currency: str, cycle: str = "monthly") -> str:
    currency = normalize_currency(currency)
    try:
        plan_id = RAZORPAY_PLAN_IDS[plan_slug][currency][cycle]
    except KeyError as exc:
        raise ValueError(f"No Razorpay plan configured for {plan_slug}/{currency}/{cycle}") from exc
    if not plan_id or "REPLACE_ME" in plan_id:
        raise RuntimeError(
            f"Razorpay plan ID for {plan_slug}/{currency}/{cycle} is not configured. "
            "Run scripts/setup_razorpay_plans.py or set the corresponding env var."
        )
    return plan_id


def get_plan_amount(plan_slug: str, currency: str, cycle: str = "monthly") -> int:
    currency = normalize_currency(currency)
    return PLAN_AMOUNTS[plan_slug][currency][cycle]


def get_per_seat_amount(plan_slug: str, currency: str) -> int:
    """No-op stub: per-seat billing was removed in the new 3-tier model.

    Always returns 0. Kept for backward-compatibility with existing call sites
    (e.g. the /billing/seat-usage endpoint) until they are updated.
    """
    return 0
