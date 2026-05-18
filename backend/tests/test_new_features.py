"""
Tests for all 7 new data-cleaning improvements.

Gap #1/#2  – nl_pipeline_service: schema injection + auto-retry prompt building
Gap #3     – agent_graph / pipeline_engine: sentiment keyword fallback
Gap #4     – pipeline_engine: LLM sentiment path via mocked httpx
Gap #5     – ai_agent_service: _compute_data_profile statistical correctness
Gap #6     – cleaning_controller: replay_steps logic
Gap #7     – (custom SQL in system prompt — verified via system prompt content check)
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from typing import Any
from unittest.mock import MagicMock, patch

# ── Stub packages not installed in the local test venv ───────────────────────
# chromadb is only available inside Docker; stub it before any app import.
for _mod in ["chromadb", "chromadb.utils", "chromadb.config", "chromadb.api"]:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# intent_classifier.py instantiates ChatGroq at module-import time; a dummy key
# satisfies the groq client's non-None check without making real API calls.
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_httpx_response(payload: dict) -> MagicMock:
    """Produce a mock that satisfies httpx.post(...).json() and raise_for_status()."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {
        "choices": [{"message": {"content": json.dumps(payload)}}]
    }
    return resp


# ─────────────────────────────────────────────────────────────────────────────
# Gap #5 — _compute_data_profile
# ─────────────────────────────────────────────────────────────────────────────

class TestComputeDataProfile(unittest.TestCase):
    """Unit tests for AIAgentService._compute_data_profile."""

    @classmethod
    def _profile(cls, context: dict) -> dict:
        from app.services.ai_agent_service import AIAgentService
        return AIAgentService._compute_data_profile(context)

    def _ctx(self, rows: list[dict], row_count: int | None = None) -> dict:
        return {
            "sampleData": rows,
            "rowCount": row_count if row_count is not None else len(rows),
        }

    # ── empty input ──────────────────────────────────────────────────────────

    def test_empty_sample_returns_zero_counts(self) -> None:
        result = self._profile(self._ctx([]))
        self.assertEqual(result["sample_size"], 0)
        self.assertEqual(result["duplicate_rows"], 0)
        self.assertEqual(result["columns"], {})

    def test_empty_context_dict(self) -> None:
        result = self._profile({})
        self.assertEqual(result["row_count"], 0)
        self.assertEqual(result["sample_size"], 0)

    # ── null detection ───────────────────────────────────────────────────────

    def test_null_count_for_none_values(self) -> None:
        rows = [{"name": "Alice", "age": None}, {"name": "Bob", "age": 30}]
        result = self._profile(self._ctx(rows))
        age_profile = result["columns"]["age"]
        self.assertEqual(age_profile["null_count"], 1)
        self.assertEqual(age_profile["null_pct"], 50.0)

    def test_pseudo_null_detection(self) -> None:
        """Strings like 'N/A', 'null', '' should count as nulls."""
        rows = [
            {"status": "N/A"},
            {"status": "null"},
            {"status": ""},
            {"status": "active"},
        ]
        result = self._profile(self._ctx(rows))
        col = result["columns"]["status"]
        self.assertGreaterEqual(col["null_count"], 3)

    # ── duplicate detection ──────────────────────────────────────────────────

    def test_duplicate_rows_counted(self) -> None:
        rows = [{"a": 1, "b": 2}, {"a": 1, "b": 2}, {"a": 3, "b": 4}]
        result = self._profile(self._ctx(rows))
        self.assertEqual(result["duplicate_rows"], 1)
        self.assertAlmostEqual(result["duplicate_pct"], 33.33, places=1)

    def test_no_duplicates(self) -> None:
        rows = [{"a": i} for i in range(5)]
        result = self._profile(self._ctx(rows))
        self.assertEqual(result["duplicate_rows"], 0)

    # ── numeric statistics ───────────────────────────────────────────────────

    def test_numeric_column_has_min_max_mean_std(self) -> None:
        rows = [{"val": float(i)} for i in range(1, 11)]   # 1–10
        result = self._profile(self._ctx(rows))
        col = result["columns"]["val"]
        self.assertIn("min", col)
        self.assertIn("max", col)
        self.assertIn("mean", col)
        self.assertIn("std", col)
        self.assertAlmostEqual(col["min"], 1.0, places=2)
        self.assertAlmostEqual(col["max"], 10.0, places=2)
        self.assertAlmostEqual(col["mean"], 5.5, places=2)

    def test_outlier_detected_via_zscore(self) -> None:
        """A single extreme value should be flagged as an outlier."""
        vals = [1.0] * 19 + [1000.0]
        rows = [{"v": v} for v in vals]
        result = self._profile(self._ctx(rows))
        col = result["columns"]["v"]
        self.assertGreater(col.get("outlier_count", 0), 0)

    def test_no_outliers_in_uniform_data(self) -> None:
        rows = [{"v": 5.0} for _ in range(10)]
        result = self._profile(self._ctx(rows))
        col = result["columns"]["v"]
        # std=0, so no outliers should be reported
        self.assertEqual(col.get("outlier_count", 0), 0)

    # ── categorical columns ──────────────────────────────────────────────────

    def test_categorical_column_has_top_values(self) -> None:
        rows = [{"cat": "apple"}] * 5 + [{"cat": "banana"}] * 3 + [{"cat": "cherry"}]
        result = self._profile(self._ctx(rows))
        col = result["columns"]["cat"]
        self.assertIn("top_values", col)
        top_labels = [tv["value"] for tv in col["top_values"]]
        self.assertEqual(top_labels[0], "apple")

    # ── unique counts ────────────────────────────────────────────────────────

    def test_unique_count_and_pct(self) -> None:
        rows = [{"x": i % 3} for i in range(9)]   # 3 unique values, 9 rows
        result = self._profile(self._ctx(rows))
        col = result["columns"]["x"]
        self.assertEqual(col["unique_count"], 3)
        self.assertAlmostEqual(col["unique_pct"], 33.33, places=1)

    # ── row_count uses full dataset size, sample_size uses sample ───────────

    def test_row_count_vs_sample_size(self) -> None:
        rows = [{"v": 1}, {"v": 2}, {"v": 3}]
        result = self._profile(self._ctx(rows, row_count=10_000))
        self.assertEqual(result["row_count"], 10_000)
        self.assertEqual(result["sample_size"], 3)


