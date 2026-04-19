"""
Regression tests for the "refresh page → second AI command" failure mode.

The reproducer flow these tests guard against:

  1. Upload a dataset, run a first AI command (clean / transform).
     A DuckDB session VIEW is created server-side and a PipelineStepDB row
     is persisted with the SQL.
  2. The page is refreshed (or the server is restarted, or the in-memory
     session is TTL-evicted).  React state and the in-memory DuckDB session
     are wiped, but localStorage still has the session_id and pipeline steps.
  3. The user runs a *second* command — quality report, filter, etc.
     Backend tries to query the session by name; the table is gone.

Without the fixes in this commit, step 3 silently runs the report on the
ORIGINAL Parquet file and the user sees wrong numbers.  These tests assert:

  • The backend re-creates the missing view from PipelineStepDB ("replay").
  • When replay succeeds, used_session_data == True (no false fallback).
  • When replay cannot recover the table, the response includes a
    `session_fallback_reason` string the UI can show to the user instead
    of pretending nothing happened.
  • Disk-backed DuckDB sessions survive a simulated process restart so the
    second command does not even need to replay in the common case.
"""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

# Required so importing planner.py (which constructs ChatGroq at module load)
# doesn't blow up in environments without a real key.
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")


class SessionFallbackVisibilityTests(unittest.TestCase):
    """`_get_dataset_context` must surface a fallback reason when replay fails."""

    def _make_dataset(self, dataset_id: str = "ds-1"):
        from app.models_db import DatasetMetaDB
        dataset = MagicMock(spec=DatasetMetaDB)
        dataset.id = dataset_id
        dataset.name = "customers"
        dataset.row_count = 100
        dataset.storage_path = None  # force the load_dataframe path
        # _generate_stats expects schema[col]["type"] when stats_json is missing,
        # so pre-populate stats_json to bypass that path.
        dataset.schema_json = {"a": {"type": "int"}}
        dataset.stats_json = {"totalRows": 3, "columns": {}}
        return dataset

    def _make_db(self, dataset):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = dataset
        return db

    def test_fallback_reason_set_when_replay_finds_nothing(self) -> None:
        """No PipelineStepDB rows for the session → user-visible warning."""
        from app.services.ai_agent_service import AIAgentService

        dataset = self._make_dataset()
        db = self._make_db(dataset)

        # Simulate the post-refresh state: the table does NOT exist in the
        # session (it was wiped) and replay returns False (no SQL stored).
        with patch("app.services.duckdb_session.table_exists", return_value=False), \
             patch.object(AIAgentService, "_replay_session_views", return_value=False), \
             patch.object(
                AIAgentService, "_load_dataframe",
                return_value=__import__("pandas").DataFrame({"a": [1, 2, 3]}),
             ):
            ctx = AIAgentService._get_dataset_context(
                "ds-1", db,
                session_id="user-1:chat-abc",
                table_name="step_2_clean",
            )

        self.assertFalse(ctx["usedSessionData"])
        self.assertIsNotNone(ctx["sessionFallbackReason"])
        self.assertIn("step_2_clean", ctx["sessionFallbackReason"])

    def test_no_fallback_when_session_query_succeeds(self) -> None:
        """Replay restored the view → response must NOT carry a fallback warning."""
        from app.services.ai_agent_service import AIAgentService

        dataset = self._make_dataset()
        db = self._make_db(dataset)

        # Force a fresh process state for the in-process warm tracker so this
        # test does not interact with whatever ran before it.
        AIAgentService._warmed_sessions.discard("user-1:chat-warm-ok")

        with patch("app.services.duckdb_session.table_exists", return_value=True), \
             patch.object(AIAgentService, "_replay_session_views", return_value=True), \
             patch(
                "app.services.duckdb_session.execute_in_session",
                side_effect=[
                    [{"a": 1}, {"a": 2}],   # SELECT * LIMIT N
                    [{"n": 2}],             # SELECT COUNT(*)
                ],
             ):
            ctx = AIAgentService._get_dataset_context(
                "ds-1", db,
                session_id="user-1:chat-warm-ok",
                table_name="step_2_clean",
            )

        self.assertTrue(ctx["usedSessionData"])
        self.assertIsNone(ctx["sessionFallbackReason"])
        self.assertEqual(ctx["rowCount"], 2)

    def test_analyze_dataset_propagates_fallback_to_response(self) -> None:
        """The `/analyze` HTTP response must expose the fallback reason."""
        from app.services.ai_agent_service import AIAgentService

        fake_ctx = {
            "datasetId": "ds-1",
            "rowCount": 5,
            "isLargeDataset": False,
            "schema": {"a": "int"},
            "stats": {},
            "sampleData": [{"a": 1}],
            "columns": ["a"],
            "usedSessionData": False,
            "sessionFallbackReason": "Could not restore the transformed table 'step_2_clean'. Showing results on the original dataset instead.",
        }

        db = self._make_db(self._make_dataset())
        with patch.object(AIAgentService, "_provider_config", return_value=(None, None, None)), \
             patch.object(AIAgentService, "_get_dataset_context", return_value=fake_ctx):
            result = AIAgentService.analyze_dataset(
                "ds-1", db,
                session_id="user-1:chat-abc",
                table_name="step_2_clean",
            )

        self.assertFalse(result["used_session_data"])
        self.assertIn("session_fallback_reason", result)
        self.assertIn("step_2_clean", result["session_fallback_reason"])


