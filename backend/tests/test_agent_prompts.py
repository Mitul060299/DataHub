"""Test that the agent's prompts include the data preparation capabilities we claim.

These tests guard against regressions in prompt content. They verify the
PLANNER_SYSTEM_PROMPT contains concrete recipes for each capability advertised
on the product homepage (fixing inconsistent formats, removing duplicates,
standardizing columns, merging files, handling missing values, transforming
datasets) and that the REFLECT_PROMPT has actionable error-fix patterns.
"""
import pytest

from app.services.agent.prompts import (
    INTENT_CLASSIFIER_PROMPT,
    PLANNER_SYSTEM_PROMPT,
    REFLECT_PROMPT,
)
from app.services.agent.auto_prompts import _SUPPORTED_OPERATIONS


class TestPlannerCookbook:
    """The planner prompt must carry the data-prep cookbook."""

    def test_has_cookbook_header(self):
        assert "DATA PREPARATION COOKBOOK" in PLANNER_SYSTEM_PROMPT

    def test_format_fixing_recipes(self):
        assert "TRY_STRPTIME" in PLANNER_SYSTEM_PROMPT  # date unification
        assert "REGEXP_REPLACE" in PLANNER_SYSTEM_PROMPT  # phone/currency
        assert "LOWER(TRIM" in PLANNER_SYSTEM_PROMPT  # email
        assert "INITCAP" in PLANNER_SYSTEM_PROMPT  # case standardization
        assert "Boolean unification" in PLANNER_SYSTEM_PROMPT

    def test_dedup_recipes(self):
        assert "Exact duplicates" in PLANNER_SYSTEM_PROMPT
        assert "ROW_NUMBER() OVER" in PLANNER_SYSTEM_PROMPT  # keep latest
        assert "jaro_winkler_similarity" in PLANNER_SYSTEM_PROMPT  # fuzzy

    def test_merge_recipes(self):
        assert "MERGING FILES" in PLANNER_SYSTEM_PROMPT
        assert "UNION ALL" in PLANNER_SYSTEM_PROMPT
        assert "NULL fillers" in PLANNER_SYSTEM_PROMPT  # schema alignment
        assert "ANTI-JOIN" in PLANNER_SYSTEM_PROMPT

    def test_missing_value_strategies(self):
        # All five canonical strategies must be present
        for strategy in ("Constant fill", "Mean", "Mode", "Forward-fill", "Flag-and-keep"):
            assert strategy in PLANNER_SYSTEM_PROMPT, f"missing strategy: {strategy}"

    def test_transform_recipes(self):
        assert "STR_SPLIT" in PLANNER_SYSTEM_PROMPT
        assert "CONCAT_WS" in PLANNER_SYSTEM_PROMPT
        assert "Bucketize" in PLANNER_SYSTEM_PROMPT

    def test_multi_rule_goal_chain(self):
        assert "MULTI-RULE GOALS" in PLANNER_SYSTEM_PROMPT
        assert "depends_on" in PLANNER_SYSTEM_PROMPT


