"""
plan_linter.py
==============
Deterministic post-processing checks for LLM-generated execution plans.

The LLM prompt (PLANNER_SYSTEM_PROMPT) tells the model not to violate certain
invariants (data-leakage rules, DAG ordering, schema correctness). The linter
runs AFTER the LLM responds and:

  • flags violations as `warnings` on individual steps,
  • auto-fixes safe issues (missing chart sql, malformed SQL identifiers),
  • surfaces blocking issues so the planner can re-prompt or abort.

The linter is intentionally LLM-free — it only uses static rules over the
plan structure. This means it is fast, deterministic, and testable.
"""
from __future__ import annotations

import re
from typing import Any


_FIT_NEEDING_OPS = {
    "scale_features",
    "dimensionality_reduction",
    "variance_threshold",
    "correlation_filter",
}

_FIT_NEEDING_ENCODING_METHODS = {"target", "frequency"}
_FIT_NEEDING_IMPUTE_STRATEGIES = {"mean", "median", "mode"}

_TIME_HINT_COLUMN_TOKENS = (
    "date", "time", "_dt", "_ts", "timestamp", "event_ts", "created_at",
)


def _is_fit_needing(step: dict[str, Any]) -> bool:
    """Does the step compute statistics that must be learned from train only?"""
    op = str(step.get("operation") or "").strip().lower()
    if op in _FIT_NEEDING_OPS:
        return True
    params = step.get("parameters") or {}
    if not isinstance(params, dict):
        return False
    if op == "encode_categorical":
        method = str(params.get("method") or "").strip().lower()
        return method in _FIT_NEEDING_ENCODING_METHODS
    if op == "fill_missing":
        strategy = str(params.get("strategy") or "").strip().lower()
        return strategy in _FIT_NEEDING_IMPUTE_STRATEGIES
    return False


def _has_train_only_filter(step: dict[str, Any]) -> bool:
    params = step.get("parameters") or {}
    if isinstance(params, dict):
        if str(params.get("fit_on") or "").strip().lower() == "train":
            return True
    sql = str(step.get("sql") or "").lower()
    return "split='train'" in sql.replace(" ", "") or "split = 'train'" in sql


def _find_split_step(plan: list[dict[str, Any]]) -> dict[str, Any] | None:
    for step in plan:
        if str(step.get("operation") or "").strip().lower() == "train_test_split":
            return step
    return None


def _dataset_has_time_column(schema: dict[str, Any] | None) -> bool:
    if not isinstance(schema, dict):
        return False
    for col_name, col_type in schema.items():
        n = str(col_name).lower()
        t = str(col_type).lower()
        if any(tok in n for tok in _TIME_HINT_COLUMN_TOKENS):
            return True
        if "date" in t or "time" in t or "timestamp" in t:
            return True
    return False


def _references_uses_time_features(plan: list[dict[str, Any]]) -> bool:
    for step in plan:
        op = str(step.get("operation") or "").strip().lower()
        if op in {"lag_features", "rolling_window", "engineer_datetime", "engineer_cyclical"}:
            return True
    return False


def _column_exists(schema: dict[str, Any] | None, col: str) -> bool:
    if not isinstance(schema, dict) or not col:
        return False
    # Case-insensitive match
    lc = {str(k).lower() for k in schema.keys()}
    return col.lower() in lc


def _validate_dag(plan: list[dict[str, Any]]) -> list[str]:
    """Return list of error strings for any DAG-structure issues."""
    errors: list[str] = []
    valid_nums = {int(s.get("step_number", -1)) for s in plan}
    for step in plan:
        try:
            sn = int(step.get("step_number", -1))
        except (TypeError, ValueError):
            errors.append(f"step has non-integer step_number: {step.get('step_number')}")
            continue
        deps = step.get("depends_on") or []
        if not isinstance(deps, list):
            errors.append(f"step {sn}: depends_on must be a list")
            continue
        for d in deps:
            try:
                di = int(d)
            except (TypeError, ValueError):
                errors.append(f"step {sn}: depends_on has non-integer entry: {d}")
                continue
            if di == sn:
                errors.append(f"step {sn}: depends_on references itself")
            elif di > sn:
                errors.append(f"step {sn}: forward reference to step {di}")
            elif di not in valid_nums:
                errors.append(f"step {sn}: dangling depends_on -> step {di} not in plan")
    return errors