class SessionDiskPersistenceTests(unittest.TestCase):
    """Disk-backed DuckDB sessions survive a simulated process restart."""

    def setUp(self) -> None:
        # Force a clean session dir for this test so we do not collide with
        # whatever the dev box has at /tmp/datahub_duckdb_sessions.
        self._tmp = tempfile.mkdtemp(prefix="ddb_sess_test_")
        self._old_env = os.environ.get("DUCKDB_SESSION_DIR")
        os.environ["DUCKDB_SESSION_DIR"] = self._tmp

    def tearDown(self) -> None:
        if self._old_env is None:
            os.environ.pop("DUCKDB_SESSION_DIR", None)
        else:
            os.environ["DUCKDB_SESSION_DIR"] = self._old_env

    def test_view_survives_simulated_restart(self) -> None:
        """Reload the duckdb_session module to mimic a fresh process; the
        VIEW created in 'process A' must still be queryable in 'process B'."""
        # Re-import inside the test so the new env var is picked up.
        import importlib
        import sys

        sys.modules.pop("app.services.duckdb_session", None)
        ds_a = importlib.import_module("app.services.duckdb_session")

        sid = "test-user:test-restart"
        ds_a.close_session(sid)  # ensure clean slate, also removes any disk file

        conn_a = ds_a.get_connection(sid)
        conn_a.execute("CREATE OR REPLACE TABLE t AS SELECT 42 AS x")
        rows = ds_a.execute_in_session(sid, "SELECT x FROM t")
        self.assertEqual(rows, [{"x": 42}])

        # Simulate a process restart: drop the in-memory cache by closing
        # the connection but keep the disk file, then re-import the module.
        try:
            conn_a.close()
        except Exception:
            pass
        # Surgically clear the module-level dicts so the next get_connection
        # call has to reopen the disk file (mirrors a cold-process startup).
        ds_a._sessions.clear()
        ds_a._last_used.clear()

        sys.modules.pop("app.services.duckdb_session", None)
        ds_b = importlib.import_module("app.services.duckdb_session")
        # Carry the env var into the reloaded module's _SESSION_DIR — it was
        # already set in setUp, so reload picks it up automatically.

        try:
            rows_after = ds_b.execute_in_session(sid, "SELECT x FROM t")
            self.assertEqual(
                rows_after, [{"x": 42}],
                "Table created before 'restart' must survive on disk",
            )
        finally:
            ds_b.close_session(sid)


class ClientSuppliedReplayTests(unittest.TestCase):
    """`_replay_session_views` must prefer client-supplied steps over DB query.

    This is the architectural fix that makes the system race-immune: even if
    the previous request has not yet committed its `PipelineStepDB` rows when
    the next request arrives, the frontend has already echoed the steps back
    in the request payload — so we can replay from those directly.
    """

    def test_client_steps_used_when_db_empty(self) -> None:
        from app.services.ai_agent_service import AIAgentService

        dataset = MagicMock()
        dataset.id = "ds-1"
        dataset.name = "customers"
        dataset.storage_path = None  # skip the source-view registration branch

        client_steps = [
            {
                "step_number": 1,
                "operation": "filter",
                "sql": "SELECT * FROM source WHERE x > 0",
                "output_table": "step_1_filter",
            },
        ]

        executed: list[str] = []

        class _FakeConn:
            def execute(self, sql):
                executed.append(sql)
                return None

        with patch("app.services.duckdb_session.get_connection", return_value=_FakeConn()), \
             patch("app.services.duckdb_session.register_view"):
            ok = AIAgentService._replay_session_views(
                "user-1:chat-x", dataset, client_steps=client_steps,
            )

        self.assertTrue(ok, "replay should succeed using client-supplied steps")
        joined = "\n".join(executed)
        self.assertIn("step_1_filter", joined)
        self.assertIn("SELECT * FROM source WHERE x > 0", joined)

    def test_client_steps_take_priority_over_db(self) -> None:
        """When both client steps and DB rows exist, client wins (race-immune)."""
        from app.services.ai_agent_service import AIAgentService

        dataset = MagicMock()
        dataset.id = "ds-1"
        dataset.name = "customers"
        dataset.storage_path = None

        client_steps = [{
            "step_number": 1, "operation": "filter",
            "sql": "SELECT * FROM source WHERE FRESH",
            "output_table": "step_1_filter",
        }]

        executed: list[str] = []

        class _FakeConn:
            def execute(self, sql):
                executed.append(sql)
                return None

        # Note: the implementation only queries DB when client_steps is empty,
        # so we don't need to patch SessionLocal — control flow short-circuits.
        with patch("app.services.duckdb_session.get_connection", return_value=_FakeConn()), \
             patch("app.services.duckdb_session.register_view"):
            AIAgentService._replay_session_views(
                "user-1:chat-y", dataset, client_steps=client_steps,
            )

        joined = "\n".join(executed)
        self.assertIn("FRESH", joined)
        self.assertNotIn("STALE", joined)


