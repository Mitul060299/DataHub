"""
routers/usage.py
================
Endpoint for per-user AI token usage summary.

GET /api/usage/summary
  Returns the current user's token usage for the current billing period,
  compared against their plan's internal token budget.
  This data is for internal monitoring only — the UI may display it but
  should never surface the raw budget number as a hard selling point.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..security import get_current_user_id
from ..services.plan_guard import resolve_user_plan
from ..services.token_tracking_service import (
    get_token_budget,
    get_token_usage,
)
from ..services.usage_service import get_usage

router = APIRouter(prefix="/usage", tags=["usage"])
logger = logging.getLogger(__name__)


@router.get("/summary")
def usage_summary(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return AI token usage and message usage for the authenticated user.

    Response shape::

        {
          "period": "2026-05",
          "messages_used": 42,
          "messages_limit": 1500,
          "tokens_used": 187400,
          "token_budget": 3000000,
          "cost_score_total": 415000
        }
    """
    user_id = get_current_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    plan = resolve_user_plan(db, authorization)

    # Message / API-call usage (existing counters)
    from ..services.plan_limits import get_limits
    limits = get_limits(plan)
    msg_limit: int = limits.get("api_calls_per_month", -1)

    try:
        usage_row = get_usage(user_id, db)
        messages_used = int(usage_row.get("api_calls", 0) or 0)
    except Exception:
        messages_used = 0

    # Token usage (new counters)
    tok = get_token_usage(user_id)
    tokens_used = tok["total_input_tokens"] + tok["total_output_tokens"]
    token_budget = get_token_budget(plan)

    return {
        "period": tok["period"],
        "messages_used": messages_used,
        "messages_limit": msg_limit,
        "tokens_used": tokens_used,
        "token_budget": token_budget,
        "cost_score_total": tok["total_cost_score"],
    }
