"""Create Razorpay plans for the current DataHub pricing.

Run once per Razorpay account (test + live). After it prints the plan IDs,
set them as env vars on Render and redeploy.

Usage:
    # Test mode
    RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=yyy \
        python scripts/setup_razorpay_plans.py

    # Live mode
    RAZORPAY_KEY_ID=rzp_live_xxx RAZORPAY_KEY_SECRET=yyy \
        python scripts/setup_razorpay_plans.py

Pricing (3-tier model, May 2026):
    Starter       FREE  -- no Razorpay plan needed
    Professional  INR 1,999/mo  ($49/mo)
    Expert        INR 3,999/mo  ($99/mo)

After running, set these env vars on Render and redeploy:
    RAZORPAY_PRO_INR_PLAN=<plan_id>
    RAZORPAY_PRO_USD_PLAN=<plan_id>
    RAZORPAY_EXPERT_INR_PLAN=<plan_id>
    RAZORPAY_EXPERT_USD_PLAN=<plan_id>
    BILLING_ENABLED=true
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


# Amounts in minor units (paise for INR, cents for USD). Monthly billing only.
# Starter is FREE -- no Razorpay plan needed.
PLANS = [
    # INR (domestic)
    {"tier": "professional", "currency": "INR", "amount": 199_900, "name": "DataHub Professional Monthly"},
    {"tier": "expert",       "currency": "INR", "amount": 399_900, "name": "DataHub Expert Monthly"},
    # USD (international) -- requires "International Payments" enabled:
    # https://dashboard.razorpay.com/app/payments/international
    {"tier": "professional", "currency": "USD", "amount": 4_900,   "name": "DataHub Professional Monthly (USD)"},
    {"tier": "expert",       "currency": "USD", "amount": 9_900,   "name": "DataHub Expert Monthly (USD)"},
]


def main() -> int:
    client = _get_client()
    key_id = os.getenv("RAZORPAY_KEY_ID", "")
    mode = "TEST" if key_id.startswith("rzp_test_") else "LIVE"

    print(f"\nCreating Razorpay plans in {mode} mode (key: {key_id[:14]}…)\n")
    created: list[tuple[str, str, str]] = []
    for plan in PLANS:
        symbol = "₹" if plan["currency"] == "INR" else "$"
        try:
            result = client.plan.create(
                {
                    "period": "monthly",
                    "interval": 1,
                    "item": {
                        "name": plan["name"],
                        "amount": plan["amount"],
                        "currency": plan["currency"],
                        "description": f"DataHub {plan['tier'].title()} — monthly ({plan['currency']})",
                    },
                }
            )
        except Exception as exc:  # noqa: BLE001
            print(
                f"  FAIL {plan['tier']:13} {plan['currency']:4}  "
                f"FAILED: {exc}"
            )
            if plan["currency"] == "USD":
                print("    (Hint: enable International Payments on the Razorpay dashboard.)")
            continue
        plan_id = result["id"]
        created.append((plan["tier"], plan["currency"], plan_id))
        print(
            f"  OK {plan['tier']:13} {plan['currency']:4}  "
            f"plan_id: {plan_id}  amount: {symbol}{plan['amount'] // 100:,}"
        )

    _env_var_map = {
        ("professional", "INR"): "RAZORPAY_PRO_INR_PLAN",
        ("expert",       "INR"): "RAZORPAY_EXPERT_INR_PLAN",
        ("professional", "USD"): "RAZORPAY_PRO_USD_PLAN",
        ("expert",       "USD"): "RAZORPAY_EXPERT_USD_PLAN",
    }
    print("\n--------------------------------------------------------------")
    print("Set these env vars on Render (Environment tab) and redeploy:")
    for tier, cur, pid in created:
        env_name = _env_var_map.get((tier, cur), f"RAZORPAY_{tier.upper()}_{cur}_PLAN")
        print(f"    {env_name}={pid}")
    print("    BILLING_ENABLED=true")
    print("--------------------------------------------------------------\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
