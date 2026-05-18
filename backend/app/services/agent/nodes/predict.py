"""predict node — regression, moving-average, and naive forecasting via DuckDB SQL.

Bypasses the planner entirely (read-only, instant like the analyse node).

Three prediction types:
  regression       — OLS linear regression of y on x; returns coefficients +
                     scatter/fitted-line chart
  moving_average   — rolling trailing average; returns actual + MA line chart
  forecast         — linear trend extrapolation N periods forward; returns
                     actual + dashed forecast line chart
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from ...llm_provider import get_chat_model
from ...echarts_builder import build_regression_chart, build_forecast_chart
from ..model_router import select_model
from ..state import AgentState
from .planner import _dumps
from ...prediction_service import (
    forecast_series,
    linear_regression,
    moving_average,
)

_logger = logging.getLogger(__name__)

_llm_cache: dict = {}


def _get_llm():
    model = select_model("classify")
    cached = _llm_cache.get(model)
    if cached is None:
        cached = get_chat_model(model=model, temperature=0)
        _llm_cache[model] = cached
    return cached


# ---------------------------------------------------------------------------
# LLM parse prompt
# ---------------------------------------------------------------------------

_PARSE_PROMPT = """\
You are a data analyst assistant. Parse the user's prediction/forecasting request and return a JSON spec.

DATASET SCHEMA (column → type):
{schema}

NUMERIC COLUMNS : {numeric_cols}
TEMPORAL COLUMNS: {temporal_cols}

USER REQUEST:
{user_request}

Return ONLY valid JSON (no markdown fences) with exactly these fields:
{{
  "prediction_type": "regression" | "moving_average" | "forecast",
  "x_col": "column_name",
  "y_col": "column_name",
  "window": 7,
  "periods_ahead": 3,
  "reasoning": "one-line explanation"
}}

Rules:
- "regression"     → x_col is numeric (independent var), y_col is numeric (target)
- "moving_average" → x_col is date/temporal, y_col is numeric; window default 7
- "forecast"       → x_col is date/temporal, y_col is numeric; periods_ahead default 3 (max 12)
- Only use column names that appear in SCHEMA exactly as listed
- If the user mentions a specific column, use it; otherwise choose the most sensible defaults
- For "regression" without specified columns: pick first numeric as x, second numeric as y
- For "moving_average"/"forecast" without specified columns: pick first temporal as x_col,
  first numeric as y_col (fallback: first numeric for both if no temporal columns)
