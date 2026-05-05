"""
drift_detector.py
=================
Auto Mode node — pure SQL/profiling, no LLM.

Compares current dataset statistics against ColumnExpectation objects
(from prior_pipeline_parser or the API's expected_profile) to produce a
DriftReport with per-column green/amber/red status.

Inputs  (from AgentState):
  - active_table_name   : str
  - duckdb_conn_path    : str | None
  - inferred_expectations : list[ColumnExpectation]  — from prior_pipeline_parser
  - expected_profile    : ExpectedProfile | None  — from API body (user-supplied)

Outputs (merged into AgentState):
  - drift_report        : DriftReport
"""
from __future__ import annotations

import json
import logging
from typing import Any

import duckdb

from ..auto_types import (
    ColumnDrift,
    ColumnExpectation,
    DriftReport,
    ExpectedProfile,
    NovelValue,
)
from ..state import AgentState

_logger = logging.getLogger(__name__)

# Thresholds for amber/red classification
_AMBER_THRESHOLD = 0.05   # > 5% drift triggers amber
_RED_THRESHOLD = 0.20     # > 20% drift triggers red


def _profile_column(
    conn: duckdb.DuckDBPyConnection,
    table: str,
    col: str,
    expectation: ColumnExpectation,
) -> ColumnDrift:
    """Compute actual vs expected and classify drift for a single column."""
    kind = expectation.get("kind", "not_null")
    params = expectation.get("params") or {}
    tolerance = float(expectation.get("tolerance", 0.05))
    total_rows = 0
    actual_value: Any = None
    deviation = 0.0
    auto_adjustment: dict | None = None
    novel_values: list[NovelValue] = []

    try:
        total_rows = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]  # type: ignore[index]
        if total_rows == 0:
            return ColumnDrift(
                column=col,
                status="green",
                expectation=expectation,
                actual_value=None,
                deviation=0.0,
            )

        if kind == "not_null":
            null_count = conn.execute(
                f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" IS NULL'
            ).fetchone()[0]  # type: ignore[index]
            null_rate = null_count / total_rows
            actual_value = null_rate
            expected_null_rate = float(params.get("null_rate_pct", 0)) / 100.0
            deviation = abs(null_rate - expected_null_rate)

        elif kind == "in_set":
            expected_vals = set(str(v) for v in (params.get("values") or []))
            if expected_vals:
                rows = conn.execute(
                    f'SELECT "{col}", COUNT(*) as cnt FROM "{table}" '
                    f'WHERE "{col}" IS NOT NULL GROUP BY "{col}"'
                ).fetchall()
                actual_vals = {str(r[0]) for r in rows}
                new_vals = actual_vals - expected_vals
                total_novel = sum(r[1] for r in rows if str(r[0]) in new_vals)
                deviation = total_novel / total_rows if total_rows else 0.0
                actual_value = list(actual_vals)[:20]
                for row in rows:
                    val_str = str(row[0])
                    if val_str in new_vals:
                        novel_values.append(NovelValue(
                            column=col, value=val_str, count=int(row[1]), rules_affected=[],
                        ))
                if novel_values:
                    auto_adjustment = {"params": {"values": list(actual_vals)}}

        elif kind == "range":
            stats_row = conn.execute(
                f'SELECT MIN("{col}"), MAX("{col}") FROM "{table}" WHERE "{col}" IS NOT NULL'
            ).fetchone()
            if stats_row:
                actual_min, actual_max = stats_row
                actual_value = {"min": actual_min, "max": actual_max}
                exp_min = params.get("min")
                exp_max = params.get("max")
                # Compute how many rows fall outside the expected range
                oob_count = conn.execute(
                    f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" < {exp_min} OR "{col}" > {exp_max}'
                    if exp_min is not None and exp_max is not None
                    else f'SELECT 0'
                ).fetchone()[0]  # type: ignore[index]
                deviation = oob_count / total_rows

        elif kind == "unique":
            # Check if cardinality dropped significantly
            card = conn.execute(f'SELECT COUNT(DISTINCT "{col}") FROM "{table}"').fetchone()[0]  # type: ignore[index]
            expected_min_card = int(params.get("cardinality_min", 0))
            actual_value = card
            if expected_min_card > 0:
                deviation = max(0.0, (expected_min_card - card) / expected_min_card)

        elif kind == "type":
            # Check that column exists and non-null rate is acceptable
            null_count = conn.execute(
                f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" IS NULL'
            ).fetchone()[0]  # type: ignore[index]
            actual_value = null_count / total_rows
            deviation = max(0.0, actual_value - tolerance)

    except Exception as exc:
        _logger.warning("drift_detector: profile failed col=%s kind=%s: %s", col, kind, exc)

    # Classify status
    deviation = min(deviation, 1.0)
    if deviation <= _AMBER_THRESHOLD:
        status = "green"
    elif deviation <= _RED_THRESHOLD:
        status = "amber"
    else:
        status = "red"

    result = ColumnDrift(
        column=col,
        status=status,  # type: ignore[arg-type]
        expectation=expectation,
        actual_value=actual_value,
        deviation=round(deviation, 4),
    )
    if novel_values:
        result["novel_values"] = novel_values
    if auto_adjustment and status == "amber":
        result["auto_adjustment"] = auto_adjustment

    return result