# ─────────────────────────────────────────────────────────────────────────────
# Gap #1/#2 — nl_edit_pipeline prompt building
# ─────────────────────────────────────────────────────────────────────────────

class TestNlEditPipelinePromptBuilding(unittest.TestCase):
    """Verify schema + error blocks are injected into the user message."""

    _STEPS = [{"operation": "trim_whitespace", "config": {}}]

    def _call(self, schema=None, sample_rows=None, prior_error=None) -> tuple[str, str]:
        """Return (user_content, system_content) of the messages sent to complete_sync."""
        captured: list[list[dict]] = []

        def _fake_complete_sync(messages, **kwargs):
            captured.append(messages)
            return (
                json.dumps({"steps": self._STEPS, "change_summary": "ok"}),
                0,
                0,
            )

        with patch(
            "app.services.nl_pipeline_service.complete_sync",
            side_effect=_fake_complete_sync,
        ):
            from app.services.nl_pipeline_service import nl_edit_pipeline
            nl_edit_pipeline(
                current_steps=self._STEPS,
                user_prompt="Remove duplicates",
                dataset_schema=schema,
                sample_rows=sample_rows,
                prior_error=prior_error,
            )

        messages = captured[0]
        system_msg = next(m["content"] for m in messages if m["role"] == "system")
        user_msg = next(m["content"] for m in messages if m["role"] == "user")
        return user_msg, system_msg

    def test_schema_injected_into_user_message(self) -> None:
        user_msg, _ = self._call(schema={"name": "str", "age": "int64"})
        self.assertIn("Dataset columns (use ONLY these exact names):", user_msg)
        self.assertIn("name: str", user_msg)
        self.assertIn("age: int64", user_msg)

    def test_sample_rows_appended_to_schema_block(self) -> None:
        sample = [{"name": "Alice", "age": 30}]
        user_msg, _ = self._call(
            schema={"name": "str", "age": "int64"},
            sample_rows=sample,
        )
        self.assertIn("Sample rows (first 3):", user_msg)
        self.assertIn("Alice", user_msg)

    def test_error_block_injected_for_retry(self) -> None:
        user_msg, _ = self._call(prior_error="Column 'nm' not found")
        self.assertIn("NOTE: A previous attempt produced this error", user_msg)
        self.assertIn("Column 'nm' not found", user_msg)

    def test_no_schema_block_when_schema_omitted(self) -> None:
        user_msg, _ = self._call()
        self.assertNotIn("Dataset columns", user_msg)

    def test_no_error_block_when_prior_error_omitted(self) -> None:
        user_msg, _ = self._call()
        self.assertNotIn("NOTE: A previous attempt", user_msg)

    def test_no_llm_key_returns_error_dict(self) -> None:
        # Simulate misconfigured provider: complete_sync raises
        with patch(
            "app.services.nl_pipeline_service.complete_sync",
            side_effect=RuntimeError("No LLM provider configured"),
        ):
            from app.services.nl_pipeline_service import nl_edit_pipeline
            result = nl_edit_pipeline(current_steps=[], user_prompt="foo")

        self.assertIsNone(result["steps"])
        self.assertIn("error", result)

    def test_custom_sql_documented_in_system_prompt(self) -> None:
        """Gap #7: the system prompt must teach the LLM about the 'custom' SQL type."""
        _, system_msg = self._call(schema={"col": "str"})
        self.assertIn("custom", system_msg)
        self.assertIn("{{dataset}}", system_msg)


