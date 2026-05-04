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
* ``PER_SEAT_AMOUNTS`` – overage amount per extra seat per currency.
* ``INCLUDED_SEATS`` – seats already included in the base plan.

USD pricing
-----------
Internal mapping is hand-tuned to round prices in each currency, not a
naive INR/USD conversion (typical SaaS pricing pattern):

    Starter      $19/mo    (~₹999)
    Professional $79/mo    (~₹3,999)
    Team         $179/mo   (~₹8,999)
    Business     $349/mo   (~₹17,999)
    Extra seat (Team)     $29/mo  (~₹1,499)
    Extra seat (Business) $49/mo  (~₹2,499)
"""

from __future__ import annotations

import os

_IS_TEST = os.getenv("RAZORPAY_KEY_ID", "").startswith("rzp_test_")

# Test-mode plan ID (single plan that covers both INR/USD in test mode).
_TEST_PLAN = "plan_SW9abXgqVnqDXQ"

# ---------------------------------------------------------------------------
# Razorpay plan IDs (created in the Razorpay dashboard).
#
# Live INR plan IDs (created 2026-05-01 — "V3" pricing reset):
#     starter      → plan_Sk9InffRzS4NjI   (₹999/mo)
#     professional → plan_Sk9JPF6MjLmqLr   (₹3,999/mo)
#     team         → plan_Sk9Jyri0JaFOqr   (₹8,999/mo)
#     business     → plan_Sk9L0dcmaAgoiU   (₹17,999/mo)
#
# Live USD plan IDs (created 2026-05-04 — International KYC approved):
#     starter      → plan_SlAVA70nI1Jf9c   ($19/mo)
#     professional → plan_SlAVAJtYi6MlQH   ($79/mo)
#     team         → plan_SlAVAejGisc8gs   ($179/mo)
#     business     → plan_SlAVAuwTe4F2Nm   ($349/mo)
#
# USD plans use the hardcoded IDs above as defaults; override via env vars
# if needed: RAZORPAY_STARTER_USD_PLAN, RAZORPAY_PRO_USD_PLAN,
#     RAZORPAY_TEAM_USD_PLAN, RAZORPAY_BUSINESS_USD_PLAN
# ---------------------------------------------------------------------------

RAZORPAY_PLAN_IDS: dict[str, dict[str, dict[str, str]]] = {
    "starter": {
        "INR": {
            "monthly": _TEST_PLAN if _IS_TEST else "plan_Sk9InffRzS4NjI",
        },
        "USD": {
            "monthly": _TEST_PLAN if _IS_TEST else os.getenv("RAZORPAY_STARTER_USD_PLAN", "plan_SlAVA70nI1Jf9c"),
        },
    },
    "professional": {
        "INR": {
            "monthly": _TEST_PLAN if _IS_TEST else "plan_Sk9JPF6MjLmqLr",
        },
        "USD": {
            "monthly": _TEST_PLAN if _IS_TEST else os.getenv("RAZORPAY_PRO_USD_PLAN", "plan_SlAVAJtYi6MlQH"),
        },
    },
    "team": {
        "INR": {
            "monthly": _TEST_PLAN if _IS_TEST else "plan_Sk9Jyri0JaFOqr",
        },
        "USD": {
            "monthly": _TEST_PLAN if _IS_TEST else os.getenv("RAZORPAY_TEAM_USD_PLAN", "plan_SlAVAejGisc8gs"),
        },
    },
    "business": {
        "INR": {
            "monthly": _TEST_PLAN if _IS_TEST else "plan_Sk9L0dcmaAgoiU",
        },
        "USD": {
            "monthly": _TEST_PLAN if _IS_TEST else os.getenv("RAZORPAY_BUSINESS_USD_PLAN", "plan_SlAVAuwTe4F2Nm"),
        },
    },
}


# ---------------------------------------------------------------------------
# Plan amounts (smallest currency unit). Used for proration and add-ons.
# ---------------------------------------------------------------------------

PLAN_AMOUNTS: dict[str, dict[str, dict[str, int]]] = {
    "starter": {
        "INR": {"monthly": 99_900},    # ₹999/mo
        "USD": {"monthly": 1_900},     # $19/mo
    },
    "professional": {
        "INR": {"monthly": 399_900},   # ₹3,999/mo
        "USD": {"monthly": 7_900},     # $79/mo
    },
    "team": {
        "INR": {"monthly": 899_900},   # ₹8,999/mo (3 seats)
        "USD": {"monthly": 17_900},    # $179/mo  (3 seats)
    },
    "business": {
        "INR": {"monthly": 1_799_900}, # ₹17,999/mo (5 seats)
        "USD": {"monthly": 34_900},    # $349/mo   (5 seats)
    },
}


# ---------------------------------------------------------------------------
# Per-seat overage amounts (smallest unit / month).
# ---------------------------------------------------------------------------

PER_SEAT_AMOUNTS: dict[str, dict[str, int]] = {
    "team": {
        "INR": 149_900,   # ₹1,499/seat/mo
        "USD": 2_900,     # $29/seat/mo
    },
    "business": {
        "INR": 249_900,   # ₹2,499/seat/mo
        "USD": 4_900,     # $49/seat/mo
    },
}


INCLUDED_SEATS: dict[str, int] = {
    "starter": 1,
    "professional": 1,
    "team": 3,
    "business": 5,
}


SUPPORTED_CURRENCIES: tuple[str, ...] = ("INR", "USD")


# ---------------------------------------------------------------------------
# Back-compat shims (legacy single-currency callers).
# ---------------------------------------------------------------------------

PLAN_AMOUNTS_PAISE = {p: {"monthly": PLAN_AMOUNTS[p]["INR"]["monthly"]} for p in PLAN_AMOUNTS}
MONTHLY_AMOUNTS_PAISE = {p: PLAN_AMOUNTS[p]["INR"]["monthly"] for p in PLAN_AMOUNTS}
PER_SEAT_PAISE = {p: PER_SEAT_AMOUNTS[p]["INR"] for p in PER_SEAT_AMOUNTS}


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
    currency = normalize_currency(currency)
    return PER_SEAT_AMOUNTS.get(plan_slug, {}).get(currency, 0)