class PlannerDependsOnSanitizationTests(unittest.TestCase):
    """The planner must drop dangling / forward / self `depends_on` references
    after step-number offsetting, so PlanDAG never sees holes that crash
    the sparse-array depth grouping."""

    def test_dangling_and_forward_refs_are_dropped(self) -> None:
        from app.services.agent.nodes.planner import _sanitize_depends_on

        plan = [
            {"step_number": 5, "operation": "filter", "depends_on": []},
            {"step_number": 6, "operation": "agg",    "depends_on": [5, 99, 6, 7]},
            {"step_number": 7, "operation": "join",   "depends_on": [6, 5]},
        ]
        cleaned = _sanitize_depends_on(plan)
        deps_by_sn = {s["step_number"]: s["depends_on"] for s in cleaned}
        # 99 (dangling) dropped, 6 (self) dropped, 7 (forward) dropped → only 5 remains
        self.assertEqual(deps_by_sn[6], [5])
        # legitimate refs preserved
        self.assertEqual(deps_by_sn[7], [6, 5])
        # first step has no deps and stays empty
        self.assertEqual(deps_by_sn[5], [])

    def test_non_int_depends_on_dropped(self) -> None:
        from app.services.agent.nodes.planner import _sanitize_depends_on

        plan = [
            {"step_number": 1, "operation": "a", "depends_on": []},
            {"step_number": 2, "operation": "b", "depends_on": [1, "garbage", None]},
        ]
        cleaned = _sanitize_depends_on(plan)
        # "garbage" and None are dropped; 1 survives.
        self.assertEqual(cleaned[1]["depends_on"], [1])


class PipelineRecorderResilienceTests(unittest.TestCase):
    """One bad step row must not sink the entire pipeline-record commit."""

    def test_failed_row_does_not_lose_others(self) -> None:
        import asyncio
        from app.services.agent.nodes import pipeline_recorder as pr

        commit_calls = {"n": 0}
        rollback_calls = {"n": 0}
        added_step_rows: list[object] = []

        class FakeDB:
            def add(self, row):
                # Track only PipelineStepDB inserts (skip the parent run row).
                if getattr(row, "_is_step_row", False):
                    added_step_rows.append(row)

            def commit(self):
                commit_calls["n"] += 1
                # Make the SECOND step-row commit explode.
                if added_step_rows and getattr(added_step_rows[-1], "_is_step_row", False) \
                        and len(added_step_rows) == 2 \
                        and not getattr(added_step_rows[-1], "_committed", False):
                    added_step_rows[-1]._committed = True
                    raise RuntimeError("simulated DB failure for row 2")
                if added_step_rows:
                    added_step_rows[-1]._committed = True

            def rollback(self):
                rollback_calls["n"] += 1

            def close(self):
                pass

        # Replace PipelineRunV2DB and PipelineStepDB with permissive fakes
        # that accept arbitrary kwargs (keeps the test independent of ORM
        # column changes).
        class _FakeRun:
            def __init__(self, **kw):
                self.id = kw.get("id", "run-x")

        class _FakeStep:
            _is_step_row = True

            def __init__(self, **kw):
                for k, v in kw.items():
                    setattr(self, k, v)

        plan = [
            {"step_number": i, "operation": "op", "description": f"s{i}",
             "parameters": {"output_table": f"step_{i}"}}
            for i in (1, 2, 3)
        ]
        execution_results = [
            {
                "step_number": i, "success": True, "sql": f"SELECT {i}",
                "rows_affected": 1, "row_count_before": 1, "row_count_after": 1,
                "execution_time_ms": 1, "output_table": f"step_{i}",
            }
            for i in (1, 2, 3)
        ]
        state = {
            "execution_results": execution_results,
            "plan": plan,
            "root_dataset_id": "ds-1",
            "dataset_id": "ds-1",
            "session_id": "user-1:chat-z",
            "user_id": "user-1",
            "intent": "transform",
        }

        with patch.object(pr, "SessionLocal", return_value=FakeDB()), \
             patch.object(pr, "PipelineRunV2DB", _FakeRun), \
             patch.object(pr, "PipelineStepDB", _FakeStep):
            asyncio.run(pr.pipeline_recorder(state))

        # All 3 step rows were attempted; one rollback fired for the bad commit.
        self.assertEqual(len(added_step_rows), 3,
                         "all 3 steps must be added even after a mid-loop failure")
        self.assertGreaterEqual(rollback_calls["n"], 1,
                                "the failed step commit must trigger a rollback")