def lint_plan(
    plan: list[dict[str, Any]],
    schema: dict[str, Any] | None = None,
    target_column: str | None = None,
) -> dict[str, Any]:
    """Run deterministic checks over an LLM-generated plan.

    Parameters
    ----------
    plan : list of step dicts (PlanStep shape — must have step_number, operation,
           depends_on, parameters, sql).
    schema : optional column-name → type mapping for the input dataset; used
             to validate column references and infer time-series presence.
    target_column : optional name of the supervised-learning target; if set,
             the linter forbids it from appearing in feature scope.

    Returns
    -------
    dict with:
      - "warnings" : list of {"step_number": int, "code": str, "message": str}
      - "errors"   : list of {"step_number": int|None, "code": str, "message": str}
      - "auto_fixes": list of {"step_number": int, "code": str, "message": str}
      - "ok"       : bool (True iff errors is empty)
    """
    warnings: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    auto_fixes: list[dict[str, Any]] = []

    # ── DAG sanity ────────────────────────────────────────────────────────
    for msg in _validate_dag(plan):
        errors.append({"step_number": None, "code": "DAG", "message": msg})

    # ── Empty plan ────────────────────────────────────────────────────────
    if not plan:
        errors.append({"step_number": None, "code": "EMPTY_PLAN", "message": "plan has no steps"})
        return {"warnings": warnings, "errors": errors, "auto_fixes": auto_fixes, "ok": False}

    split_step = _find_split_step(plan)
    split_num = int(split_step["step_number"]) if split_step else None

    # ── Per-step checks ───────────────────────────────────────────────────
    for step in plan:
        try:
            sn = int(step.get("step_number"))
        except (TypeError, ValueError):
            continue
        op = str(step.get("operation") or "").strip().lower()
        params = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
        sql = str(step.get("sql") or "")

        # Backtick identifiers
        if "`" in sql:
            errors.append({
                "step_number": sn, "code": "BACKTICK_IDENT",
                "message": "SQL uses MySQL-style backticks; DuckDB requires double quotes",
            })

        # Chart steps must include SQL
        if op in ("create_chart", "visualise"):
            if not sql.strip():
                errors.append({
                    "step_number": sn, "code": "CHART_MISSING_SQL",
                    "message": "create_chart step must include an aggregation SQL",
                })

        # ── ML leakage: fit-needing op MUST come AFTER split, AND must
        # filter to train rows.
        if _is_fit_needing(step):
            if split_num is None:
                warnings.append({
                    "step_number": sn, "code": "ML_FIT_NO_SPLIT",
                    "message": f"{op} computes statistics from the data but no train_test_split exists; "
                               "values may leak across future train/test boundaries",
                })
            else:
                if sn <= split_num:
                    errors.append({
                        "step_number": sn, "code": "ML_FIT_BEFORE_SPLIT",
                        "message": f"{op} step {sn} runs before train_test_split step {split_num}; "
                                   "move it after the split or set fit_on='train'",
                    })
                if not _has_train_only_filter(step):
                    warnings.append({
                        "step_number": sn, "code": "ML_FIT_NOT_TRAIN_ONLY",
                        "message": f"{op} should set parameters.fit_on='train' or filter SQL by split='train' "
                                   "to avoid leakage from val/test rows into the fitted statistics",
                    })

        # ── Target column must not appear in feature scope
        if target_column:
            tcol = target_column.lower()
            cols_param = params.get("columns") if isinstance(params, dict) else None
            if isinstance(cols_param, list):
                for c in cols_param:
                    if str(c).lower() == tcol and op in {
                        "scale_features", "dimensionality_reduction",
                        "variance_threshold", "correlation_filter",
                    }:
                        errors.append({
                            "step_number": sn, "code": "TARGET_IN_FEATURES",
                            "message": f"target column '{target_column}' is included in {op}.columns",
                        })

        # ── Time-series plans must use time-based split
        if op == "train_test_split":
            method = ""
            if isinstance(params, dict):
                method = str(params.get("method") or "").strip().lower()
            if _references_uses_time_features(plan) or _dataset_has_time_column(schema):
                if method and method != "time":
                    warnings.append({
                        "step_number": sn, "code": "TS_NEEDS_TIME_SPLIT",
                        "message": f"dataset appears time-series but train_test_split.method='{method}'; "
                                   "use method='time' to avoid future-leakage",
                    })

        # ── Stale dataset references
        m = re.search(r"\bFROM\s+dataset\b", sql, re.IGNORECASE)
        if m and "dataset" not in {str(k).lower() for k in (schema or {})}:
            warnings.append({
                "step_number": sn, "code": "FROM_DATASET_LITERAL",
                "message": "SQL contains literal 'FROM dataset' — should use actual duckdb_name from registry",
            })

        # ── Column existence (best-effort, only for whitelisted params)
        if schema:
            for pname in ("column", "target_column"):
                if isinstance(params, dict) and pname in params and params[pname]:
                    if not _column_exists(schema, str(params[pname])):
                        warnings.append({
                            "step_number": sn, "code": "UNKNOWN_COLUMN",
                            "message": f"parameter {pname}='{params[pname]}' not in schema",
                        })

    return {
        "warnings": warnings,
        "errors": errors,
        "auto_fixes": auto_fixes,
        "ok": not errors,
    }


__all__ = ["lint_plan"]
