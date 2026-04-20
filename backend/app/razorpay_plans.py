import os
_IS_TEST = os.getenv("RAZORPAY_KEY_ID", "").startswith("rzp_test_")
_TEST_PLAN = "plan_SW9abXgqVnqDXQ"

# NOTE: Plan IDs need to be recreated in Razorpay dashboard for the new prices.
# Replace the "plan_REPLACE_ME" placeholders with actual live plan IDs after
# creating new plans in the Razorpay dashboard.
RAZORPAY_PLAN_IDS = {
    "professional": {
        "monthly": _TEST_PLAN if _IS_TEST else "plan_REPLACE_ME",
    },
    "team": {
        "monthly": _TEST_PLAN if _IS_TEST else "plan_REPLACE_ME",
    },
    "business": {
        "monthly": _TEST_PLAN if _IS_TEST else "plan_REPLACE_ME",
    },
}

# Base plan prices (paise). Per-account fee; does NOT include extra seats.
PLAN_AMOUNTS_PAISE = {
    "professional": {
        "monthly": 699900,      # ₹6,999/mo
    },
    "team": {
        "monthly": 1499900,     # ₹14,999/mo (includes 3 seats)
    },
    "business": {
        "monthly": 2999900,     # ₹29,999/mo (includes 5 seats)
    },
}

MONTHLY_AMOUNTS_PAISE = {
    "professional": 699900,
    "team": 1499900,
    "business": 2999900,
}

# Per-seat overage prices (paise/month). Only Team and Business support extra seats.
PER_SEAT_PAISE = {
    "team": 249900,             # ₹2,499/seat/mo
    "business": 399900,         # ₹3,999/seat/mo
}

# Included seats per plan (mirrors plan_limits.py for billing math)
INCLUDED_SEATS = {
    "professional": 1,
    "team": 3,
    "business": 5,
}
