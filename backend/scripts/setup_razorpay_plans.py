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


# Amounts in paise (INR × 100)
# Monthly: INR/user/month × 100
# Annual: full-year upfront charge (monthly × 12 × 0.80)
PLANS = [
    # Monthly
    {
        "interval": 1,
        "tier": "professional",
        "cycle": "monthly",
        "amount": 329900,
        "name": "DataHub Professional Monthly",
    },
    {
        "interval": 1,
        "tier": "team",
        "cycle": "monthly",
        "amount": 619900,
        "name": "DataHub Team Monthly",
    },
    {
        "interval": 1,
        "tier": "business",
        "cycle": "monthly",
        "amount": 829900,
        "name": "DataHub Business Monthly",
    },
    # Annual (single upfront charge, 12-month interval)
    {
        "interval": 12,
        "tier": "professional",
        "cycle": "annual",
        "amount": 3167040,
        "name": "DataHub Professional Annual",
    },
    {
        "interval": 12,
        "tier": "team",
        "cycle": "annual",
        "amount": 5951040,
        "name": "DataHub Team Annual",
    },
    {
        "interval": 12,
        "tier": "business",
        "cycle": "annual",
        "amount": 7966080,
        "name": "DataHub Business Annual",
    },
]


def main() -> int:
    client = _get_client()

    print("Creating Razorpay plans...\n")
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
        print(
            f"✓ {plan['tier']:15} {plan['cycle']:8}  "
            f"plan_id: {result['id']}  amount: ₹{plan['amount'] // 100:,}"
        )

    print("\nCopy the plan IDs above into backend/app/razorpay_plans.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