async def drift_detector(state: AgentState) -> dict:
    table: str = state.get("active_table_name", "") or state.get("source_table", "")
    duckdb_path: str | None = state.get("duckdb_conn_path")
    inferred: list[ColumnExpectation] = state.get("inferred_expectations") or []
    expected_profile: ExpectedProfile | None = state.get("expected_profile")

    # Merge inferred + user-supplied expectations (user-supplied wins on same column+kind)
    expectations: dict[str, ColumnExpectation] = {}
    for exp in inferred:
        col = exp.get("column", "")
        if col:
            expectations[f"{col}:{exp.get('kind')}"] = exp

    if expected_profile:
        for col_spec in (expected_profile.get("columns") or []):
            col = col_spec.get("name", "")
            if not col:
                continue
            if col_spec.get("null_rate_pct") is not None:
                key = f"{col}:not_null"
                expectations[key] = ColumnExpectation(
                    column=col, kind="not_null",
                    params={"null_rate_pct": col_spec["null_rate_pct"]},
                    tolerance=0.05, source="user",
                )
            if col_spec.get("value_set"):
                key = f"{col}:in_set"
                expectations[key] = ColumnExpectation(
                    column=col, kind="in_set",
                    params={"values": col_spec["value_set"]},
                    tolerance=0.02, source="user",
                )

    if not expectations or not table:
        empty_report = DriftReport(
            columns=[], green_count=0, amber_count=0, red_count=0,
            auto_adjustments=[], novel_values=[], schema_changes=[],
        )
        return {"drift_report": empty_report}

    try:
        if duckdb_path:
            conn = duckdb.connect(duckdb_path, read_only=True)
        else:
            conn = duckdb.connect()
    except Exception as exc:
        _logger.error("drift_detector: could not open DuckDB: %s", exc)
        return {"drift_report": None}

    column_results: list[ColumnDrift] = []
    green = amber = red = 0
    all_novel: list[NovelValue] = []
    all_adjustments: list[dict] = []

    try:
        # Check for schema changes: columns present in expectations but missing in table
        db_cols_rows = conn.execute(f'DESCRIBE "{table}"').fetchall()
        db_cols = {r[0] for r in db_cols_rows}
        expected_cols = {exp.get("column", "") for exp in expectations.values()}
        schema_changes: list[dict] = [
            {"column": c, "change": "missing_in_table"}
            for c in expected_cols - db_cols if c
        ]

        for exp in expectations.values():
            col = exp.get("column", "")
            if not col or col not in db_cols:
                continue
            drift = _profile_column(conn, table, col, exp)
            column_results.append(drift)

            if drift["status"] == "green":
                green += 1
            elif drift["status"] == "amber":
                amber += 1
                if drift.get("auto_adjustment"):
                    all_adjustments.append({"column": col, **drift["auto_adjustment"]})
            else:
                red += 1

            if drift.get("novel_values"):
                all_novel.extend(drift["novel_values"])

    finally:
        conn.close()

    report = DriftReport(
        columns=column_results,
        green_count=green,
        amber_count=amber,
        red_count=red,
        auto_adjustments=all_adjustments,
        novel_values=all_novel,
        schema_changes=schema_changes,
    )
    _logger.info(
        "drift_detector: green=%d amber=%d red=%d schema_changes=%d",
        green, amber, red, len(schema_changes),
    )
    return {"drift_report": report}