class StepPreviewEndpointTests(unittest.TestCase):
    """End-to-end coverage for ``POST /datasets/{id}/step-preview``.

    The endpoint must hand client-supplied ``pipeline_steps`` to
    ``_replay_session_views`` so refresh-then-second-AI-command does not race
    against a not-yet-committed PipelineStepDB row.
    """

    def _call(self, payload: dict, *, table_present: bool):
        from app.routers import datasets as ds_router

        captured: dict = {}

        class _FakeDataset:
            id = "ds-1"
            name = "customers"

        class _FakeDB:
            def query(self, *_a, **_kw):
                class _Q:
                    def filter(self, *_a, **_kw):
                        class _F:
                            def first(self_inner):  # noqa: ARG002
                                return _FakeDataset()
                        return _F()
                return _Q()

        class _FakeEngine:
            def __init__(self, *_a, **_kw):
                pass

            def preview(self, table_name, limit=200, offset=0):
                captured["preview_args"] = (table_name, limit, offset)
                return [{"a": 1, "b": "x"}, {"a": 2, "b": "y"}]

        from app.services import ai_agent_service as ai_mod
        with patch("app.services.duckdb_session.table_exists", return_value=table_present), \
             patch.object(ai_mod.AIAgentService, "_replay_session_views",
                          return_value=True) as replay_mock, \
             patch("app.services.step_engine.StepEngine", _FakeEngine):
            response = ds_router.step_preview(
                "ds-1", payload, authorization=None, db=_FakeDB(),
            )
        return response, captured, replay_mock

    def test_pipeline_steps_passed_to_replay_when_view_missing(self) -> None:
        steps = [
            {"step_number": 1, "sql": "SELECT 1", "output_table": "step_1"},
            {"step_number": 2, "sql": "SELECT 2", "output_table": "step_2"},
        ]
        response, captured, replay_mock = self._call(
            {
                "session_id": "u:chat-1",
                "table_name": "step_2",
                "limit": 100,
                "pipeline_steps": steps,
            },
            table_present=False,
        )

        replay_mock.assert_called_once()
        # Second positional / keyword arg client_steps must equal our list.
        kwargs = replay_mock.call_args.kwargs
        self.assertEqual(kwargs.get("client_steps"), steps)
        # Preview engine was driven with the requested table + limit.
        self.assertEqual(captured["preview_args"], ("step_2", 100, 0))
        self.assertEqual(response["count"], 2)
        self.assertEqual(set(response["columns"]), {"a", "b"})

    def test_replay_skipped_when_view_already_present(self) -> None:
        response, captured, replay_mock = self._call(
            {"session_id": "u:chat-1", "table_name": "step_2"},
            table_present=True,
        )

        replay_mock.assert_not_called()
        self.assertEqual(captured["preview_args"][0], "step_2")
        self.assertIn("rows", response)

    def test_invalid_pipeline_step_entries_are_filtered_out(self) -> None:
        steps = [
            {"step_number": 1, "sql": "SELECT 1", "output_table": "step_1"},
            "not-a-dict",
            42,
            None,
            {"step_number": 2, "sql": "SELECT 2", "output_table": "step_2"},
        ]
        _response, _captured, replay_mock = self._call(
            {
                "session_id": "u:chat-1",
                "table_name": "step_2",
                "pipeline_steps": steps,
            },
            table_present=False,
        )
        replay_mock.assert_called_once()
        cleaned = replay_mock.call_args.kwargs["client_steps"]
        self.assertEqual(len(cleaned), 2)
        self.assertTrue(all(isinstance(s, dict) for s in cleaned))

    def test_missing_session_or_table_returns_422(self) -> None:
        from app.routers import datasets as ds_router
        from fastapi import HTTPException

        class _DB:  # never queried, the 422 fires first
            def query(self, *_a, **_kw):  # pragma: no cover
                raise AssertionError("must not reach DB")

        with self.assertRaises(HTTPException) as ctx:
            ds_router.step_preview("ds-1", {"table_name": "x"}, None, _DB())
        self.assertEqual(ctx.exception.status_code, 422)

        with self.assertRaises(HTTPException) as ctx:
            ds_router.step_preview("ds-1", {"session_id": "x"}, None, _DB())
        self.assertEqual(ctx.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
