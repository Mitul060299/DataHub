"""
plan_limits.py
==============
Monthly usage quotas per plan tier.
-1 means unlimited.
"""
from __future__ import annotations
from typing import TypedDict


class UsageLimits(TypedDict):
    api_calls_per_month: int      # Total AI / query calls
    pipeline_runs_per_month: int  # Pipeline executions
    datasets_per_month: int       # New dataset uploads this month
    storage_bytes: int            # Cumulative storage cap (-1 = unlimited)


USAGE_LIMITS: dict[str, UsageLimits] = {
    "Free": {
        "api_calls_per_month": 100,
        "pipeline_runs_per_month": 10,
        "datasets_per_month": 3,
        "storage_bytes": 100 * 1024 * 1024,          # 100 MB
    },
    "Professional": {
        "api_calls_per_month": 2_000,
        "pipeline_runs_per_month": 200,
        "datasets_per_month": 50,
        "storage_bytes": 10 * 1024 * 1024 * 1024,    # 10 GB
    },
    "Team": {
        "api_calls_per_month": 10_000,
        "pipeline_runs_per_month": 1_000,
        "datasets_per_month": -1,
        "storage_bytes": 100 * 1024 * 1024 * 1024,   # 100 GB
    },
    "Business": {
        "api_calls_per_month": -1,
        "pipeline_runs_per_month": -1,
        "datasets_per_month": -1,
        "storage_bytes": -1,
    },
    "Enterprise": {
        "api_calls_per_month": -1,
        "pipeline_runs_per_month": -1,
        "datasets_per_month": -1,
        "storage_bytes": -1,
    },
}

# Human-readable names for error messages
USAGE_FIELD_LABELS: dict[str, str] = {
    "api_calls_per_month": "AI chat calls",
    "pipeline_runs_per_month": "pipeline runs",
    "datasets_per_month": "dataset uploads",
}


def get_limits(plan: str) -> UsageLimits:
    return USAGE_LIMITS.get(plan, USAGE_LIMITS["Free"])
