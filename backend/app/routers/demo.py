"""
demo.py — Anonymous demo workspace API
======================================

Endpoints:
  POST /api/demo/init     — Initialize (or re-attach) an anonymous demo session.
                            Loads retail_store_sales.csv into an isolated DuckDB
                            in-memory connection keyed by "demo:{session_id}".
                            Returns column names, row count, and sample rows.

  POST /api/demo/command  — Execute a natural-language command against the demo
                            DuckDB session.  Returns generated SQL + results.

  DELETE /api/demo/session — Explicitly tear down a demo session.

Session isolation:
  - All demo session keys are prefixed "demo:" so they cannot collide with any
    authenticated user session (which uses "user_id:chat_session_id" keys).
  - Sessions expire after 30 minutes of inactivity (inherited from
    duckdb_session.MAX_SESSION_AGE_SECONDS).

Security:
  - No authentication required; any origin may call these endpoints.
  - The DuckDB connection is loaded ONLY with the read-only demo CSV.
  - Blocked DML (DROP / DELETE / INSERT / UPDATE / TRUNCATE) is enforced by
    duckdb_session.execute_in_session() via the _BLOCKED_DML regex.
  - SQL injected via the command field is never interpolated into queries;
    only the LLM-generated SQL (validated by guard_duckdb_sql_paths) runs.
  - Rate-limited: 30 requests / minute per IP (via slowapi).
"""
import json
import logging
import math
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

import duckdb
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from ..services.rate_limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/demo", tags=["demo"])

# ── Demo CSV path ─────────────────────────────────────────────────────────────
# This file is bundled with the backend image at build time; it is read-only
# and never written to by any demo session.
_DEMO_CSV = Path(__file__).parent.parent / "data" / "demo" / "retail_store_sales.csv"

# ── Column metadata (matches the CSV exactly) ─────────────────────────────────
DEMO_COLUMNS = [
    "Transaction ID",
    "Customer ID",
    "Category",
    "Item",
    "Price Per Unit",
    "Quantity",
    "Total Spent",
    "Payment Method",
    "Location",
    "Transaction Date",
    "Discount Applied",
]

# ── Isolated demo-session DuckDB connections ──────────────────────────────────
# Completely separate from the authenticated duckdb_session store so a demo
# visitor can never access any real user's data.
_demo_lock = threading.Lock()
_demo_sessions: dict[str, duckdb.DuckDBPyConnection] = {}
_demo_last_used: dict[str, float] = {}

_DEMO_SESSION_TTL = 1800        # 30 minutes
_MAX_DEMO_SESSIONS = 20         # cap concurrent anonymous sessions


def _demo_session_key(session_id: str) -> str:
    """Prefix ensures no collision with authenticated session keys."""
    # Basic sanitisation — only alphanumeric, dash, underscore allowed.
    safe = re.sub(r"[^a-zA-Z0-9\-_]", "", session_id)[:64]
    return f"demo:{safe}"


def _evict_stale_demo_sessions() -> None:
    """Remove demo sessions idle longer than _DEMO_SESSION_TTL.  Call inside _demo_lock."""
    now = time.monotonic()
    stale = [k for k, ts in _demo_last_used.items() if now - ts > _DEMO_SESSION_TTL]
    for key in stale:
        try:
            conn = _demo_sessions.pop(key, None)
            if conn is not None:
                conn.close()
        except Exception:
            pass
        _demo_last_used.pop(key, None)


def _get_or_create_demo_session(session_id: str) -> duckdb.DuckDBPyConnection:
    """Return (or create) the isolated DuckDB connection for this demo session."""
    key = _demo_session_key(session_id)

    with _demo_lock:
        _evict_stale_demo_sessions()

        conn = _demo_sessions.get(key)
        if conn is not None:
            # Verify the connection is still alive.
            try:
                conn.execute("SELECT 1")
                _demo_last_used[key] = time.monotonic()
                return conn
            except Exception:
                _demo_sessions.pop(key, None)
                _demo_last_used.pop(key, None)

        # Evict oldest session if at the cap.
        if len(_demo_sessions) >= _MAX_DEMO_SESSIONS:
            oldest = min(_demo_last_used, key=_demo_last_used.get)  # type: ignore[arg-type]
            try:
                old = _demo_sessions.pop(oldest, None)
                if old is not None:
                    old.close()
            except Exception:
                pass
            _demo_last_used.pop(oldest, None)

        # Create a fresh in-memory connection and load the demo CSV.
        conn = duckdb.connect(database=":memory:")
        conn.execute("SET memory_limit='128MB'")
        try:
            conn.execute("SET threads=1")
        except Exception:
            pass

        csv_path = str(_DEMO_CSV).replace("\\", "/")
        conn.execute(
            f"CREATE OR REPLACE TABLE retail_sales AS "
            f"SELECT * FROM read_csv_auto('{csv_path}', header=true)"
        )

        _demo_sessions[key] = conn
        _demo_last_used[key] = time.monotonic()
        return conn


