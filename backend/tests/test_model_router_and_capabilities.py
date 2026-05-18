"""Tests for model_router — plan-complexity heuristic and capability endpoint."""

import os
import unittest
from unittest.mock import patch

from app.services.agent.model_router import (
    is_simple_plan_goal,
    select_model,
    _FAST_DEFAULT,
    _VERSATILE_DEFAULT,
)


# ═════════════════════════════════════════════════════════════════════════════
# is_simple_plan_goal heuristic
# ═════════════════════════════════════════════════════════════════════════════

class TestSimplePlanGoal(unittest.TestCase):
    def test_short_clean_request_is_simple(self):
        self.assertTrue(is_simple_plan_goal("remove duplicate rows"))

    def test_short_fill_missing_is_simple(self):
        self.assertTrue(is_simple_plan_goal("fill missing values"))

    def test_long_phrase_is_not_simple(self):
        # > 10 words
        self.assertFalse(is_simple_plan_goal(
            "remove duplicates and then fill missing values and sort by date ascending"
        ))

    def test_cohort_keyword_is_complex(self):
        self.assertFalse(is_simple_plan_goal("cohort retention by week"))

    def test_rfm_keyword_is_complex(self):
        self.assertFalse(is_simple_plan_goal("rfm segmentation"))

    def test_forecast_keyword_is_complex(self):
        self.assertFalse(is_simple_plan_goal("forecast next month"))

    def test_pipeline_keyword_is_complex(self):
        self.assertFalse(is_simple_plan_goal("build a pipeline"))

    def test_dashboard_keyword_is_complex(self):
        self.assertFalse(is_simple_plan_goal("create a dashboard"))

    def test_haversine_keyword_is_complex(self):
        self.assertFalse(is_simple_plan_goal("haversine distance between stores"))

    def test_ml_train_keyword_is_complex(self):
        self.assertFalse(is_simple_plan_goal("train test split"))

    def test_empty_string_is_simple(self):
        self.assertTrue(is_simple_plan_goal(""))

    def test_whitespace_only_is_simple(self):
        self.assertTrue(is_simple_plan_goal("   "))


# ═════════════════════════════════════════════════════════════════════════════
# select_model routing
# ═════════════════════════════════════════════════════════════════════════════

class TestSelectModel(unittest.TestCase):
    def _env(self, enabled: bool):
        val = "true" if enabled else "false"
        return patch.dict(os.environ, {"LLM_ROUTER_ENABLED": val})

    def test_router_disabled_always_versatile(self):
        with self._env(False):
            self.assertEqual(select_model("classify"), _VERSATILE_DEFAULT)
            self.assertEqual(select_model("converse"), _VERSATILE_DEFAULT)
            self.assertEqual(select_model("plan"), _VERSATILE_DEFAULT)
            self.assertEqual(select_model("plan", goal="cohort retention"), _VERSATILE_DEFAULT)

    def test_router_enabled_classify_is_fast(self):
        with self._env(True):
            self.assertEqual(select_model("classify"), _FAST_DEFAULT)

    def test_router_enabled_converse_is_fast(self):
        with self._env(True):
            self.assertEqual(select_model("converse"), _FAST_DEFAULT)

    def test_router_enabled_reflect_is_versatile(self):
        with self._env(True):
            self.assertEqual(select_model("reflect"), _VERSATILE_DEFAULT)

    def test_router_enabled_transform_is_versatile(self):
        with self._env(True):
            self.assertEqual(select_model("transform"), _VERSATILE_DEFAULT)

    def test_router_enabled_plan_no_goal_is_versatile(self):
        with self._env(True):
            self.assertEqual(select_model("plan"), _VERSATILE_DEFAULT)

    def test_router_enabled_plan_simple_goal_is_fast(self):
        with self._env(True):
            self.assertEqual(select_model("plan", goal="remove duplicates"), _FAST_DEFAULT)

    def test_router_enabled_plan_complex_goal_is_versatile(self):
        with self._env(True):
            self.assertEqual(select_model("plan", goal="cohort retention analysis"), _VERSATILE_DEFAULT)

    def test_router_enabled_plan_rfm_goal_is_versatile(self):
        with self._env(True):
            self.assertEqual(select_model("plan", goal="rfm segmentation"), _VERSATILE_DEFAULT)

    def test_custom_fast_model_env_var(self):
        with self._env(True):
            with patch.dict(os.environ, {"GROQ_FAST_MODEL": "custom-fast-model"}):
                result = select_model("classify")
                self.assertEqual(result, "custom-fast-model")

    def test_custom_versatile_model_env_var(self):
        with self._env(False):
            with patch.dict(os.environ, {"GROQ_MODEL": "custom-versatile-model"}):
                result = select_model("plan")
                self.assertEqual(result, "custom-versatile-model")


# ═════════════════════════════════════════════════════════════════════════════
# /capabilities endpoint shape
# ═════════════════════════════════════════════════════════════════════════════

class TestCapabilitiesEndpoint(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from app.routers.capabilities import router
        from fastapi import FastAPI
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)

    def test_endpoint_returns_200(self):
        resp = self.client.get("/capabilities")
        self.assertEqual(resp.status_code, 200)

    def test_response_has_version(self):
        data = self.client.get("/capabilities").json()
        self.assertIn("version", data)

    def test_response_has_agent_intents(self):
        data = self.client.get("/capabilities").json()
        intents = [i["name"] for i in data["agent"]["intents"]]
        for expected in ("clean", "transform", "sql_query", "summarise", "visualise", "ml_prep", "goal"):
            self.assertIn(expected, intents)

    def test_response_has_cookbook_sections(self):
        data = self.client.get("/capabilities").json()
        section_ids = [s["id"] for s in data["cookbook_sections"]]
        for s_id in ("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"):
            self.assertIn(s_id, section_ids)

    def test_response_has_plan_linter_info(self):
        data = self.client.get("/capabilities").json()
        self.assertIn("plan_linter", data)
        self.assertTrue(data["plan_linter"]["enabled"])

    def test_response_has_model_routing_info(self):
        data = self.client.get("/capabilities").json()
        self.assertIn("model_routing", data)
        tiers = [t["tier"] for t in data["model_routing"]["tiers"]]
        self.assertIn("fast", tiers)
        self.assertIn("versatile", tiers)

    def test_section_i_includes_analytics_operations(self):
        data = self.client.get("/capabilities").json()
        sec_i = next(s for s in data["cookbook_sections"] if s["id"] == "I")
        for op in ("t_test", "cohort_retention", "rfm_segmentation", "haversine", "sessionization"):
            self.assertIn(op, sec_i["operations"])

    def test_section_j_includes_chart_types(self):
        data = self.client.get("/capabilities").json()
        sec_j = next(s for s in data["cookbook_sections"] if s["id"] == "J")
        for ct in ("histogram", "scatter", "heatmap", "funnel", "line"):
            self.assertIn(ct, sec_j["chart_types"])


if __name__ == "__main__":
    unittest.main()