- "window" and "periods_ahead" have the defaults shown above; only override if the user specifies\
"""


# ---------------------------------------------------------------------------
# Column classifiers
# ---------------------------------------------------------------------------

_NUMERIC_KW = {
    "int", "float", "double", "bigint", "decimal", "numeric",
    "real", "smallint", "tinyint", "hugeint", "ubigint", "uinteger",
}
_TEMPORAL_KW = {"date", "timestamp", "datetime", "time"}


def _classify_columns(schema: dict) -> tuple[list[str], list[str]]:
    """Return (numeric_cols, temporal_cols) from a column→dtype schema dict."""
    numeric, temporal = [], []
    for col, dtype in schema.items():
        if not isinstance(dtype, str):
            continue
        dl = dtype.lower()
        if any(kw in dl for kw in _TEMPORAL_KW):
            temporal.append(col)
        elif any(kw in dl for kw in _NUMERIC_KW):
            numeric.append(col)
    return numeric, temporal


def _primary_table(state: AgentState) -> str:
    registry: dict = state.get("table_registry") or {}
    stored = registry.get("__primary_alias__")
    if isinstance(stored, str) and stored and stored != "dataset":
        return stored
    for name, entry in registry.items():
        if name == "__primary_alias__":
            continue
        if isinstance(entry, dict) and entry.get("pipeline_step_number", -1) == 0 and name != "dataset":
            return name
    return "dataset"


# ---------------------------------------------------------------------------
# Result formatters
# ---------------------------------------------------------------------------

def _fmt_regression(coeff: dict, prediction_type_label: str = "Linear Regression") -> str:
    if "error" in coeff:
        return f"Could not compute regression: {coeff['error']}"
    slope = coeff.get("slope", "?")
    intercept = coeff.get("intercept", "?")
    r2 = coeff.get("r2", "?")
    count = coeff.get("count", "?")
    x_col = coeff.get("x_col", "x")
    y_col = coeff.get("y_col", "y")
    direction = "positive" if isinstance(slope, (int, float)) and slope > 0 else "negative"
    r2_str = f"{r2:.3f}" if isinstance(r2, float) else str(r2)
    fit_quality = (
        "excellent" if isinstance(r2, float) and r2 >= 0.85
        else "good" if isinstance(r2, float) and r2 >= 0.6
        else "moderate" if isinstance(r2, float) and r2 >= 0.35
        else "weak"
    )
    return (
        f"### {prediction_type_label}\n\n"
        f"**Equation**: `{y_col} = {slope} × {x_col} + {intercept}`  \n"
        f"**R²** = {r2_str} ({fit_quality} fit)  \n"
        f"**Rows used**: {count}  \n"
        f"**Trend**: {direction} — as `{x_col}` increases, `{y_col}` tends to "
        f"{'increase' if direction == 'positive' else 'decrease'} by **{abs(slope) if isinstance(slope, float) else slope}** per unit."
    )


def _fmt_moving_average(rows: list[dict], date_col: str, value_col: str, window: int) -> str:
    if not rows:
        return "No data available for moving average."
    if "error" in rows[0]:
        return f"Error computing moving average: {rows[0]['error']}"
    n = len(rows)
    last = rows[-1]
    last_val = last.get(value_col, "?")
    last_ma = last.get("moving_avg", "?")
    return (
        f"### {window}-Period Moving Average\n\n"
        f"Computed over **{n}** data points.  \n"
        f"Latest value: **{last_val}** → {window}-period MA: **{last_ma}**  \n\n"
        "The chart shows the raw series (area) alongside the smoothed trend (line)."
    )


def _fmt_forecast(rows: list[dict], date_col: str, value_col: str, periods_ahead: int) -> str:
    if not rows:
        return "No data available for forecasting."
    if "error" in rows[0]:
        return f"Error computing forecast: {rows[0]['error']}"
    actual = [r for r in rows if not r.get("is_forecast")]
    forecast = [r for r in rows if r.get("is_forecast")]
    if not forecast:
        return "Could not generate forecast rows."
    last_actual = actual[-1].get(value_col, "?") if actual else "?"
    projections = "\n".join(
        f"- **{r.get(date_col, '?')}**: {r.get('predicted', '?')}"
        for r in forecast
    )
    return (
        f"### {periods_ahead}-Period Linear Forecast\n\n"
        f"Based on a linear trend fitted to **{len(actual)}** historical data points.  \n"
        f"Last observed `{value_col}`: **{last_actual}**\n\n"
        f"**Projected values:**\n{projections}\n\n"
        "_Note: Forecast assumes the historical linear trend continues. "
        "Accuracy degrades with longer horizons._"
    )


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------

async def predict(state: AgentState) -> dict:
    """LangGraph node: parse prediction request, run DuckDB SQL, return results + chart."""
    messages = state.get("messages", [])
    user_request: str = messages[-1].content if messages else ""
    schema: dict = state.get("schema", {})
    session_id: str = state.get("session_id", "")
    table_name: str = _primary_table(state)

    numeric_cols, temporal_cols = _classify_columns(schema)

    # ── 1. LLM: parse the prediction spec ────────────────────────────────────
    parse_prompt = _PARSE_PROMPT.format(
        schema=_dumps(schema),
        numeric_cols=json.dumps(numeric_cols),
        temporal_cols=json.dumps(temporal_cols),
        user_request=user_request,
    )

    spec: dict[str, Any] = {}
    try:
        llm_response = await asyncio.wait_for(
            _get_llm().ainvoke(
                [
                    SystemMessage(content=parse_prompt),
                    HumanMessage(content=user_request),
                ]
            ),
            timeout=15,
        )
        raw = str(llm_response.content).strip()
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1].lstrip("json").strip() if len(parts) > 1 else raw
        spec = json.loads(raw)
    except (asyncio.TimeoutError, json.JSONDecodeError, Exception) as exc:
        _logger.warning("predict: spec parse failed (%s), defaulting to regression", exc)
        spec = {
            "prediction_type": "regression",
            "x_col": numeric_cols[0] if numeric_cols else list(schema.keys())[0],
            "y_col": numeric_cols[1] if len(numeric_cols) > 1 else list(schema.keys())[-1],
        }

    prediction_type: str = spec.get("prediction_type", "regression")
    x_col: str = spec.get("x_col", "")
    y_col: str = spec.get("y_col", "")
    window: int = max(2, min(int(spec.get("window") or 7), 90))
    periods_ahead: int = max(1, min(int(spec.get("periods_ahead") or 3), 12))

    # Validate / fill missing columns
    all_cols = list(schema.keys())
    if x_col not in schema:
        x_col = temporal_cols[0] if temporal_cols else (numeric_cols[0] if numeric_cols else all_cols[0])
    if y_col not in schema:
        y_col = numeric_cols[1] if len(numeric_cols) > 1 else (numeric_cols[0] if numeric_cols else all_cols[-1])

    # ── 2. Run prediction via DuckDB ─────────────────────────────────────────
    query_results: list[dict] = []
    response_text: str = ""
    tile: dict | None = None

    if not session_id:
        response_text = "No active data session. Please start a chat with a dataset first."

    elif prediction_type == "regression":
        result = linear_regression(session_id, table_name, x_col, y_col)
        coeff = result.get("coefficients", {})
        points = result.get("points", [])
        query_results = points
        response_text = _fmt_regression(coeff, f"Linear Regression: {y_col} ~ {x_col}")
        if points and "error" not in coeff:
            try:
                r2_val = coeff.get("r2")
                echarts_cfg = build_regression_chart(
                    points,
                    x_col=x_col,
                    y_col=y_col,
                    r2=float(r2_val) if r2_val is not None else None,
                    title=f"Regression: {y_col} ~ {x_col}",
                )
                tile = {
                    "chart_id": str(uuid.uuid4()),
                    "title": f"Regression: {y_col} ~ {x_col}",
                    "chart_type": "scatter",
                    "echarts_config": echarts_cfg,
                    "saveable": True,
                }
            except Exception as exc:
                _logger.warning("predict: regression chart failed: %s", exc)

    elif prediction_type == "moving_average":
        rows = moving_average(session_id, table_name, x_col, y_col, window=window)
        query_results = rows
        response_text = _fmt_moving_average(rows, x_col, y_col, window)
        if rows and "error" not in rows[0]:
            try:
                echarts_cfg = build_forecast_chart(
                    rows,
                    x_col=x_col,
                    actual_col=y_col,
                    predicted_col="moving_avg",
                    title=f"{window}-Period MA — {y_col}",
                )
                tile = {
                    "chart_id": str(uuid.uuid4()),
                    "title": f"{window}-Period Moving Average — {y_col}",
                    "chart_type": "line",
                    "echarts_config": echarts_cfg,
                    "saveable": True,
                }
            except Exception as exc:
                _logger.warning("predict: moving_average chart failed: %s", exc)

    elif prediction_type == "forecast":
        rows = forecast_series(session_id, table_name, x_col, y_col, periods_ahead=periods_ahead)
        query_results = rows
        response_text = _fmt_forecast(rows, x_col, y_col, periods_ahead)
        if rows and "error" not in rows[0]:
            try:
                echarts_cfg = build_forecast_chart(
                    rows,
                    x_col=x_col,
                    actual_col=y_col,
                    predicted_col="predicted",
                    title=f"{periods_ahead}-Period Forecast — {y_col}",
                )
                tile = {
                    "chart_id": str(uuid.uuid4()),
                    "title": f"Forecast — {y_col}",
                    "chart_type": "line",
                    "echarts_config": echarts_cfg,
                    "saveable": True,
                }
            except Exception as exc:
                _logger.warning("predict: forecast chart failed: %s", exc)

    else:
        response_text = f"Unknown prediction type: {prediction_type!r}."

    result_dict: dict[str, Any] = {
        "messages": [AIMessage(content=response_text)],
        "final_response": response_text,
        "query_results": query_results,
    }
    if tile:
        result_dict["chart_config"] = tile
    return result_dict
