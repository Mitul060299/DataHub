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

    Professional $149/mo   (~₹6,999)
    Team         $299/mo   (~₹14,999)
    Business     $599/mo   (~₹29,999)
    Extra seat (Team)     $49/mo
    Extra seat (Business) $79/mo
"""

from __future__ import annotations

import os

_IS_TEST = os.getenv("RAZORPAY_KEY_ID", "").startswith("rzp_test_")

# Test-mode plan ID (single plan that covers both INR/USD in test mode).
_TEST_PLAN = "plan_SW9abXgqVnqDXQ"

# ---------------------------------------------------------------------------
# Razorpay plan IDs (created in the Razorpay dashboard).
# Override the USD plan IDs via env var before the international launch:
#     RAZORPAY_PRO_USD_PLAN, RAZORPAY_TEAM_USD_PLAN, RAZORPAY_BUSINESS_USD_PLAN
# ---------------------------------------------------------------------------

RAZORPAY_PLAN_IDS: dict[str, dict[str, dict[str, str]]] = {
    "professional": {
        "INR": {
            "monthly": _TEST_PLAN if _IS_TEST else "plan_SgY6POEnN2ZzRA",
        },
        "USD": {
            "monthly": _TEST_PLAN if _IS_TEST else os.getenv("RAZORPAY_PRO_USD_PLAN", "plan_USD_PRO_REPLACE_ME"),
        },
    },
    "team": {
        "INR": {
            "monthly": _TEST_PLAN if _IS_TEST else "plan_SgY7HxP1BqrRIH",
        },
        "USD": {
            "monthly": _TEST_PLAN if _IS_TEST else os.getenv("RAZORPAY_TEAM_USD_PLAN", "plan_USD_TEAM_REPLACE_ME"),
        },
    },
    "business": {
        "INR": {
            "monthly": _TEST_PLAN if _IS_TEST else "plan_SgY7ow2NuF1cwi",
        },
        "USD": {
            "monthly": _TEST_PLAN if _IS_TEST else os.getenv("RAZORPAY_BUSINESS_USD_PLAN", "plan_USD_BUSINESS_REPLACE_ME"),
        },
    },
}


# ---------------------------------------------------------------------------
# Plan amounts (smallest currency unit). Used for proration and add-ons.
# ---------------------------------------------------------------------------

PLAN_AMOUNTS: dict[str, dict[str, dict[str, int]]] = {
    "professional": {
        "INR": {"monthly": 699_900},   # ₹6,999/mo
        "USD": {"monthly": 14_900},    # $149/mo
    },
    "team": {
        "INR": {"monthly": 1_499_900}, # ₹14,999/mo (3 seats)
        "USD": {"monthly": 29_900},    # $299/mo  (3 seats)
    },
    "business": {
        "INR": {"monthly": 2_999_900}, # ₹29,999/mo (5 seats)
        "USD": {"monthly": 59_900},    # $599/mo   (5 seats)
    },
}


# ---------------------------------------------------------------------------
# Per-seat overage amounts (smallest unit / month).
# ---------------------------------------------------------------------------

PER_SEAT_AMOUNTS: dict[str, dict[str, int]] = {
    "team": {
        "INR": 249_900,   # ₹2,499/seat/mo
        "USD": 4_900,     # $49/seat/mo
    },
    "business": {
        "INR": 399_900,   # ₹3,999/seat/mo
        "USD": 7_900,     # $79/seat/mo
    },
}


INCLUDED_SEATS: dict[str, int] = {
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