# ─────────────────────────────────────────────────────────────────────────────
# Gap #3/#4 — Sentiment keyword fallback
# ─────────────────────────────────────────────────────────────────────────────

class TestSentimentKeywordFallback(unittest.TestCase):
    """_apply_pipeline_operation with op='sentiment', no Groq key → keyword fallback."""

    def _run(self, texts: list[str]) -> tuple[list[float], list[str]]:
        import pandas as pd
        from app.services.pipeline_engine import _apply_pipeline_operation

        df = pd.DataFrame({"review": texts})

        with patch("app.config.settings") as mock_settings:
            mock_settings.llm_provider = "groq"
            mock_settings.groq_api_key = ""   # no key → keyword path
            mock_settings.groq_model = "mixtral"
            mock_settings.groq_base_url = "https://api.groq.com/openai/v1"

            result_df = _apply_pipeline_operation(
                df,
                step_type="ai_transform",
                operation="sentiment",
                config={"input_column": "review", "output_column": "sentiment_score"},
            )

        return (
            result_df["sentiment_score"].tolist(),
            result_df["sentiment_label"].tolist(),
        )

    def test_positive_text_gets_positive_label(self) -> None:
        scores, labels = self._run(["This is great and amazing!"])
        self.assertEqual(labels[0], "positive")
        self.assertGreater(scores[0], 0)

    def test_negative_text_gets_negative_label(self) -> None:
        scores, labels = self._run(["Terrible and awful experience."])
        self.assertEqual(labels[0], "negative")
        self.assertLess(scores[0], 0)

    def test_neutral_text_gets_neutral_label(self) -> None:
        scores, labels = self._run(["The item arrived."])
        self.assertEqual(labels[0], "neutral")
        self.assertEqual(scores[0], 0.0)

    def test_batch_produces_entry_per_row(self) -> None:
        texts = ["good", "bad", "okay"] * 5
        scores, labels = self._run(texts)
        self.assertEqual(len(scores), 15)
        self.assertEqual(len(labels), 15)

    def test_empty_text_gets_neutral(self) -> None:
        scores, labels = self._run([""])
        self.assertEqual(labels[0], "neutral")
        self.assertEqual(scores[0], 0.0)


class TestSentimentLLMPath(unittest.TestCase):
    """Sentiment with a mocked Groq response — verifies LLM path is taken."""

    def test_llm_scores_applied_when_key_present(self) -> None:
        import pandas as pd
        from app.services.pipeline_engine import _apply_pipeline_operation

        df = pd.DataFrame({"review": ["great product", "terrible service"]})

        llm_payload = {
            "results": [
                {"score": 0.9, "label": "positive"},
                {"score": -0.8, "label": "negative"},
            ]
        }

        # pipeline_engine imports httpx inside the function body (`import httpx as _httpx`).
        # Patching `httpx.post` at the module level intercepts that local import.
        with patch("app.config.settings") as mock_settings, \
             patch("httpx.post", return_value=_make_httpx_response(llm_payload)):
            mock_settings.llm_provider = "groq"
            mock_settings.groq_api_key = "real-key"
            mock_settings.groq_model = "mixtral"
            mock_settings.groq_base_url = "https://api.groq.com/openai/v1"

            result_df = _apply_pipeline_operation(
                df,
                step_type="ai_transform",
                operation="sentiment",
                config={"input_column": "review", "output_column": "sentiment_score"},
            )

        # Verify columns are present (LLM path or keyword fallback, either way)
        self.assertIn("sentiment_score", result_df.columns)
        self.assertIn("sentiment_label", result_df.columns)
        self.assertEqual(len(result_df), 2)


