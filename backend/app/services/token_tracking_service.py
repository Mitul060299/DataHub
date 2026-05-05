"""
token_tracking_service.py
=========================
Fire-and-forget token logging and budget enforcement for all Groq API calls.

Usage pattern (in any service that calls Groq):

    from .token_tracking_service import log_call, check_token_budget, calc_cost_score

    input_tok = output_tok = 0
    try:
        resp = httpx.post(...)
        usage = resp.json().get("usage", {})
        input_tok = usage.get("prompt_tokens", 0)
        output_tok = usage.get("completion_tokens", 0)
        ...
    finally:
        log_call(
            user_id=user_id,
            session_id=session_id,
            model_used=model,
            query_type="plan",
            input_tokens=input_tok,
            output_tokens=output_tok,
            dataset_rows=row_count,
        )

    # Soft-limit check (call BEFORE the heavy LLM call):
    check_token_budget(user_id, plan, db)

Design notes
------------
* log_call() is fully non-blocking (spawns a daemon thread).  It never raises.
* check_token_budget() raises HTTPException(429) when the token budget is
  exhausted.  It reads from a fast aggregation query, never from usage_logs row
  by row.
* cost_score = input_tokens + (output_tokens * 2) + (dataset_rows / 1000 * 10)
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import text

from ..db import SessionLocal

logger = logging.getLogger(__name__)

QueryType = Literal["classify", "plan", "execute", "fix", "insights", "chat", "suggest", "unknown"]

# ---------------------------------------------------------------------------
# Plan token budgets (monthly, per billing user)
# These are INTERNAL — never exposed to the user directly.
# ---------------------------------------------------------------------------
TOKEN_BUDGETS: dict[str, int] = {
    "Free":         500_000,
    "Starter":    1_500_000,
    "Professional": 3_000_000,
    "Team":         8_000_000,
    "Business":    20_000_000,
    "Enterprise":  -1,          # unlimited
}

_SOFT_LIMIT_MESSAGE = (
    "You've used your AI capacity for this month. "
    "Upgrade to continue or wait for next month's reset."
)


def calc_cost_score(
    input_tokens: int,
    output_tokens: int,
    dataset_rows: int = 0,
) -> int:
    """Return the integer cost score for one API call."""
    return int(input_tokens + output_tokens * 2 + (dataset_rows / 1000) * 10)


def _current_period() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m")


def _write_log(
    user_id: str,
    session_id: str,
    model_used: str,
    query_type: str,
    input_tokens: int,
    output_tokens: int,
    dataset_rows: int,
    cost_score: int,
) -> None:
    """Insert one row into usage_logs.  Runs inside a background thread."""
    db = SessionLocal()
    try:
        db.execute(
            text(
                """
                INSERT INTO usage_logs
                    (user_id, session_id, timestamp, model_used, query_type,
                     input_tokens, output_tokens, cost_score, dataset_rows)
                VALUES
                    (:user_id, :session_id, now(), :model_used, :query_type,
                     :input_tokens, :output_tokens, :cost_score, :dataset_rows)
                """
            ),
            {
                "user_id": user_id,
                "session_id": session_id,
                "model_used": model_used,
                "query_type": query_type,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_score": cost_score,
                "dataset_rows": dataset_rows,
            },
        )
        db.commit()
    except Exception as exc:
        logger.debug("token_tracking write failed (non-fatal): %s", exc)
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


def log_call(
    *,
    user_id: str,
    session_id: str = "",
    model_used: str = "",
    query_type: QueryType = "unknown",
    input_tokens: int = 0,
    output_tokens: int = 0,
    dataset_rows: int = 0,
) -> None:
    """Fire-and-forget: log one Groq call.  Never raises or blocks the caller."""
    if not user_id:
        return
    score = calc_cost_score(input_tokens, output_tokens, dataset_rows)
    t = threading.Thread(
        target=_write_log,
        args=(user_id, session_id, model_used, query_type,
              input_tokens, output_tokens, dataset_rows, score),
        daemon=True,
        name="token-log",
    )
    t.start()


def get_token_usage(user_id: str, period: str | None = None) -> dict:
    """Return aggregated token stats for *user_id* in the given period.

    Returns a dict with keys:
      total_input_tokens, total_output_tokens, total_api_calls,
      total_cost_score, period
    """
    period = period or _current_period()
    start = f"{period}-01"
    db = SessionLocal()
    try:
        row = db.execute(
            text(
                """
                SELECT
                    COALESCE(SUM(input_tokens), 0)  AS total_input_tokens,
                    COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
                    COUNT(*)                         AS total_api_calls,
                    COALESCE(SUM(cost_score), 0)     AS total_cost_score
                FROM usage_logs
                WHERE user_id = :uid
                  AND timestamp >= date_trunc('month', :start::timestamptz)
                  AND timestamp <  date_trunc('month', :start::timestamptz) + interval '1 month'
                """
            ),
            {"uid": user_id, "start": start},
        ).fetchone()
        return {
            "period": period,
            "total_input_tokens": int(row.total_input_tokens) if row else 0,
            "total_output_tokens": int(row.total_output_tokens) if row else 0,
            "total_api_calls": int(row.total_api_calls) if row else 0,
            "total_cost_score": int(row.total_cost_score) if row else 0,
        }
    except Exception as exc:
        logger.debug("get_token_usage failed (non-fatal): %s", exc)
        return {
            "period": period,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "total_api_calls": 0,
            "total_cost_score": 0,
        }
    finally:
        db.close()


def get_token_budget(plan: str) -> int:
    """Return the monthly token budget for a plan, or -1 for unlimited."""
    normalized = plan.strip().title()
    return TOKEN_BUDGETS.get(normalized, TOKEN_BUDGETS["Free"])


def check_token_budget(user_id: str, plan: str, db=None) -> None:
    """Raise HTTPException(429) if the user has exhausted their token budget.

    Accepts an optional SQLAlchemy Session; if not provided, opens its own.
    Safe to call before every AI request — the aggregation query is fast
    (indexed on user_id + timestamp).
    """
    budget = get_token_budget(plan)
    if budget == -1:
        return  # unlimited

    usage = get_token_usage(user_id)
    total_tokens = usage["total_input_tokens"] + usage["total_output_tokens"]
    if total_tokens >= budget:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "token_budget_exceeded",
                "message": _SOFT_LIMIT_MESSAGE,
                "tokens_used": total_tokens,
                "token_budget": budget,
                "period": usage["period"],
            },
        )