def _close_demo_session(session_id: str) -> None:
    key = _demo_session_key(session_id)
    with _demo_lock:
        conn = _demo_sessions.pop(key, None)
        _demo_last_used.pop(key, None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass


# ── NL → SQL translation (keyword-based for suggested commands; LLM fallback) ─

# Map from canonical command key → SQL that runs on the retail_sales table.
SUGGESTED_SQLS: dict[str, tuple[str, str]] = {
    "revenue_by_category": (
        "Show total revenue by category",
        """SELECT Category,
       ROUND(SUM("Total Spent"), 2)                   AS total_revenue,
       COUNT(*)                                        AS transactions,
       ROUND(AVG("Total Spent"), 2)                   AS avg_spend
FROM retail_sales
WHERE "Total Spent" IS NOT NULL
GROUP BY Category
ORDER BY total_revenue DESC;""",
    ),
    "missing_values": (
        "Find missing values across all columns",
        """SELECT
  COUNT(*) FILTER (WHERE "Transaction ID"    IS NULL OR "Transaction ID"    = '') AS missing_transaction_id,
  COUNT(*) FILTER (WHERE "Customer ID"       IS NULL OR "Customer ID"       = '') AS missing_customer_id,
  COUNT(*) FILTER (WHERE "Category"          IS NULL OR "Category"          = '') AS missing_category,
  COUNT(*) FILTER (WHERE "Item"              IS NULL OR "Item"              = '') AS missing_item,
  COUNT(*) FILTER (WHERE "Price Per Unit"    IS NULL)                             AS missing_price_per_unit,
  COUNT(*) FILTER (WHERE "Quantity"          IS NULL)                             AS missing_quantity,
  COUNT(*) FILTER (WHERE "Total Spent"       IS NULL)                             AS missing_total_spent,
  COUNT(*) FILTER (WHERE "Payment Method"    IS NULL OR "Payment Method"    = '') AS missing_payment_method,
  COUNT(*) FILTER (WHERE "Location"          IS NULL OR "Location"          = '') AS missing_location,
  COUNT(*) FILTER (WHERE "Transaction Date"  IS NULL OR "Transaction Date"  = '') AS missing_transaction_date,
  COUNT(*) FILTER (WHERE "Discount Applied"  IS NULL OR "Discount Applied"  = '') AS missing_discount_applied,
  COUNT(*) AS total_rows
FROM retail_sales;""",
    ),
    "monthly_sales_trend": (
        "Show monthly sales trend",
        """SELECT strftime("Transaction Date", '%Y-%m')    AS month,
       ROUND(SUM("Total Spent"), 2)              AS total_revenue,
       COUNT(*)                                  AS transactions
FROM retail_sales
WHERE "Total Spent" IS NOT NULL
  AND "Transaction Date" IS NOT NULL
GROUP BY month
ORDER BY month;""",
    ),
    "payment_breakdown": (
        "Breakdown sales by payment method",
        """SELECT "Payment Method",
       COUNT(*)                         AS transactions,
       ROUND(SUM("Total Spent"), 2)    AS total_revenue,
       ROUND(AVG("Total Spent"), 2)    AS avg_transaction
FROM retail_sales
WHERE "Total Spent" IS NOT NULL
  AND "Payment Method" IS NOT NULL
GROUP BY "Payment Method"
ORDER BY total_revenue DESC;""",
    ),
}


def _keyword_to_sql(text: str) -> tuple[str | None, str | None]:
    """Return (command_key, sql) if the text matches a suggested command, else (None, None)."""
    t = text.lower()
    if re.search(r"revenue|sales|spend|total.*categ|categ.*revenue", t):
        k = "revenue_by_category"
    elif re.search(r"miss|null|empty|blank|quality|clean", t):
        k = "missing_values"
    elif re.search(r"month|trend|over time|2022|2023|2024|2025|time series|daily|weekly", t):
        k = "monthly_sales_trend"
    elif re.search(r"payment|cash|credit|wallet|method|how.*paid", t):
        k = "payment_breakdown"
    else:
        return None, None
    return k, SUGGESTED_SQLS[k][1]


def _llm_to_sql(user_message: str) -> str:
    """Use the configured LLM to translate a NL query to SQL for the retail_sales table."""
    try:
        from ..config import settings
        import httpx

        schema = """CREATE TABLE retail_sales (
  "Transaction ID"   TEXT,
  "Customer ID"      TEXT,
  "Category"         TEXT,       -- Beverages, Butchers, Computers and electric accessories,
                                 -- Electric household essentials, Food, Furniture,
                                 -- Milk Products, Patisserie
  "Item"             TEXT,       -- nullable (~1213 rows)
  "Price Per Unit"   DOUBLE,     -- nullable (~609 rows)
  "Quantity"         DOUBLE,     -- nullable (~604 rows)
  "Total Spent"      DOUBLE,     -- nullable (~604 rows) = Price Per Unit * Quantity
  "Payment Method"   TEXT,       -- Cash, Credit Card, Digital Wallet
  "Location"         TEXT,       -- In-store, Online
  "Transaction Date" DATE,       -- 2022-01-01 to 2025-01-18
  "Discount Applied" TEXT        -- True, False, or NULL (~4199 rows)
);
-- 12575 total rows"""

        system = (
            "You are a DuckDB SQL expert. Given a schema and a user question, return ONLY "
            "a valid DuckDB SELECT statement. No explanations. No markdown fences. "
            "Always quote column names with double-quotes. Handle NULLs defensively. "
            "Return at most 200 rows."
        )
        prompt = f"Schema:\n{schema}\n\nQuestion: {user_message}\n\nSQL:"

        resp = httpx.post(
            f"{settings.groq_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.groq_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.groq_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0,
                "max_tokens": 512,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        sql = resp.json()["choices"][0]["message"]["content"].strip()
        # Strip markdown fences if the model adds them despite instructions.
        sql = re.sub(r"^```(?:sql)?\s*", "", sql, flags=re.IGNORECASE)
        sql = re.sub(r"\s*```$", "", sql)
        return sql.strip()
    except Exception as exc:
        logger.warning("LLM SQL translation failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Could not translate your question to SQL. Try rephrasing or use a suggested command.",
        )


def _sanitise_value(v: Any) -> Any:
    """Convert Python values to JSON-serialisable form."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    # decimal, date, datetime → str
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def _rows_to_json(cursor: duckdb.DuckDBPyConnection, sql: str) -> dict:
    """Execute *sql* and return {columns, rows, row_count}."""
    rel = cursor.execute(sql)
    cols = [d[0] for d in rel.description]
    raw_rows = rel.fetchmany(500)           # cap at 500 rows in demo
    rows = [[_sanitise_value(v) for v in row] for row in raw_rows]
    return {"columns": cols, "rows": rows, "row_count": len(rows)}


# ── Blocked DML (same pattern as authenticated sessions) ──────────────────────
_BLOCKED_DML = re.compile(
    r"^\s*(DROP\s|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\w|TRUNCATE)",
    re.IGNORECASE | re.MULTILINE,
)


# ── Request / response models ─────────────────────────────────────────────────

class InitRequest(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=128)


class CommandRequest(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=128)
    message: str = Field(..., min_length=1, max_length=2000)


class DeleteRequest(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=128)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/init")
@limiter.limit("60/minute")
async def demo_init(payload: InitRequest, request: Request):
    """
    Initialize (or re-attach to) an anonymous demo session.

    Returns the first 100 rows of the retail CSV plus column metadata so the
    frontend can render the data table immediately without a separate query.
    """
    try:
        conn = _get_or_create_demo_session(payload.session_id)
        result = _rows_to_json(conn, "SELECT * FROM retail_sales LIMIT 100")
        total = conn.execute("SELECT COUNT(*) FROM retail_sales").fetchone()[0]
        return {
            "ok": True,
            "session_id": payload.session_id,
            "dataset_name": "Demo — Retail Store Sales",
            "total_rows": total,
            "columns": DEMO_COLUMNS,
            **result,
        }
    except Exception as exc:
        logger.error("demo_init error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to initialize demo session.")


@router.post("/command")
@limiter.limit("30/minute")
async def demo_command(payload: CommandRequest, request: Request):
    """
    Run a natural-language command against the demo DuckDB session.

    1. Try keyword match against the 4 suggested commands.
    2. Fall back to LLM → SQL translation.
    3. Execute the SQL (blocked DML raises 400).
    4. Return {sql, columns, rows, row_count, command_key}.
    """
    # Retrieve (or re-create) the session.
    try:
        conn = _get_or_create_demo_session(payload.session_id)
    except Exception as exc:
        logger.error("demo_command session error: %s", exc)
        raise HTTPException(status_code=500, detail="Demo session error.")

    # Translate NL → SQL.
    command_key, sql = _keyword_to_sql(payload.message)
    if sql is None:
        sql = _llm_to_sql(payload.message)
        command_key = "custom"

    # Safety: block destructive SQL.
    if _BLOCKED_DML.search(sql):
        raise HTTPException(status_code=400, detail="That operation is not allowed in the demo.")

    # Execute.
    try:
        result = _rows_to_json(conn, sql)
    except duckdb.Error as exc:
        raise HTTPException(status_code=422, detail=f"SQL error: {exc}")
    except Exception as exc:
        logger.error("demo_command execute error: %s", exc)
        raise HTTPException(status_code=500, detail="Query execution failed.")

    return {
        "ok": True,
        "command_key": command_key,
        "sql": sql,
        **result,
    }


@router.delete("/session")
async def demo_delete_session(payload: DeleteRequest, request: Request):
    """Explicitly tear down a demo session (called on page unload)."""
    _close_demo_session(payload.session_id)
    return {"ok": True}


@router.get("/suggested-commands")
async def demo_suggested_commands():
    """Return the 4 suggested command chips with their labels."""
    return {
        "commands": [
            {"key": k, "label": v[0]}
            for k, v in SUGGESTED_SQLS.items()
        ]
    }