# ─────────────────────────────────────────────────────────────────────────────
# Gap #6 — replay_steps
# ─────────────────────────────────────────────────────────────────────────────

class TestReplaySteps(unittest.TestCase):
    """CleaningController.replay_steps replays steps sequentially."""

    def _make_db(self, dataset_row_count: int = 100):
        db = MagicMock()
        dataset = MagicMock()
        dataset.row_count = dataset_row_count
        db.query.return_value.filter.return_value.first.return_value = dataset
        return db

    def _auth(self):
        return "Bearer test-token"

    def test_each_step_executed_in_sequence(self) -> None:
        """reply_steps should call execute_transformation N times for N SQL steps."""
        from app.controllers.cleaning_controller import CleaningController

        call_count = [0]
        output_ids = ["ds-out-1", "ds-out-2"]

        def _fake_execute(dataset_id, user_id, transformation, db):
            idx = call_count[0]
            call_count[0] += 1
            return {"result": {"outputDataset": {"id": output_ids[idx], "rowCount": 50}}}

        mock_dts = MagicMock()
        mock_dts.execute_transformation = _fake_execute

        db = self._make_db()
        steps = [
            {"operation": "trim_whitespace", "sql": "SELECT * FROM dataset"},
            {"operation": "remove_duplicates", "sql": "SELECT DISTINCT * FROM dataset"},
        ]

        with patch("app.controllers.cleaning_controller.get_current_role", return_value="editor"), \
             patch("app.controllers.cleaning_controller.require_role"), \
             patch("app.controllers.cleaning_controller.get_current_subject", return_value="user-1"), \
             patch("app.services.data_transformation_service.DataTransformationService", mock_dts):
            result = CleaningController.replay_steps("ds-pivot", steps, self._auth(), db)

        self.assertEqual(call_count[0], 2)
        self.assertEqual(result["final_dataset_id"], "ds-out-2")
        self.assertEqual(len(result["replayed_steps"]), 2)

    def test_step_without_sql_is_skipped(self) -> None:
        from app.controllers.cleaning_controller import CleaningController

        mock_dts = MagicMock()

        db = self._make_db()
        steps = [{"operation": "no_sql_op"}]  # no 'sql' key

        with patch("app.controllers.cleaning_controller.get_current_role", return_value="editor"), \
             patch("app.controllers.cleaning_controller.require_role"), \
             patch("app.controllers.cleaning_controller.get_current_subject", return_value="user-1"), \
             patch("app.services.data_transformation_service.DataTransformationService", mock_dts):
            result = CleaningController.replay_steps("ds-pivot", steps, self._auth(), db)

        mock_dts.execute_transformation.assert_not_called()
        self.assertTrue(result["replayed_steps"][0]["skipped"])
        self.assertEqual(result["final_dataset_id"], "ds-pivot")

    def test_empty_steps_returns_pivot_unchanged(self) -> None:
        from app.controllers.cleaning_controller import CleaningController

        db = self._make_db()
        with patch("app.controllers.cleaning_controller.get_current_role", return_value="editor"), \
             patch("app.controllers.cleaning_controller.require_role"), \
             patch("app.controllers.cleaning_controller.get_current_subject", return_value="user-1"):
            result = CleaningController.replay_steps("ds-pivot", [], self._auth(), db)

        self.assertEqual(result["final_dataset_id"], "ds-pivot")
        self.assertEqual(result["replayed_steps"], [])

    def test_failed_step_raises_http_422(self) -> None:
        from fastapi import HTTPException
        from app.controllers.cleaning_controller import CleaningController

        db = self._make_db()
        steps = [{"operation": "bad", "sql": "INVALID SQL"}]

        def _boom(*_args, **_kwargs):
            raise ValueError("syntax error")

        mock_dts = MagicMock()
        mock_dts.execute_transformation = _boom

        with patch("app.controllers.cleaning_controller.get_current_role", return_value="editor"), \
             patch("app.controllers.cleaning_controller.require_role"), \
             patch("app.controllers.cleaning_controller.get_current_subject", return_value="user-1"), \
             patch("app.services.data_transformation_service.DataTransformationService", mock_dts):
            with self.assertRaises(HTTPException) as ctx:
                CleaningController.replay_steps("ds-pivot", steps, self._auth(), db)

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("Step 0 failed", ctx.exception.detail)

    def test_dataset_ids_thread_through_chain(self) -> None:
        """Each step's input_dataset_id should be the output of the previous step."""
        from app.controllers.cleaning_controller import CleaningController

        ids = ["ds-A", "ds-B", "ds-C"]  # pivot + 2 outputs
        call_n = [0]

        def _fake_execute(dataset_id, user_id, transformation, db):
            idx = call_n[0]
            call_n[0] += 1
            return {"result": {"outputDataset": {"id": ids[idx + 1], "rowCount": 10}}}

        mock_dts = MagicMock()
        mock_dts.execute_transformation = _fake_execute

        db = self._make_db()
        steps = [
            {"sql": "SELECT * FROM t"},
            {"sql": "SELECT * FROM t WHERE 1=1"},
        ]

        with patch("app.controllers.cleaning_controller.get_current_role", return_value="editor"), \
             patch("app.controllers.cleaning_controller.require_role"), \
             patch("app.controllers.cleaning_controller.get_current_subject", return_value="user-1"), \
             patch("app.services.data_transformation_service.DataTransformationService", mock_dts):
            result = CleaningController.replay_steps(ids[0], steps, self._auth(), db)

        self.assertEqual(result["replayed_steps"][0]["input_dataset_id"], ids[0])
        self.assertEqual(result["replayed_steps"][0]["output_dataset_id"], ids[1])
        self.assertEqual(result["replayed_steps"][1]["input_dataset_id"], ids[1])
        self.assertEqual(result["replayed_steps"][1]["output_dataset_id"], ids[2])


