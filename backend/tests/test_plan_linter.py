"""Tests for the deterministic plan linter."""
import pytest

from app.services.agent.plan_linter import lint_plan


def _step(n, op, **kw):
    return {
        "step_number": n,
        "operation": op,
        "description": kw.get("description", ""),
        "sql": kw.get("sql", ""),
        "parameters": kw.get("parameters", {}),
        "depends_on": kw.get("depends_on", []),
    }


class TestDAGValidation:
    def test_empty_plan_is_error(self):
        r = lint_plan([])
        assert not r["ok"]
        assert any(e["code"] == "EMPTY_PLAN" for e in r["errors"])

    def test_self_reference_caught(self):
        plan = [_step(1, "clean", depends_on=[1])]
        r = lint_plan(plan)
        assert not r["ok"]
        assert any("references itself" in e["message"] for e in r["errors"])

    def test_forward_reference_caught(self):
        plan = [_step(1, "clean", depends_on=[2]), _step(2, "transform")]
        r = lint_plan(plan)
        assert not r["ok"]
        assert any("forward reference" in e["message"] for e in r["errors"])

    def test_dangling_depends_on_caught(self):
        plan = [_step(1, "clean"), _step(5, "transform", depends_on=[3])]
        r = lint_plan(plan)
        assert not r["ok"]
        assert any("dangling" in e["message"] for e in r["errors"])

    def test_clean_dag_passes(self):
        plan = [
            _step(1, "clean", sql="SELECT * FROM t"),
            _step(2, "transform", depends_on=[1], sql="SELECT * FROM t"),
        ]
        r = lint_plan(plan)
        assert r["ok"], r["errors"]


class TestSqlSanity:
    def test_backtick_identifier_errors(self):
        plan = [_step(1, "clean", sql="SELECT `col name` FROM t")]
        r = lint_plan(plan)
        assert not r["ok"]
        assert any(e["code"] == "BACKTICK_IDENT" for e in r["errors"])

    def test_chart_missing_sql_errors(self):
        plan = [_step(1, "create_chart", parameters={"chart_type": "bar"})]
        r = lint_plan(plan)
        assert not r["ok"]
        assert any(e["code"] == "CHART_MISSING_SQL" for e in r["errors"])

    def test_chart_with_sql_passes(self):
        plan = [_step(1, "create_chart", sql="SELECT a, SUM(b) FROM t GROUP BY 1",
                      parameters={"chart_type": "bar"})]
        r = lint_plan(plan)
        assert r["ok"], r["errors"]

    def test_literal_from_dataset_warns(self):
        plan = [_step(1, "transform", sql="SELECT * FROM dataset")]
        # schema has no column called 'dataset', but the warning is about the literal
        r = lint_plan(plan, schema={"id": "INTEGER"})
        assert any(w["code"] == "FROM_DATASET_LITERAL" for w in r["warnings"])