class TestMLPrepCookbook:
    """Section H must cover the ML / AI preparation steps."""

    def test_has_ml_prep_header(self):
        assert "ML / AI PREPARATION" in PLANNER_SYSTEM_PROMPT

    def test_scaling_recipes(self):
        # Z-score, min-max, robust, log, sqrt
        assert "STDDEV_SAMP" in PLANNER_SYSTEM_PROMPT  # z-score
        assert "Min-max scaling" in PLANNER_SYSTEM_PROMPT
        assert "Robust scaling" in PLANNER_SYSTEM_PROMPT
        assert "QUANTILE_CONT" in PLANNER_SYSTEM_PROMPT
        assert "LN(" in PLANNER_SYSTEM_PROMPT  # log transform
        assert "SQRT(" in PLANNER_SYSTEM_PROMPT

    def test_encoding_recipes(self):
        # Label, ordinal, one-hot, frequency, target, hash
        assert "Label encoding" in PLANNER_SYSTEM_PROMPT
        assert "DENSE_RANK" in PLANNER_SYSTEM_PROMPT
        assert "Ordinal encoding" in PLANNER_SYSTEM_PROMPT
        assert "One-hot encoding" in PLANNER_SYSTEM_PROMPT
        assert "Frequency / count encoding" in PLANNER_SYSTEM_PROMPT
        assert "Target / mean encoding" in PLANNER_SYSTEM_PROMPT
        assert "leakage" in PLANNER_SYSTEM_PROMPT.lower()

    def test_feature_engineering_recipes(self):
        assert "Date-part features" in PLANNER_SYSTEM_PROMPT
        assert "Cyclical encoding" in PLANNER_SYSTEM_PROMPT
        assert "Lag / lead" in PLANNER_SYSTEM_PROMPT
        assert "Rolling window" in PLANNER_SYSTEM_PROMPT
        assert "Interaction / polynomial" in PLANNER_SYSTEM_PROMPT

    def test_dimensionality_reduction(self):
        assert "PCA" in PLANNER_SYSTEM_PROMPT
        assert "Variance threshold" in PLANNER_SYSTEM_PROMPT
        assert "Correlation filter" in PLANNER_SYSTEM_PROMPT

    def test_label_target_prep(self):
        assert "Binarize" in PLANNER_SYSTEM_PROMPT
        assert "Multi-class labelling" in PLANNER_SYSTEM_PROMPT
        assert "Class balance check" in PLANNER_SYSTEM_PROMPT
        assert "undersampling" in PLANNER_SYSTEM_PROMPT.lower()

    def test_train_test_split(self):
        assert "TRAIN / VALIDATION / TEST SPLIT" in PLANNER_SYSTEM_PROMPT
        assert "Deterministic random split" in PLANNER_SYSTEM_PROMPT
        assert "Time-based split" in PLANNER_SYSTEM_PROMPT
        assert "Stratified split" in PLANNER_SYSTEM_PROMPT
        # Anti-pattern guardrail
        assert "NEVER use RANDOM()" in PLANNER_SYSTEM_PROMPT

    def test_leakage_guardrails(self):
        assert "LEAKAGE GUARDRAILS" in PLANNER_SYSTEM_PROMPT
        assert "TRAIN ONLY" in PLANNER_SYSTEM_PROMPT

    def test_ml_multi_step_template(self):
        assert "ML-PREP MULTI-STEP TEMPLATE" in PLANNER_SYSTEM_PROMPT


class TestAnalyticsCookbook:
    """Section I — advanced analytics recipes."""

    def test_has_analytics_header(self):
        assert "ADVANCED ANALYTICS" in PLANNER_SYSTEM_PROMPT

    def test_statistical_tests(self):
        assert "t-test" in PLANNER_SYSTEM_PROMPT.lower()
        assert "chi-square" in PLANNER_SYSTEM_PROMPT.lower() or "chi_square" in PLANNER_SYSTEM_PROMPT.lower()
        assert "ANOVA" in PLANNER_SYSTEM_PROMPT

    def test_cohort_and_funnel(self):
        assert "COHORT" in PLANNER_SYSTEM_PROMPT.upper()
        assert "retention" in PLANNER_SYSTEM_PROMPT.lower()
        assert "Funnel" in PLANNER_SYSTEM_PROMPT
        assert "FILTER (WHERE" in PLANNER_SYSTEM_PROMPT  # funnel pattern

    def test_rfm_segmentation(self):
        assert "RFM" in PLANNER_SYSTEM_PROMPT
        assert "NTILE" in PLANNER_SYSTEM_PROMPT
        assert "recency" in PLANNER_SYSTEM_PROMPT.lower()

    def test_window_patterns(self):
        assert "QUALIFY" in PLANNER_SYSTEM_PROMPT  # top-N per group
        assert "Percent-of-total" in PLANNER_SYSTEM_PROMPT
        assert "cumulative" in PLANNER_SYSTEM_PROMPT.lower()
        assert "MoM" in PLANNER_SYSTEM_PROMPT or "YoY" in PLANNER_SYSTEM_PROMPT

    def test_time_series_decomp_and_forecast(self):
        assert "Trend extraction" in PLANNER_SYSTEM_PROMPT
        assert "Seasonality" in PLANNER_SYSTEM_PROMPT
        assert "Anomaly detection" in PLANNER_SYSTEM_PROMPT
        assert "Naive forecast" in PLANNER_SYSTEM_PROMPT
        assert "moving-average forecast" in PLANNER_SYSTEM_PROMPT
        assert "Prophet" in PLANNER_SYSTEM_PROMPT

    def test_geospatial(self):
        assert "Haversine" in PLANNER_SYSTEM_PROMPT
        assert "RADIANS" in PLANNER_SYSTEM_PROMPT
        assert "spatial" in PLANNER_SYSTEM_PROMPT.lower()

    def test_sessionization(self):
        assert "Sessionize" in PLANNER_SYSTEM_PROMPT
        assert "gap_seconds" in PLANNER_SYSTEM_PROMPT


