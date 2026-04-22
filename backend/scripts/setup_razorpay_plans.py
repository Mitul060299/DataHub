"""Create Razorpay plans for the current DataHub pricing.

Run once per Razorpay account (test + live). After it prints the plan IDs,
copy them into ``backend/app/razorpay_plans.py`` (the ``RAZORPAY_PLAN_IDS`` map).

Usage:
    # Test mode
    RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=yyy \
        python scripts/setup_razorpay_plans.py

    # Live mode
    RAZORPAY_KEY_ID=rzp_live_xxx RAZORPAY_KEY_SECRET=yyy \
        python scripts/setup_razorpay_plans.py

Pricing source of truth: ``backend/app/razorpay_plans.py`` (PLAN_AMOUNTS_PAISE).
Keep both files in sync whenever prices change.
"""
import os

import razorpay
from dotenv import load_dotenv


load_dotenv()


def _get_client() -> razorpay.Client:
    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    if not key_id or not key_secret:
        raise RuntimeError("Missing Razorpay credentials. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.")
    return razorpay.Client(auth=(key_id, key_secret))


# Amounts in paise (INR × 100). Monthly billing only — annual is not offered yet.
# Mirrors PLAN_AMOUNTS_PAISE in backend/app/razorpay_plans.py.
PLANS = [
    {
        "tier": "professional",
        "cycle": "monthly",
        "interval": 1,
        "amount": 699900,                              # ₹6,999 / month (1 seat)
        "name": "DataHub Professional Monthly",
    },
    {
        "tier": "team",
        "cycle": "monthly",
        "interval": 1,
        "amount": 1499900,                             # ₹14,999 / month (3 seats included)
        "name": "DataHub Team Monthly",
    },
    {
        "tier": "business",
        "cycle": "monthly",
        "interval": 1,
        "amount": 2999900,                             # ₹29,999 / month (5 seats included)
        "name": "DataHub Business Monthly",
    },
]


def main() -> int:
    client = _get_client()
    key_id = os.getenv("RAZORPAY_KEY_ID", "")
    mode = "TEST" if key_id.startswith("rzp_test_") else "LIVE"

    print(f"\nCreating Razorpay plans in {mode} mode (key: {key_id[:14]}…)\n")
    created: list[tuple[str, str]] = []
    for plan in PLANS:
        result = client.plan.create(
            {
                "period": "monthly",
                "interval": plan["interval"],
                "item": {
                    "name": plan["name"],
                    "amount": plan["amount"],
                    "currency": "INR",
                    "description": f"DataHub {plan['tier'].title()} — {plan['cycle']}",
                },
            }
        )
        plan_id = result["id"]
        created.append((plan["tier"], plan_id))
        print(
            f"  ✓ {plan['tier']:13} {plan['cycle']:8}  "
            f"plan_id: {plan_id}  amount: ₹{plan['amount'] // 100:,}"
        )

    print("\n──────────────────────────────────────────────────────────────")
    print("Paste these into backend/app/razorpay_plans.py (RAZORPAY_PLAN_IDS):\n")
    print("RAZORPAY_PLAN_IDS = {")
    for tier, plan_id in created:
        print(f'    "{tier}": {{"monthly": "{plan_id}"}},')
    print("}")
    print("──────────────────────────────────────────────────────────────\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
