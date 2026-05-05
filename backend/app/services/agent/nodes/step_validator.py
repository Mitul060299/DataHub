"""
step_validator.py
=================
Auto Mode node — pure SQL, no LLM.

Compiles a DQAssertion into a DuckDB SELECT COUNT(*) query and runs it
against the post-step table to determine whether the rule was satisfied.

Inputs  (from AgentState):
  - auto_plan          : list[AutoPlanStep]
  - current_rule_index : int  — which step we just executed
  - duckdb_conn_path   : str | None  — path to duckdb file (or in-memory key)
  - active_table_name  : str  — the current output table alias

Outputs (merged into AgentState):
  - last_validation    : StepValidationResult
"""
from __future__ import annotations

import logging
from typing import Any

import duckdb

from ..auto_types import DQAssertion, AutoPlanStep, StepValidationResult
from ..state import AgentState

_logger = logging.getLogger(__name__)

# Operations that never need a DQ assertion (structural-only transformations)
_NO_VALIDATOR_OPS = frozenset({"rename_columns", "change_type", "select_columns", "drop_columns"})
_SAMPLE_LIMIT = 20


def _compile_assertion(assertion: DQAssertion, table: str) -> str | None:
    """Compile a DQAssertion to a SELECT COUNT(*) SQL string.

    Returns None for unknown kinds (validator will skip).
    """
    kind = assertion.get("kind", "")
    col = assertion.get("column", "")
    params = assertion.get("params") or {}

    if kind == "not_null":
        if not col:
            return None
        return f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" IS NULL'

    elif kind == "unique":
        cols = params.get("columns") or ([col] if col else [])
        if not cols:
            return None
        cols_sql = ", ".join(f'"{c}"' for c in cols)
        return (
            f'SELECT COUNT(*) FROM ('
            f'  SELECT {cols_sql} FROM "{table}" GROUP BY {cols_sql} HAVING COUNT(*) > 1'
            f') _dup'
        )

    elif kind == "regex":
        pattern = params.get("pattern", "")
        if not col or not pattern:
            return None
        escaped = pattern.replace("'", "''")
        return (
            f'SELECT COUNT(*) FROM "{table}" '
            f'WHERE "{col}" IS NOT NULL AND NOT regexp_matches("{col}", \'{escaped}\')'
        )

    elif kind == "range":
        if not col:
            return None
        lo = params.get("min")
        hi = params.get("max")
        if lo is not None and hi is not None:
            return f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" < {lo} OR "{col}" > {hi}'
        elif lo is not None:
            return f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" < {lo}'
        elif hi is not None:
            return f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" > {hi}'
        return None

    elif kind == "in_set":
        values = params.get("values", [])
        if not col or not values:
            return None
        val_sql = ", ".join(f"'{str(v).replace(chr(39), chr(39)*2)}'" for v in values)
        return (
            f'SELECT COUNT(*) FROM "{table}" '
            f'WHERE "{col}" IS NOT NULL AND "{col}" NOT IN ({val_sql})'
        )

    elif kind == "sql":
        query = params.get("query", "")
        if not query:
            return None
        return query.replace("{table}", f'"{table}"')

    return None


def _sample_failures(conn: duckdb.DuckDBPyConnection, assertion: DQAssertion, table: str) -> list[dict]:
    """Return up to _SAMPLE_LIMIT failing rows for human inspection."""
    kind = assertion.get("kind", "")
    col = assertion.get("column", "")
    params = assertion.get("params") or {}

    try:
        if kind == "not_null" and col:
            rows = conn.execute(f'SELECT * FROM "{table}" WHERE "{col}" IS NULL LIMIT {_SAMPLE_LIMIT}').fetchall()
            cols = [d[0] for d in conn.description]
            return [dict(zip(cols, r)) for r in rows]

        elif kind == "unique":
            cols = params.get("columns") or ([col] if col else [])
            if cols:
                cols_sql = ", ".join(f'"{c}"' for c in cols)
                rows = conn.execute(
                    f'SELECT * FROM "{table}" WHERE ({cols_sql}) IN ('
                    f'  SELECT {cols_sql} FROM "{table}" GROUP BY {cols_sql} HAVING COUNT(*) > 1'
                    f') LIMIT {_SAMPLE_LIMIT}'
                ).fetchall()
                desc_cols = [d[0] for d in conn.description]
                return [dict(zip(desc_cols, r)) for r in rows]

        elif kind == "regex":
            pattern = params.get("pattern", "")
            if col and pattern:
                escaped = pattern.replace("'", "''")
                rows = conn.execute(
                    f'SELECT * FROM "{table}" WHERE "{col}" IS NOT NULL '
                    f'AND NOT regexp_matches("{col}", \'{escaped}\') LIMIT {_SAMPLE_LIMIT}'
                ).fetchall()
                desc_cols = [d[0] for d in conn.description]
                return [dict(zip(desc_cols, r)) for r in rows]

        elif kind == "range":
            lo, hi = params.get("min"), params.get("max")
            if col and (lo is not None or hi is not None):
                clauses = []
                if lo is not None:
                    clauses.append(f'"{col}" < {lo}')
                if hi is not None:
                    clauses.append(f'"{col}" > {hi}')
                where = " OR ".join(clauses)
                rows = conn.execute(f'SELECT * FROM "{table}" WHERE {where} LIMIT {_SAMPLE_LIMIT}').fetchall()
                desc_cols = [d[0] for d in conn.description]
                return [dict(zip(desc_cols, r)) for r in rows]

        elif kind == "in_set":
            values = params.get("values", [])
            if col and values:
                val_sql = ", ".join(f"'{str(v).replace(chr(39), chr(39)*2)}'" for v in values)
                rows = conn.execute(
                    f'SELECT * FROM "{table}" WHERE "{col}" IS NOT NULL '
                    f'AND "{col}" NOT IN ({val_sql}) LIMIT {_SAMPLE_LIMIT}'
                ).fetchall()
                desc_cols = [d[0] for d in conn.description]
                return [dict(zip(desc_cols, r)) for r in rows]

    except Exception as exc:
        _logger.warning("step_validator: sample query failed: %s", exc)

    return []


