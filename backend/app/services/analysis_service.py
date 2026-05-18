"""Statistical analysis service — all computations run as DuckDB SQL.

No pandas / numpy on any code path.  Every function accepts a DuckDB
session_id and a table name already registered in that session, runs pure SQL,
and returns plain list[dict] results.
"""
from __future__ import annotations

import logging
from typing import Any

from .duckdb_session import execute_in_session

_logger = logging.getLogger(__name__)


def _q(name: str) -> str:
    """Double-quote a DuckDB identifier, escaping any embedded double-quotes."""
    return '"' + name.replace('"', '""') + '"'


def _esc(val: str) -> str:
    """Escape a string value for embedding in single-quoted SQL literals."""
    return val.replace("'", "''")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def descriptive_stats(
    session_id: str,
    table_name: str,
    columns: list[str],
) -> list[dict[str, Any]]:
    """Compute per-column descriptive statistics for each numeric column.

    Returns one dict per column with keys:
      column_name, count, mean, median, stddev, min, max,
      p5, p25, p75, p95, skewness, kurtosis
    """
    tbl = _q(table_name)
    results: list[dict[str, Any]] = []
    for col in columns:
        qcol = _q(col)
        sql = (
            f"SELECT\n"
            f"    '{_esc(col)}' AS column_name,\n"
            f"    COUNT({qcol})                                                           AS count,\n"
            f"    ROUND(AVG({qcol})::DOUBLE, 4)                                          AS mean,\n"
            f"    ROUND(MEDIAN({qcol})::DOUBLE, 4)                                       AS median,\n"
            f"    ROUND(STDDEV({qcol})::DOUBLE, 4)                                       AS stddev,\n"
            f"    ROUND(MIN({qcol})::DOUBLE, 4)                                          AS min,\n"
            f"    ROUND(MAX({qcol})::DOUBLE, 4)                                          AS max,\n"
            f"    ROUND(PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY {qcol})::DOUBLE, 4) AS p5,\n"
            f"    ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY {qcol})::DOUBLE, 4) AS p25,\n"
            f"    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY {qcol})::DOUBLE, 4) AS p75,\n"
            f"    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY {qcol})::DOUBLE, 4) AS p95,\n"
            f"    ROUND(SKEWNESS({qcol})::DOUBLE, 4)                                     AS skewness,\n"
            f"    ROUND(KURTOSIS({qcol})::DOUBLE, 4)                                     AS kurtosis\n"
            f"FROM {tbl}\n"
            f"WHERE {qcol} IS NOT NULL"
        )
        try:
            rows = execute_in_session(session_id, sql)
            if rows:
                results.append(rows[0])
        except Exception as exc:
            _logger.warning("descriptive_stats failed for column %r: %s", col, exc)
            results.append({"column_name": col, "error": str(exc)})
    return results


def correlation_matrix(
    session_id: str,
    table_name: str,
    columns: list[str],
    method: str = "pearson",
) -> list[dict[str, Any]]:
    """Compute pairwise correlation between every pair of *columns*.

    method:
      "pearson"  — uses DuckDB's CORR(y, x) aggregate (default)
      "spearman" — rank-transforms both columns then applies CORR()

    Returns a list of dicts, one per ordered pair, with keys:
      col1, col2, correlation
    Diagonal (col1 == col2) entries have correlation = 1.0.
    Both (A, B) and (B, A) are included so callers can build a full matrix.
    """
    tbl = _q(table_name)
    results: list[dict[str, Any]] = []
    method = (method or "pearson").lower()

    for i, col1 in enumerate(columns):
        results.append({"col1": col1, "col2": col1, "correlation": 1.0})
        for col2 in columns[i + 1:]:
            q1, q2 = _q(col1), _q(col2)
            if method == "spearman":
                sql = (
                    f"WITH ranked AS (\n"
                    f"    SELECT\n"
                    f"        RANK() OVER (ORDER BY {q1} NULLS LAST) AS r1,\n"
                    f"        RANK() OVER (ORDER BY {q2} NULLS LAST) AS r2\n"
                    f"    FROM {tbl}\n"
                    f"    WHERE {q1} IS NOT NULL AND {q2} IS NOT NULL\n"
                    f")\n"
                    f"SELECT\n"
                    f"    '{_esc(col1)}' AS col1,\n"
                    f"    '{_esc(col2)}' AS col2,\n"
                    f"    ROUND(CORR(r1, r2)::DOUBLE, 4) AS correlation\n"
                    f"FROM ranked"
                )
            else:
                sql = (
                    f"SELECT\n"
                    f"    '{_esc(col1)}' AS col1,\n"
                    f"    '{_esc(col2)}' AS col2,\n"
                    f"    ROUND(CORR({q1}, {q2})::DOUBLE, 4) AS correlation\n"
                    f"FROM {tbl}\n"
                    f"WHERE {q1} IS NOT NULL AND {q2} IS NOT NULL"
                )
            try:
                rows = execute_in_session(session_id, sql)
                if rows:
                    corr_val = rows[0].get("correlation")
                    results.append({"col1": col1, "col2": col2, "correlation": corr_val})
                    results.append({"col1": col2, "col2": col1, "correlation": corr_val})
            except Exception as exc:
                _logger.warning("correlation_matrix failed for (%r, %r): %s", col1, col2, exc)

    return results