class TestMLLeakageRules:
    def test_scale_features_before_split_errors(self):
        plan = [
            _step(1, "scale_features", parameters={"columns": ["x"], "method": "zscore"}),
            _step(2, "train_test_split", parameters={"method": "random"}),
        ]
        r = lint_plan(plan)
        assert not r["ok"]
        assert any(e["code"] == "ML_FIT_BEFORE_SPLIT" for e in r["errors"])

    def test_scale_after_split_not_train_only_warns(self):
        plan = [
            _step(1, "train_test_split", parameters={"method": "random"}),
            _step(2, "scale_features", parameters={"columns": ["x"], "method": "zscore"}),
        ]
        r = lint_plan(plan)
        assert r["ok"]  # not blocking, just a warning
        assert any(w["code"] == "ML_FIT_NOT_TRAIN_ONLY" for w in r["warnings"])

    def test_scale_after_split_with_fit_on_train_passes(self):
        plan = [
            _step(1, "train_test_split", parameters={"method": "random"}),
            _step(2, "scale_features",
                  parameters={"columns": ["x"], "method": "zscore", "fit_on": "train"}),
        ]
        r = lint_plan(plan)
        assert r["ok"]
        assert not any(w["code"] == "ML_FIT_NOT_TRAIN_ONLY" for w in r["warnings"])

    def test_fit_needing_without_split_warns(self):
        plan = [_step(1, "scale_features",
                      parameters={"columns": ["x"], "method": "zscore"})]
        r = lint_plan(plan)
        assert any(w["code"] == "ML_FIT_NO_SPLIT" for w in r["warnings"])

    def test_target_encoding_triggers_leakage_check(self):
        plan = [
            _step(1, "encode_categorical",
                  parameters={"column": "cat", "method": "target", "target_column": "y"}),
        ]
        r = lint_plan(plan)
        assert any(w["code"] == "ML_FIT_NO_SPLIT" for w in r["warnings"])

    def test_mean_imputation_triggers_leakage_check(self):
        plan = [
            _step(1, "fill_missing",
                  parameters={"column": "age", "strategy": "mean"}),
        ]
        r = lint_plan(plan)
        assert any(w["code"] == "ML_FIT_NO_SPLIT" for w in r["warnings"])

    def test_target_in_features_errors(self):
        plan = [
            _step(1, "train_test_split", parameters={"method": "random"}),
            _step(2, "scale_features",
                  parameters={"columns": ["x", "y_target"], "method": "zscore", "fit_on": "train"}),
        ]
        r = lint_plan(plan, target_column="y_target")
        assert not r["ok"]
        assert any(e["code"] == "TARGET_IN_FEATURES" for e in r["errors"])


class TestTimeSeriesSplit:
    def test_time_dataset_requires_time_split(self):
        plan = [
            _step(1, "lag_features",
                  parameters={"column": "price", "lags": [1, 7]}),
            _step(2, "train_test_split", parameters={"method": "random"}),
        ]
        r = lint_plan(plan)
        assert any(w["code"] == "TS_NEEDS_TIME_SPLIT" for w in r["warnings"])

    def test_time_dataset_with_time_split_passes(self):
        plan = [
            _step(1, "lag_features", parameters={"column": "price", "lags": [1]}),
            _step(2, "train_test_split", parameters={"method": "time"}),
        ]
        r = lint_plan(plan)
        assert not any(w["code"] == "TS_NEEDS_TIME_SPLIT" for w in r["warnings"])

    def test_schema_time_column_triggers_check(self):
        plan = [_step(1, "train_test_split", parameters={"method": "random"})]
        r = lint_plan(plan, schema={"order_date": "DATE", "amount": "DOUBLE"})
        assert any(w["code"] == "TS_NEEDS_TIME_SPLIT" for w in r["warnings"])


class TestColumnExistence:
    def test_unknown_column_warns(self):
        plan = [_step(1, "fill_missing",
                      parameters={"column": "nonexistent", "strategy": "constant", "value": 0})]
        r = lint_plan(plan, schema={"id": "INTEGER", "amount": "DOUBLE"})
        assert any(w["code"] == "UNKNOWN_COLUMN" for w in r["warnings"])

    def test_known_column_passes(self):
        plan = [_step(1, "fill_missing",
                      parameters={"column": "amount", "strategy": "constant", "value": 0})]
        r = lint_plan(plan, schema={"id": "INTEGER", "amount": "DOUBLE"})
        assert not any(w["code"] == "UNKNOWN_COLUMN" for w in r["warnings"])

    def test_column_match_is_case_insensitive(self):
        plan = [_step(1, "fill_missing",
                      parameters={"column": "Amount", "strategy": "constant", "value": 0})]
        r = lint_plan(plan, schema={"id": "INTEGER", "amount": "DOUBLE"})
        assert not any(w["code"] == "UNKNOWN_COLUMN" for w in r["warnings"])


class TestReportShape:
    def test_returns_expected_keys(self):
        r = lint_plan([_step(1, "clean", sql="SELECT 1")])
        assert set(r.keys()) == {"warnings", "errors", "auto_fixes", "ok"}
        assert isinstance(r["warnings"], list)
        assert isinstance(r["errors"], list)
        assert isinstance(r["ok"], bool)
