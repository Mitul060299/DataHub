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


# Amounts in minor units (paise for INR, cents for USD). Monthly billing only.
# Mirrors PLAN_AMOUNTS in backend/app/razorpay_plans.py.
#
# IMPORTANT: USD plans require "International Payments" to be enabled on the
# Razorpay merchant account. Enable it at https://dashboard.razorpay.com/app/payments/international
# before running this script with USD plans.
PLANS = [
    # INR (domestic) — V3 pricing reset (May 2026)
    {"tier": "starter",      "currency": "INR", "amount": 99900,   "name": "DataHub Starter Monthly"},
    {"tier": "professional", "currency": "INR", "amount": 399900,  "name": "DataHub Professional Monthly"},
    {"tier": "team",         "currency": "INR", "amount": 899900,  "name": "DataHub Team Monthly"},
    {"tier": "business",     "currency": "INR", "amount": 1799900, "name": "DataHub Business Monthly"},
    # USD (international) — pending Razorpay International KYC approval
    {"tier": "starter",      "currency": "USD", "amount": 1900,    "name": "DataHub Starter Monthly (USD)"},
    {"tier": "professional", "currency": "USD", "amount": 7900,    "name": "DataHub Professional Monthly (USD)"},
    {"tier": "team",         "currency": "USD", "amount": 17900,   "name": "DataHub Team Monthly (USD)"},
    {"tier": "business",     "currency": "USD", "amount": 34900,   "name": "DataHub Business Monthly (USD)"},
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
                f"  ✗ {plan['tier']:13} {plan['currency']:4}  "
                f"FAILED: {exc}"
            )
            if plan["currency"] == "USD":
                print("    (Hint: enable International Payments on the Razorpay dashboard.)")
            continue
        plan_id = result["id"]
        created.append((plan["tier"], plan["currency"], plan_id))
        print(
            f"  ✓ {plan['tier']:13} {plan['currency']:4}  "
            f"plan_id: {plan_id}  amount: {symbol}{plan['amount'] // 100:,}"
        )

    print("\n──────────────────────────────────────────────────────────────")
    print("INR — paste plan IDs into RAZORPAY_PLAN_IDS in backend/app/razorpay_plans.py:")
    for tier, cur, pid in created:
        if cur == "INR":
            print(f'    "{tier}": {{"INR": {{"monthly": "{pid}"}}, ...}}')
    print("\nUSD — set these env vars on the API server (Render / docker-compose):")
    for tier, cur, pid in created:
        if cur == "USD":
            env_name = f"RAZORPAY_{tier.upper()}_USD_PLAN"
            print(f"    {env_name}={pid}")
    print("──────────────────────────────────────────────────────────────\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