def frequency_distribution(
    session_id: str,
    table_name: str,
    column: str,
    top_n: int = 20,
) -> list[dict[str, Any]]:
    """Compute value frequency for *column*.

    Returns list of dicts with keys: value, count, pct (0–100).
    Ordered by count descending, limited to *top_n* rows.
    """
    tbl = _q(table_name)
    qcol = _q(column)
    top_n = max(1, min(int(top_n), 100))
    sql = (
        f"SELECT\n"
        f"    CAST({qcol} AS VARCHAR) AS value,\n"
        f"    COUNT(*) AS count,\n"
        f"    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) AS pct\n"
        f"FROM {tbl}\n"
        f"WHERE {qcol} IS NOT NULL\n"
        f"GROUP BY {qcol}\n"
        f"ORDER BY count DESC\n"
        f"LIMIT {top_n}"
    )
    try:
        return execute_in_session(session_id, sql)
    except Exception as exc:
        _logger.warning("frequency_distribution failed for column %r: %s", column, exc)
        return [{"error": str(exc)}]


def outlier_summary(
    session_id: str,
    table_name: str,
    columns: list[str],
) -> list[dict[str, Any]]:
    """Detect outliers per numeric column using the IQR fence method (1.5×IQR).

    Returns one dict per column with keys:
      column_name, q1, q3, lower_bound, upper_bound,
      below_lower, above_upper, total_outliers, total_count, outlier_pct
    """
    tbl = _q(table_name)
    results: list[dict[str, Any]] = []
    for col in columns:
        qcol = _q(col)
        sql = (
            f"WITH q AS (\n"
            f"    SELECT\n"
            f"        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY {qcol}) AS q1,\n"
            f"        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY {qcol}) AS q3\n"
            f"    FROM {tbl}\n"
            f"    WHERE {qcol} IS NOT NULL\n"
            f"),\n"
            f"bounds AS (\n"
            f"    SELECT\n"
            f"        ROUND(q1::DOUBLE, 4)                        AS q1,\n"
            f"        ROUND(q3::DOUBLE, 4)                        AS q3,\n"
            f"        ROUND((q1 - 1.5 * (q3 - q1))::DOUBLE, 4)   AS lower_bound,\n"
            f"        ROUND((q3 + 1.5 * (q3 - q1))::DOUBLE, 4)   AS upper_bound\n"
            f"    FROM q\n"
            f")\n"
            f"SELECT\n"
            f"    '{_esc(col)}' AS column_name,\n"
            f"    (SELECT q1           FROM bounds) AS q1,\n"
            f"    (SELECT q3           FROM bounds) AS q3,\n"
            f"    (SELECT lower_bound  FROM bounds) AS lower_bound,\n"
            f"    (SELECT upper_bound  FROM bounds) AS upper_bound,\n"
            f"    COUNT(CASE WHEN {qcol} < (SELECT lower_bound FROM bounds) THEN 1 END)  AS below_lower,\n"
            f"    COUNT(CASE WHEN {qcol} > (SELECT upper_bound FROM bounds) THEN 1 END)  AS above_upper,\n"
            f"    COUNT(CASE WHEN {qcol} < (SELECT lower_bound FROM bounds)\n"
            f"                  OR {qcol} > (SELECT upper_bound FROM bounds) THEN 1 END) AS total_outliers,\n"
            f"    COUNT({qcol}) AS total_count,\n"
            f"    ROUND(\n"
            f"        100.0\n"
            f"        * COUNT(CASE WHEN {qcol} < (SELECT lower_bound FROM bounds)\n"
            f"                        OR {qcol} > (SELECT upper_bound FROM bounds) THEN 1 END)\n"
            f"        / NULLIF(COUNT({qcol}), 0),\n"
            f"        2\n"
            f"    ) AS outlier_pct\n"
            f"FROM {tbl}\n"
            f"WHERE {qcol} IS NOT NULL"
        )
        try:
            rows = execute_in_session(session_id, sql)
            if rows:
                results.append(rows[0])
        except Exception as exc:
            _logger.warning("outlier_summary failed for column %r: %s", col, exc)
            results.append({"column_name": col, "error": str(exc)})
    return results