class TestVisualizationCookbook:
    """Section J — visualization recipes."""

    def test_has_viz_header(self):
        assert "VISUALIZATION" in PLANNER_SYSTEM_PROMPT
        assert "CHART-TYPE SELECTOR" in PLANNER_SYSTEM_PROMPT

    def test_chart_types_covered(self):
        for ct in (
            "histogram", "box plot", "violin", "scatter", "heatmap",
            "treemap", "funnel", "sankey", "donut", "sparkline",
        ):
            assert ct in PLANNER_SYSTEM_PROMPT.lower(), f"missing chart: {ct}"

    def test_auto_binning(self):
        assert "Sturges" in PLANNER_SYSTEM_PROMPT
        assert "LOG2" in PLANNER_SYSTEM_PROMPT

    def test_faceting_and_annotations(self):
        assert "SMALL MULTIPLES" in PLANNER_SYSTEM_PROMPT
        assert "REGR_SLOPE" in PLANNER_SYSTEM_PROMPT  # trend line
        assert "reference_lines" in PLANNER_SYSTEM_PROMPT
        assert "confidence" in PLANNER_SYSTEM_PROMPT.lower()

    def test_palette_guidance(self):
        assert "Sequential" in PLANNER_SYSTEM_PROMPT
        assert "Diverging" in PLANNER_SYSTEM_PROMPT
        assert "Categorical" in PLANNER_SYSTEM_PROMPT

    def test_dashboard_composition(self):
        assert "DASHBOARD COMPOSITION" in PLANNER_SYSTEM_PROMPT

    def test_anti_patterns(self):
        assert "ANTI-PATTERNS" in PLANNER_SYSTEM_PROMPT
        # No 3D / exploded pies
        assert "3D" in PLANNER_SYSTEM_PROMPT


class TestAdvancedMLCookbook:
    """Section K — advanced ML prep (text, importance, reproducibility, linter)."""

    def test_text_vectorization(self):
        assert "TEXT VECTORIZATION" in PLANNER_SYSTEM_PROMPT
        assert "TF-IDF" in PLANNER_SYSTEM_PROMPT
        assert "N-GRAMS" in PLANNER_SYSTEM_PROMPT

    def test_feature_importance(self):
        assert "FEATURE-IMPORTANCE" in PLANNER_SYSTEM_PROMPT
        assert "point-biserial" in PLANNER_SYSTEM_PROMPT.lower()
        assert "mutual-information" in PLANNER_SYSTEM_PROMPT.lower()

    def test_reproducibility_metadata(self):
        assert "REPRODUCIBILITY METADATA" in PLANNER_SYSTEM_PROMPT
        assert "schema_fingerprint" in PLANNER_SYSTEM_PROMPT

    def test_fit_transform_separation(self):
        assert "FIT / TRANSFORM SEPARATION" in PLANNER_SYSTEM_PROMPT

    def test_sklearn_pipeline_export(self):
        assert "SKLEARN PIPELINE EXPORT" in PLANNER_SYSTEM_PROMPT
        assert "pipeline.py" in PLANNER_SYSTEM_PROMPT

    def test_leakage_linter_section(self):
        assert "LEAKAGE LINTER" in PLANNER_SYSTEM_PROMPT


class TestReflectPrompt:
    """REFLECT_PROMPT must teach the model to recognize common errors."""

    def test_has_common_error_patterns(self):
        assert "COMMON ERROR PATTERNS" in REFLECT_PROMPT
        assert "* EXCLUDE" in REFLECT_PROMPT  # binder collision fix
        assert "TRY_CAST" in REFLECT_PROMPT  # conversion error fix
        assert "backtick" in REFLECT_PROMPT.lower()  # parser error fix
        assert "ambiguous" in REFLECT_PROMPT.lower()  # join disambiguation


