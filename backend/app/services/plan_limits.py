"""
plan_limits.py
==============
Monthly usage quotas per plan tier.
-1 means unlimited (Enterprise only).

Hybrid pricing model:
  - Free / Starter / Professional: per-account (1 seat each, no extras).
  - Team / Business: base quota + per-seat scaling above included seats.
  - Enterprise: unlimited everything (negotiated fair-use).

Limits are intentionally bounded on every paid tier (no "unlimited"
below Enterprise) to keep gross margin >=75% — see docs/PRICING.md.
"""
from __future__ import annotations
from typing import TypedDict


class UsageLimits(TypedDict):
    api_calls_per_month: int      # Total AI / query calls
    pipeline_runs_per_month: int  # Pipeline executions
    datasets_per_month: int       # New dataset uploads this month
    storage_bytes: int            # Cumulative storage cap (-1 = unlimited)
    max_team_members: int         # Max workspace members (-1 = unlimited)
    data_scan_bytes_per_month: int  # Bytes scanned by DuckDB per month (-1 = unlimited)
    included_seats: int           # Seats included in the base plan price
    max_seats: int                # Hard cap on purchasable seats (-1 = unlimited)
    token_budget_per_month: int   # Internal token budget (-1 = unlimited)


# Per-seat increments for Team and Business plans.
# When `quantity` (purchased seats) exceeds `included_seats`, each extra seat
# adds these amounts to the base quota.
class PerSeatIncrement(TypedDict):
    api_calls_per_month: int
    pipeline_runs_per_month: int
    storage_bytes: int
    data_scan_bytes_per_month: int


PER_SEAT_INCREMENTS: dict[str, PerSeatIncrement] = {
    "Team": {
        "api_calls_per_month": 1_000,
        "pipeline_runs_per_month": 500,
        "storage_bytes": 10 * 1024 * 1024 * 1024,               # +10 GB / seat
        "data_scan_bytes_per_month": 50 * 1024 * 1024 * 1024,   # +50 GB / seat
    },
    "Business": {
        "api_calls_per_month": 2_500,
        "pipeline_runs_per_month": 1_500,
        "storage_bytes": 25 * 1024 * 1024 * 1024,               # +25 GB / seat
        "data_scan_bytes_per_month": 200 * 1024 * 1024 * 1024,  # +200 GB / seat
    },
}


USAGE_LIMITS: dict[str, UsageLimits] = {
    "Free": {
        "api_calls_per_month": 50,
        "pipeline_runs_per_month": 10,
        "datasets_per_month": 3,
        "storage_bytes": 500 * 1024 * 1024,                     # 500 MB
        "max_team_members": 1,
        "data_scan_bytes_per_month": 5 * 1024 * 1024 * 1024,    # 5 GB
        "included_seats": 1,
        "max_seats": 1,
        "token_budget_per_month": 500_000,
    },
    "Starter": {
        "api_calls_per_month": 500,
        "pipeline_runs_per_month": 100,
        "datasets_per_month": 25,
        "storage_bytes": 5 * 1024 * 1024 * 1024,                # 5 GB
        "max_team_members": 1,
        "data_scan_bytes_per_month": 25 * 1024 * 1024 * 1024,   # 25 GB
        "included_seats": 1,
        "max_seats": 1,
        "token_budget_per_month": 1_500_000,
    },
    "Professional": {
        "api_calls_per_month": 1_500,
        "pipeline_runs_per_month": 500,
        "datasets_per_month": 100,
        "storage_bytes": 20 * 1024 * 1024 * 1024,               # 20 GB
        "max_team_members": 1,
        "data_scan_bytes_per_month": 100 * 1024 * 1024 * 1024,  # 100 GB
        "included_seats": 1,
        "max_seats": 1,
        "token_budget_per_month": 3_000_000,
    },
    "Team": {
        "api_calls_per_month": 4_000,
        "pipeline_runs_per_month": 2_000,
        "datasets_per_month": 500,
        "storage_bytes": 100 * 1024 * 1024 * 1024,              # 100 GB
        "max_team_members": 25,                                  # hard cap on purchasable seats
        "data_scan_bytes_per_month": 500 * 1024 * 1024 * 1024,  # 500 GB
        "included_seats": 3,
        "max_seats": 25,
        "token_budget_per_month": 8_000_000,
    },
    "Business": {
        "api_calls_per_month": 15_000,
        "pipeline_runs_per_month": 8_000,
        "datasets_per_month": 2_000,
        "storage_bytes": 500 * 1024 * 1024 * 1024,              # 500 GB
        "max_team_members": 100,                                 # hard cap on purchasable seats
        "data_scan_bytes_per_month": 2 * 1024 * 1024 * 1024 * 1024,  # 2 TB
        "included_seats": 5,
        "max_seats": 100,
        "token_budget_per_month": 20_000_000,
    },
    "Enterprise": {
        "api_calls_per_month": -1,
        "pipeline_runs_per_month": -1,
        "datasets_per_month": -1,
        "storage_bytes": -1,
        "max_team_members": -1,
        "data_scan_bytes_per_month": -1,
        "included_seats": -1,
        "max_seats": -1,
        "token_budget_per_month": -1,
    },
}

# Human-readable names for error messages
USAGE_FIELD_LABELS: dict[str, str] = {
    "api_calls_per_month": "AI chat calls",
    "pipeline_runs_per_month": "pipeline runs",
    "datasets_per_month": "dataset uploads",
}


def get_limits(plan: str) -> UsageLimits:
    """Return the *base* limits for a plan (no seat scaling applied)."""
    # Accept any case (e.g. "free", "Free", "FREE")
    normalized = plan.strip().title()
    return USAGE_LIMITS.get(normalized, USAGE_LIMITS["Free"])


def compute_effective_limits(plan: str, quantity: int = 1) -> UsageLimits:
    """Return limits scaled by purchased seat count.

    For Team/Business, each seat above the included count adds per-seat
    increments to the base quotas.  Unlimited fields (-1) stay unlimited.
    """
    base = dict(get_limits(plan))  # shallow copy
    normalized = plan.strip().title()
    increments = PER_SEAT_INCREMENTS.get(normalized)
    if not increments:
        return UsageLimits(**base)  # type: ignore[typeddict-item]

    included = base["included_seats"]
    extra = max(0, quantity - included)
    if extra == 0:
        return UsageLimits(**base)  # type: ignore[typeddict-item]

    for field, per_seat in increments.items():
        current = base.get(field, 0)
        if current == -1 or per_seat == 0:
            continue  # already unlimited or no increment
        base[field] = current + extra * per_seat

    # max_team_members is the hard cap, not scaled
    return UsageLimits(**base)  # type: ignore[typeddict-item]
