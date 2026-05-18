"""Prediction service — regression, moving average, and naive forecasting via DuckDB SQL.

No pandas / sklearn / statsmodels.  Every function uses DuckDB's built-in
aggregate/window functions and returns plain list[dict] results.

Public API
----------
linear_regression(session_id, table, x_col, y_col)
    → {coefficients: {...}, points: list[dict]}

moving_average(session_id, table, date_col, value_col, window=7)
    → list[{date_col, value_col, moving_avg}]

forecast_series(session_id, table, date_col, value_col, periods_ahead=3)
    → list[{date_col, value_col, is_forecast, predicted}]
    Actual rows have is_forecast=False; projected rows is_forecast=True.
"""
from __future__ import annotations

import logging
from typing import Any

from .duckdb_session import execute_in_session

_logger = logging.getLogger(__name__)


def _q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


# ---------------------------------------------------------------------------
# Linear regression
# ---------------------------------------------------------------------------

def linear_regression(
    session_id: str,
    table_name: str,
    x_col: str,
    y_col: str,
) -> dict[str, Any]:
    """Fit a simple OLS regression of y_col on x_col using DuckDB aggregates.

    Returns a dict with two keys:
      ``coefficients`` : {slope, intercept, r2, count, x_col, y_col}
      ``points``       : list[{x_col, y_col, predicted}] — actual rows plus
                         the predicted value for each x.
    """
    qx, qy = _q(x_col), _q(y_col)
    qt = _q(table_name)

    # 1. Fit: slope, intercept, R²
    coeff_sql = f"""
        SELECT
            REGR_SLOPE({qy}, {qx})          AS slope,
            REGR_INTERCEPT({qy}, {qx})      AS intercept,
            CORR({qx}, {qy}) * CORR({qx}, {qy}) AS r2,
            REGR_COUNT({qy}, {qx})          AS count
        FROM {qt}
        WHERE {qx} IS NOT NULL AND {qy} IS NOT NULL
    """
    try:
        coeff_rows = execute_in_session(session_id, coeff_sql)
    except Exception as exc:
        _logger.error("linear_regression coefficients failed: %s", exc)
        return {"coefficients": {"error": str(exc)}, "points": []}

    c = coeff_rows[0] if coeff_rows else {}
    slope = c.get("slope")
    intercept = c.get("intercept")

    if slope is None or intercept is None:
        return {
            "coefficients": {"error": "Insufficient non-null data for regression"},
            "points": [],
        }

    coeff = {
        "slope": round(float(slope), 6),
        "intercept": round(float(intercept), 6),
        "r2": round(float(c.get("r2") or 0), 4),
        "count": int(c.get("count") or 0),
        "x_col": x_col,
        "y_col": y_col,
    }

    # 2. Predicted values for every row
    points_sql = f"""
        SELECT
            {qx} AS {_q(x_col)},
            {qy} AS {_q(y_col)},
            ROUND({float(slope)} * CAST({qx} AS DOUBLE) + {float(intercept)}, 4)
                AS predicted
        FROM {qt}
        WHERE {qx} IS NOT NULL AND {qy} IS NOT NULL
        ORDER BY {qx}
    """
    try:
        points = execute_in_session(session_id, points_sql)
    except Exception as exc:
        _logger.error("linear_regression points failed: %s", exc)
        points = []

    return {"coefficients": coeff, "points": points}


# ---------------------------------------------------------------------------
# Moving average
# ---------------------------------------------------------------------------

def moving_average(
    session_id: str,
    table_name: str,
    date_col: str,
    value_col: str,
    window: int = 7,
) -> list[dict[str, Any]]:
    """Compute a rolling (centred trailing) moving average.

    Returns list[{date_col, value_col, moving_avg}] ordered by date_col.
    """
    window = max(2, int(window))
    qd, qv, qt = _q(date_col), _q(value_col), _q(table_name)

    sql = f"""
        SELECT
            {qd},
            {qv},
            ROUND(
                AVG(CAST({qv} AS DOUBLE)) OVER (
                    ORDER BY {qd}
                    ROWS BETWEEN {window - 1} PRECEDING AND CURRENT ROW
                ),
                4
            ) AS moving_avg
        FROM {qt}
        WHERE {qd} IS NOT NULL AND {qv} IS NOT NULL
        ORDER BY {qd}
    """
    try:
        return execute_in_session(session_id, sql)
    except Exception as exc:
        _logger.error("moving_average failed: %s", exc)
        return [{"error": str(exc)}]


