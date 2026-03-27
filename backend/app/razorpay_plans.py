import os
_IS_TEST = os.getenv("RAZORPAY_KEY_ID", "").startswith("rzp_test_")
_TEST_PLAN = "plan_SW9abXgqVnqDXQ"

RAZORPAY_PLAN_IDS = {
    "professional": {
        "monthly": _TEST_PLAN if _IS_TEST else "plan_SOLTBKP1tIuQNo",
        "annual":  _TEST_PLAN if _IS_TEST else "plan_SW8bF6uIpPdXk5",
    },
    "team": {
        "monthly": _TEST_PLAN if _IS_TEST else "plan_SOLTBzQU9djxij",
        "annual":  _TEST_PLAN if _IS_TEST else "plan_SW8c72AwddqKA2",
    },
    "business": {
        "monthly": _TEST_PLAN if _IS_TEST else "plan_SW8cqoA3iBwVR4",
        "annual":  _TEST_PLAN if _IS_TEST else "plan_SW8dS1KtDjepLS",
    },
}

PLAN_AMOUNTS_PAISE = {
    "professional": {
        "monthly": 329900,
        "annual": 3299000,
    },
    "team": {
        "monthly": 619900,
        "annual": 6199000,
    },
    "business": {
        "monthly": 1659900,
        "annual": 16599000,
    },
}

MONTHLY_AMOUNTS_PAISE = {
    "professional": 329900,
    "team": 619900,
    "business": 1659900,
}
