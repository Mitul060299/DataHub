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
                table_registry="{}",
                user_goal="dedupe and fix dates",
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