# ---------------------------------------------------------------------------
# Naive linear forecast
# ---------------------------------------------------------------------------

def forecast_series(
    session_id: str,
    table_name: str,
    date_col: str,
    value_col: str,
    periods_ahead: int = 3,
) -> list[dict[str, Any]]:
    """Extrapolate a numeric/date series forward by fitting a linear trend.

    Strategy:
      1. Assign a 0-based integer row_index ordered by date_col.
      2. Fit REGR_SLOPE / REGR_INTERCEPT of value_col on row_index.
      3. Return all actual rows with is_forecast=false + predicted=fitted value,
         then N projected rows (row_index = n, n+1, ...) with is_forecast=true.

    Returns list[{date_col, value_col, predicted, row_idx, is_forecast}].
    The date_col for forecast rows contains a string label like
    "Forecast +1", "Forecast +2", … when the column is not a simple integer.
    """
    periods_ahead = max(1, min(int(periods_ahead), 24))
    qd, qv, qt = _q(date_col), _q(value_col), _q(table_name)

    # Build indexed CTE
    cte_sql = f"""
        WITH indexed AS (
            SELECT
                {qd},
                CAST({qv} AS DOUBLE) AS val,
                ROW_NUMBER() OVER (ORDER BY {qd}) - 1 AS row_idx
            FROM {qt}
            WHERE {qd} IS NOT NULL AND {qv} IS NOT NULL
        ),
        params AS (
            SELECT
                REGR_SLOPE(val, row_idx)      AS slope,
                REGR_INTERCEPT(val, row_idx)  AS intercept,
                MAX(row_idx)                  AS last_idx,
                COUNT(*)                      AS n
            FROM indexed
        )
        SELECT
            i.{_q(date_col)},
            i.val              AS {_q(value_col)},
            ROUND(p.slope * CAST(i.row_idx AS DOUBLE) + p.intercept, 4) AS predicted,
            i.row_idx,
            false              AS is_forecast
        FROM indexed i
        CROSS JOIN params p
        ORDER BY i.row_idx
    """
    try:
        actual_rows = execute_in_session(session_id, cte_sql)
    except Exception as exc:
        _logger.error("forecast_series actual rows failed: %s", exc)
        return [{"error": str(exc)}]

    if not actual_rows:
        return []

    # Extract slope/intercept from the last actual row's predicted vs row_idx
    # We need the params separately — run a tiny query
    params_sql = f"""
        WITH indexed AS (
            SELECT
                CAST({qv} AS DOUBLE) AS val,
                ROW_NUMBER() OVER (ORDER BY {qd}) - 1 AS row_idx
            FROM {qt}
            WHERE {qd} IS NOT NULL AND {qv} IS NOT NULL
        )
        SELECT
            REGR_SLOPE(val, row_idx)     AS slope,
            REGR_INTERCEPT(val, row_idx) AS intercept,
            MAX(row_idx)                 AS last_idx
        FROM indexed
    """
    try:
        params_rows = execute_in_session(session_id, params_sql)
    except Exception as exc:
        _logger.error("forecast_series params failed: %s", exc)
        return actual_rows

    p = params_rows[0] if params_rows else {}
    slope = float(p.get("slope") or 0)
    intercept = float(p.get("intercept") or 0)
    last_idx = int(p.get("last_idx") or len(actual_rows) - 1)

    forecast_rows: list[dict] = []
    for i in range(1, periods_ahead + 1):
        ridx = last_idx + i
        predicted_val = round(slope * ridx + intercept, 4)
        forecast_rows.append({
            date_col: f"Forecast +{i}",
            value_col: None,
            "predicted": predicted_val,
            "row_idx": ridx,
            "is_forecast": True,
        })

    return actual_rows + forecast_rows
