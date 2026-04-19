"""Tests for the content-addressed replay cache in :mod:`ai_agent_service`.

The cache lets ``_replay_session_views`` skip an entire rebuild when the
step list hash matches the previous successful replay AND every output_table
view still exists in the live DuckDB session.  Cache misses fall through to
the existing rebuild path, which is already covered by
``test_session_refresh_resilience.py``.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

# planner.py constructs ChatGroq at import time
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")


def _make_dataset():
    from app.models_db import DatasetMetaDB
    ds = MagicMock(spec=DatasetMetaDB)
    ds.id = "ds-1"
    ds.name = "customers"
    ds.storage_path = None  # skip source-view registration
    return ds


class ReplayCacheIdempotencyTests(unittest.TestCase):
    """Same step list + views still present => no rebuild work."""

    def setUp(self) -> None:
        from app.services.ai_agent_service import AIAgentService
        AIAgentService.invalidate_replay_cache("sess-cache-1")

    def _client_steps(self):
        return [
            {"step_number": 1, "output_table": "step_1_clean", "sql": "SELECT * FROM dataset"},
            {"step_number": 2, "output_table": "step_2_dedup", "sql": "SELECT DISTINCT * FROM step_1_clean"},
        ]

    def test_second_identical_replay_hits_cache_and_skips_execute(self) -> None:
        from app.services.ai_agent_service import AIAgentService

        fake_conn = MagicMock()
        fake_conn.execute = MagicMock()

        with patch("app.services.duckdb_session.get_connection", return_value=fake_conn), \
             patch("app.services.duckdb_session.register_view"), \
             patch("app.services.duckdb_session.table_exists", return_value=True):
            ok1 = AIAgentService._replay_session_views(
                "sess-cache-1", _make_dataset(), client_steps=self._client_steps(),
            )
            first_call_count = fake_conn.execute.call_count

            ok2 = AIAgentService._replay_session_views(
                "sess-cache-1", _make_dataset(), client_steps=self._client_steps(),
            )
            second_call_count = fake_conn.execute.call_count

        self.assertTrue(ok1)
        self.assertTrue(ok2)
        self.assertGreater(first_call_count, 0, "first replay must build views")
        self.assertEqual(
            first_call_count, second_call_count,
            "second identical replay must hit the cache and not re-execute",
        )

    def test_cache_miss_when_step_list_changes(self) -> None:
        from app.services.ai_agent_service import AIAgentService

        fake_conn = MagicMock()
        with patch("app.services.duckdb_session.get_connection", return_value=fake_conn), \
             patch("app.services.duckdb_session.register_view"), \
             patch("app.services.duckdb_session.table_exists", return_value=True):
            AIAgentService._replay_session_views(
                "sess-cache-1", _make_dataset(), client_steps=self._client_steps(),
            )
            first_count = fake_conn.execute.call_count

            # Add a step -> hash changes -> must rebuild
            steps2 = self._client_steps() + [
                {"step_number": 3, "output_table": "step_3_filter",
                 "sql": "SELECT * FROM step_2_dedup WHERE active = true"},
            ]
            AIAgentService._replay_session_views(
                "sess-cache-1", _make_dataset(), client_steps=steps2,
            )
            second_count = fake_conn.execute.call_count

        self.assertGreater(
            second_count, first_count,
            "different step list must invalidate cache and re-execute",
        )

    def test_cache_miss_when_a_cached_view_was_evicted(self) -> None:
        """Cache hash matches but TTL eviction removed a view -> must rebuild."""
        from app.services.ai_agent_service import AIAgentService

        fake_conn = MagicMock()
        with patch("app.services.duckdb_session.get_connection", return_value=fake_conn), \
             patch("app.services.duckdb_session.register_view"), \
             patch("app.services.duckdb_session.table_exists", return_value=True):
            AIAgentService._replay_session_views(
                "sess-cache-1", _make_dataset(), client_steps=self._client_steps(),
            )
            first_count = fake_conn.execute.call_count

        # Simulate the second view being evicted from the live session
        def _exists(_sess, table_name: str) -> bool:
            return table_name != "step_2_dedup"

        with patch("app.services.duckdb_session.get_connection", return_value=fake_conn), \
             patch("app.services.duckdb_session.register_view"), \
             patch("app.services.duckdb_session.table_exists", side_effect=_exists):
            AIAgentService._replay_session_views(
                "sess-cache-1", _make_dataset(), client_steps=self._client_steps(),
            )
            second_count = fake_conn.execute.call_count

        self.assertGreater(
            second_count, first_count,
            "evicted view must force a rebuild even when the step hash matches",
        )

    def test_partial_failure_does_not_populate_cache(self) -> None:
        """If any step's CREATE VIEW raises, the next call must rebuild."""
        from app.services.ai_agent_service import AIAgentService

        fake_conn = MagicMock()
        # First call: second CREATE VIEW raises, leaving a partial replay.
        call_state = {"n": 0}

        def _execute(_sql: str):
            call_state["n"] += 1
            if call_state["n"] == 2:
                raise RuntimeError("simulated DuckDB hiccup")
            return None

        fake_conn.execute = MagicMock(side_effect=_execute)
        with patch("app.services.duckdb_session.get_connection", return_value=fake_conn), \
             patch("app.services.duckdb_session.register_view"), \
             patch("app.services.duckdb_session.table_exists", return_value=True):
            AIAgentService._replay_session_views(
                "sess-cache-1", _make_dataset(), client_steps=self._client_steps(),
            )
            first_count = fake_conn.execute.call_count

        # Second call with a healthy connection must NOT short-circuit even
        # though the step list is identical, because the cache was not stored.
        fake_conn2 = MagicMock()
        with patch("app.services.duckdb_session.get_connection", return_value=fake_conn2), \
             patch("app.services.duckdb_session.register_view"), \
             patch("app.services.duckdb_session.table_exists", return_value=True):
            AIAgentService._replay_session_views(
                "sess-cache-1", _make_dataset(), client_steps=self._client_steps(),
            )
            second_count = fake_conn2.execute.call_count

        self.assertGreater(first_count, 0)
        self.assertGreater(
            second_count, 0,
            "after a partial failure, the next replay must retry rather than trust the cache",
        )


if __name__ == "__main__":
    unittest.main()