class TestIntentClassifier:
    """Intent classifier must disambiguate merge/format/impute requests."""

    def test_has_disambiguation_hints(self):
        assert "DISAMBIGUATION HINTS" in INTENT_CLASSIFIER_PROMPT
        # Merge vs join distinction
        assert "union" in INTENT_CLASSIFIER_PROMPT.lower()
        assert "lookup" in INTENT_CLASSIFIER_PROMPT.lower()
        # Format-fixing routes to clean
        assert "standardize" in INTENT_CLASSIFIER_PROMPT.lower()


class TestAutoSupportedOps:
    """Auto-mode operation list must document semantics for the planner."""

    def test_has_semantics_section(self):
        assert "OPERATION SEMANTICS" in _SUPPORTED_OPERATIONS

    def test_documents_imputation_strategies(self):
        for s in ("constant", "mean", "median", "mode", "forward_fill", "drop", "flag"):
            assert s in _SUPPORTED_OPERATIONS, f"missing strategy: {s}"

    def test_documents_dedup_policies(self):
        for p in ("exact", "case_insensitive", "trim_insensitive", "fuzzy"):
            assert p in _SUPPORTED_OPERATIONS, f"missing policy: {p}"

    def test_documents_outlier_methods(self):
        for m in ("iqr", "zscore", "percentile"):
            assert m in _SUPPORTED_OPERATIONS, f"missing method: {m}"

    def test_documents_format_recipes(self):
        assert "FORMAT-FIXING RECIPES" in _SUPPORTED_OPERATIONS
        assert "TRY_STRPTIME" in _SUPPORTED_OPERATIONS

    def test_documents_ml_prep_ops(self):
        for op in (
            "scale_features", "encode_categorical", "engineer_datetime",
            "engineer_cyclical", "lag_features", "rolling_window",
            "polynomial_features", "dimensionality_reduction",
            "variance_threshold", "correlation_filter", "binarize_target",
            "balance_classes", "train_test_split",
        ):
            assert op in _SUPPORTED_OPERATIONS, f"missing ML op: {op}"

    def test_documents_scaling_methods(self):
        for m in ("zscore", "minmax", "robust", "log", "sqrt"):
            assert m in _SUPPORTED_OPERATIONS, f"missing scaling: {m}"

    def test_documents_encoding_methods(self):
        for m in ("label", "ordinal", "onehot", "frequency", "target", "hash"):
            assert m in _SUPPORTED_OPERATIONS, f"missing encoding: {m}"

    def test_documents_split_methods(self):
        for m in ("random", "time", "stratified"):
            assert m in _SUPPORTED_OPERATIONS, f"missing split method: {m}"

    def test_documents_leakage_guardrails(self):
        assert "LEAKAGE GUARDRAILS" in _SUPPORTED_OPERATIONS


class TestPromptFormatable:
    """The planner prompt must still format cleanly with the expected variables."""

    def test_planner_prompt_formats(self):
        try:
            PLANNER_SYSTEM_PROMPT.format(
                schema="{}",
                stats="{}",
                sample_rows="[]",
                pipeline_steps="[]",
                available_templates="[]",
                calculated_columns="[]",
                dashboards="[]",
                secondary_datasets="{}",
                cross_pipeline_inputs="[]",
                table_registry="{}",
                user_goal="dedupe and fix dates",
                glossary="(none)",
            )
        except KeyError as e:
            pytest.fail(f"PLANNER_SYSTEM_PROMPT has unescaped placeholder: {e}")

    def test_reflect_prompt_formats(self):
        try:
            REFLECT_PROMPT.format(
                schema="{}",
                stats="{}",
                operation="clean",
                table_registry="{}",
                failed_sql="SELECT 1",
                error="oops",
            )
        except KeyError as e:
            pytest.fail(f"REFLECT_PROMPT has unescaped placeholder: {e}")

    def test_intent_prompt_formats(self):
        try:
            INTENT_CLASSIFIER_PROMPT.format(table_registry="{}")
        except KeyError as e:
            pytest.fail(f"INTENT_CLASSIFIER_PROMPT has unescaped placeholder: {e}")