async def step_validator(state: AgentState) -> dict:
    auto_plan: list[AutoPlanStep] = state.get("auto_plan") or []
    current_idx: int = state.get("current_rule_index", 0)
    table: str = state.get("active_table_name", "") or state.get("source_table", "")
    duckdb_path: str | None = state.get("duckdb_conn_path")

    if not auto_plan or current_idx >= len(auto_plan):
        return {"last_validation": None}

    step = auto_plan[current_idx]
    rule_id: int = step.get("rule_id", 0)

    # Skip validator for structural ops
    if not step.get("needs_validator", True) or step.get("operation") in _NO_VALIDATOR_OPS:
        result: StepValidationResult = {
            "step_number": step["step_number"],
            "rule_id": rule_id,
            "passed": True,
            "residual_count": 0,
            "tolerance": 0,
            "sample_failures": [],
            "assertion_sql": "(skipped — structural op)",
        }
        return {"last_validation": result}

    # Find the rule assertion from auto_goal
    auto_goal = state.get("auto_goal") or {}
    rules = auto_goal.get("rules", [])
    rule = next((r for r in rules if r.get("rule_id") == rule_id), None)
    if not rule:
        _logger.warning("step_validator: rule_id %d not found in auto_goal", rule_id)
        return {"last_validation": None}

    assertion: DQAssertion = rule.get("assertion") or {}
    tolerance: int = int(assertion.get("tolerance") or 0)

    if not table:
        _logger.warning("step_validator: no active_table_name in state")
        return {"last_validation": None}

    assertion_sql = _compile_assertion(assertion, table)
    if not assertion_sql:
        _logger.warning("step_validator: could not compile assertion kind=%s", assertion.get("kind"))
        result = {
            "step_number": step["step_number"],
            "rule_id": rule_id,
            "passed": True,
            "residual_count": 0,
            "tolerance": tolerance,
            "sample_failures": [],
            "assertion_sql": "(uncompilable)",
        }
        return {"last_validation": result}

    try:
        if duckdb_path:
            conn = duckdb.connect(duckdb_path, read_only=True)
        else:
            conn = duckdb.connect()

        try:
            residual: int = conn.execute(assertion_sql).fetchone()[0]  # type: ignore[index]
            passed = residual <= tolerance
            sample: list[dict] = [] if passed else _sample_failures(conn, assertion, table)
        finally:
            conn.close()

    except Exception as exc:
        _logger.error("step_validator DuckDB error: %s", exc)
        result = {
            "step_number": step["step_number"],
            "rule_id": rule_id,
            "passed": False,
            "residual_count": -1,
            "tolerance": tolerance,
            "sample_failures": [],
            "assertion_sql": assertion_sql,
        }
        return {"last_validation": result}

    result = StepValidationResult(
        step_number=step["step_number"],
        rule_id=rule_id,
        passed=passed,
        residual_count=residual,
        tolerance=tolerance,
        sample_failures=sample,
        assertion_sql=assertion_sql,
    )
    _logger.info(
        "step_validator: step=%d rule=%d passed=%s residual=%d",
        step["step_number"], rule_id, passed, residual,
    )
    return {"last_validation": result}