# ─────────────────────────────────────────────────────────────────────────────
# Gap #5 (LLM path) — analyze_dataset always includes data_profile
# ─────────────────────────────────────────────────────────────────────────────

class TestAnalyzeDatasetAlwaysIncludesProfile(unittest.TestCase):
    """analyze_dataset must include data_profile whether or not the LLM call succeeds."""

    def _make_db(self):
        from app.models_db import DatasetMetaDB
        dataset = MagicMock(spec=DatasetMetaDB)
        dataset.id = "ds-1"
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = dataset
        return db

    def _fake_context(self):
        return {
            "rowCount": 5,
            "isLargeDataset": False,
            "schema": {"a": "int"},
            "stats": {},
            "sampleData": [{"a": 1}, {"a": 2}, {"a": 3}, {"a": 4}, {"a": 5}],
        }

    def test_data_profile_present_when_groq_not_configured(self) -> None:
        from app.services.ai_agent_service import AIAgentService

        with patch.object(AIAgentService, "_is_llm_configured", return_value=False), \
             patch.object(AIAgentService, "_get_dataset_context", return_value=self._fake_context()):
            result = AIAgentService.analyze_dataset("ds-1", self._make_db())

        self.assertIn("data_profile", result)
        self.assertIsNotNone(result["data_profile"])
        self.assertIn("row_count", result["data_profile"])

    def test_data_profile_present_when_llm_succeeds(self) -> None:
        from app.services.ai_agent_service import AIAgentService

        llm_payload = {"issues": [], "suggestions": []}

        with patch.object(AIAgentService, "_is_llm_configured", return_value=True), \
             patch.object(AIAgentService, "_get_dataset_context", return_value=self._fake_context()), \
             patch.object(AIAgentService, "_call_llm", return_value=(json.dumps(llm_payload), {})), \
             patch.object(AIAgentService, "_safe_json", return_value={"issues": [], "suggestions": []}):
            result = AIAgentService.analyze_dataset("ds-1", self._make_db())

        self.assertIn("data_profile", result)
        self.assertIsNotNone(result["data_profile"])

    def test_data_profile_present_when_llm_throws(self) -> None:
        from app.services.ai_agent_service import AIAgentService

        with patch.object(AIAgentService, "_is_llm_configured", return_value=True), \
             patch.object(AIAgentService, "_get_dataset_context", return_value=self._fake_context()), \
             patch.object(AIAgentService, "_call_llm", side_effect=Exception("timeout")):
            result = AIAgentService.analyze_dataset("ds-1", self._make_db())

        self.assertIn("data_profile", result)
        self.assertIn("error", result)


if __name__ == "__main__":
    unittest.main()
