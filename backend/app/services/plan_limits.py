"""
plan_limits.py
==============
Monthly usage quotas per plan tier.
-1 means unlimited.

Tier overview (effective when BILLING_ENABLED=true):
  - Starter:      free forever, solo use.
  - Professional: $49/mo (₹1,999), up to 5 collaborators.
  - Expert:       $99/mo (₹3,999), up to 20 collaborators, audit log.
  - Beta:         open-beta override (BILLING_ENABLED=false). Every user
                  resolves to Beta while billing is off — see plan_guard.py.
"""
from __future__ import annotations
from typing import TypedDict


class UsageLimits(TypedDict):
    api_calls_per_month: int      # Total AI / query calls
    pipeline_runs_per_month: int  # Pipeline executions
    datasets_per_month: int       # New dataset uploads this month
    storage_bytes: int            # Cumulative storage cap (-1 = unlimited)
    max_team_members: int         # Max collaborators allowed (-1 = unlimited)
    data_scan_bytes_per_month: int  # Bytes scanned by DuckDB per month (-1 = unlimited)
    included_seats: int           # Seats included in the base plan price
    max_seats: int                # Hard cap on seats (-1 = unlimited)
    token_budget_per_month: int   # Internal token budget (-1 = unlimited)


USAGE_LIMITS: dict[str, UsageLimits] = {
    # Open beta tier. Every user resolves here while BILLING_ENABLED=false.
    # Generous on cheap resources but conservative on AI calls because every
    # LLM request has real cost. When billing is turned on, users fall back
    # to the plan stored on their User row (defaults to "Starter").
    "Beta": {
        "api_calls_per_month": 500,
        "pipeline_runs_per_month": 2_000,
        "datasets_per_month": 200,
        "storage_bytes": 20 * 1024 * 1024 * 1024,               # 20 GB
        "max_team_members": 1,
        "data_scan_bytes_per_month": 200 * 1024 * 1024 * 1024,  # 200 GB
        "included_seats": 1,
        "max_seats": 1,
        "token_budget_per_month": 5_000_000,
    },
    # Starter — free forever, solo use only.
    "Starter": {
        "api_calls_per_month": 50,
        "pipeline_runs_per_month": 20,
        "datasets_per_month": 5,
        "storage_bytes": 2 * 1024 * 1024 * 1024,                # 2 GB
        "max_team_members": 1,
        "data_scan_bytes_per_month": 10 * 1024 * 1024 * 1024,   # 10 GB
        "included_seats": 1,
        "max_seats": 1,
        "token_budget_per_month": 500_000,
    },
    # Professional — $49/mo (₹1,999), invite up to 5 collaborators.
    "Professional": {
        "api_calls_per_month": 500,
        "pipeline_runs_per_month": 200,
        "datasets_per_month": 100,
        "storage_bytes": 25 * 1024 * 1024 * 1024,               # 25 GB
        "max_team_members": 6,                                   # owner + 5 collaborators
        "data_scan_bytes_per_month": 100 * 1024 * 1024 * 1024,  # 100 GB
        "included_seats": 1,
        "max_seats": 1,
        "token_budget_per_month": 2_000_000,
    },
    # Expert — $99/mo (₹3,999), invite up to 20 collaborators, audit log.
    "Expert": {
        "api_calls_per_month": 2_000,
        "pipeline_runs_per_month": 1_000,
        "datasets_per_month": 500,
        "storage_bytes": 100 * 1024 * 1024 * 1024,              # 100 GB
        "max_team_members": 21,                                  # owner + 20 collaborators
        "data_scan_bytes_per_month": 500 * 1024 * 1024 * 1024,  # 500 GB
        "included_seats": 1,
        "max_seats": 1,
        "token_budget_per_month": 6_000_000,
    },
}

# Human-readable names for error messages
USAGE_FIELD_LABELS: dict[str, str] = {
    "api_calls_per_month": "AI chat calls",
    "pipeline_runs_per_month": "pipeline runs",
    "datasets_per_month": "dataset uploads",
}


def get_limits(plan: str) -> UsageLimits:
    """Return limits for a plan.  Falls back to Starter for unknown values."""
    normalized = plan.strip().title()
    return USAGE_LIMITS.get(normalized, USAGE_LIMITS["Starter"])


def compute_effective_limits(plan: str, quantity: int = 1) -> UsageLimits:
    """Return limits for the given plan.

    The seat-scaling model has been removed in the new 3-tier pricing.
    This function is kept for backward-compatibility with existing call
    sites; the ``quantity`` argument is silently ignored.
    """
    return get_limits(plan)
