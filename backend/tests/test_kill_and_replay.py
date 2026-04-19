"""Kill-and-replay integration test (Item 5 of the snapshot-replay hardening).

The contract under test:

    1. User creates a dataset session.
    2. They apply a chain of pipeline steps via :class:`StepEngine`.
    3. Each step is auto-snapshotted to object storage; the snapshot path is
       persisted on the corresponding :class:`PipelineStepDB` row.
    4. The server crashes / is redeployed / the in-memory DuckDB session is
       evicted by the TTL sweeper.
    5. A subsequent request triggers
       :py:meth:`AIAgentService._replay_session_views`, which must rebuild
       every view and produce **byte-identical** rows to the original
       execution by reading from the Parquet snapshots — without ever
       re-executing the original SQL.

This test exercises the full path end-to-end against a real DuckDB session
and the local-disk ``StorageService`` backend (the default when no cloud
provider is configured), so it catches integration regressions that the
narrower unit tests in ``test_replay_cache.py`` cannot.
"""

from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import MagicMock

# planner.py constructs ChatGroq at import time; stub the key so import works.
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")
# Force the local-disk storage backend for this test so we don't need S3 creds.
os.environ.setdefault("STORAGE_PROVIDER", "local")


_SESSION_ID = "kill-replay-user:kill-replay-session"


def _make_dataset_mock():
    """Build a minimal DatasetMetaDB stand-in.  We only need the attributes
    that ``_replay_session_views`` reads."""
    from app.models_db import DatasetMetaDB
    ds = MagicMock(spec=DatasetMetaDB)
    ds.id = "kill-replay-dataset"
    ds.name = "kill_replay"
    # No source storage_path: the test's first step seeds its own data, so we
    # don't need the source-view registration step to succeed.
    ds.storage_path = None
    return ds


class KillAndReplayTests(unittest.TestCase):
    """End-to-end: run steps, snapshot, evict, replay, compare."""

    def setUp(self) -> None:
        from app.services.duckdb_session import close_session
        from app.services.ai_agent_service import AIAgentService
        from app.config import settings
        # Start clean: no leftover session from a previous test.
        close_session(_SESSION_ID)
        AIAgentService.invalidate_replay_cache(_SESSION_ID)
        # Use a temp dir for object storage so this test never touches a
        # developer's real cache or any cloud bucket.
        self._tmpdir = tempfile.mkdtemp(prefix="kill_replay_")
        self._prev_storage_dir = os.environ.get("LOCAL_STORAGE_DIR")
        os.environ["LOCAL_STORAGE_DIR"] = self._tmpdir
        # Force local provider — settings is cached at import time, so a mere
        # env var won't help if the test process was started with S3 creds.
        self._prev_provider = settings.storage_provider
        settings.storage_provider = "local"

    def tearDown(self) -> None:
        from app.services.duckdb_session import close_session
        from app.services.ai_agent_service import AIAgentService
        from app.config import settings
        close_session(_SESSION_ID)
        AIAgentService.invalidate_replay_cache(_SESSION_ID)
        if self._prev_storage_dir is None:
            os.environ.pop("LOCAL_STORAGE_DIR", None)
        else:
            os.environ["LOCAL_STORAGE_DIR"] = self._prev_storage_dir
        settings.storage_provider = self._prev_provider
        # Best-effort tmpdir cleanup.
        import shutil
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def _seed_source(self) -> None:
        """Materialize a small ``raw`` table in the live session so the chain
        below has something to read from."""
        from app.services.duckdb_session import get_connection
        conn = get_connection(_SESSION_ID)
        conn.execute(
            "CREATE OR REPLACE TABLE raw AS SELECT * FROM (VALUES "
            "(1, 'alice', 100), (2, 'bob', 200), (3, 'carol', 300), "
            "(4, 'dave', 400), (5, 'erin', 500)"
            ") AS t(id, name, amount)"
        )

    def _apply_chain_and_snapshot(self):
        """Apply 3 chained steps and snapshot each one.  Returns the list of
        ``(step_number, output_table, sql, snapshot_path, baseline_rows)``
        tuples that ``_replay_session_views`` will be asked to reproduce."""
        from app.services.step_engine import StepEngine
        from app.services.duckdb_session import execute_in_session

        registry: dict = {}
        engine = StepEngine(_SESSION_ID, registry)

        chain = [
            (1, "step_1_clean", "SELECT * FROM raw WHERE amount > 100", "raw"),
            (2, "step_2_tagged",
             "SELECT *, amount * 2 AS doubled FROM step_1_clean", "step_1_clean"),
            (3, "step_3_top",
             "SELECT * FROM step_2_tagged ORDER BY doubled DESC LIMIT 2",
             "step_2_tagged"),
        ]

        results = []
        for step_num, out_name, sql, src in chain:
            engine.apply_step(
                sql=sql,
                output_name=out_name,
                source_table=src,
                step_number=step_num,
                operation="filter",
            )
            snap = engine.snapshot_to_parquet(
                out_name, "kill-replay-dataset", "kill-replay-user",
            )
            self.assertIsNotNone(
                snap,
                f"snapshot_to_parquet must return a storage path for step {step_num}",
            )
            baseline = execute_in_session(
                _SESSION_ID, f'SELECT * FROM "{out_name}" ORDER BY 1',
            )
            results.append({
                "step_number": step_num,
                "output_table": out_name,
                "sql": sql,
                "snapshot_path": snap,
                "baseline": baseline,
            })
        return results

    def test_kill_session_then_replay_from_snapshots(self) -> None:
        from app.services.duckdb_session import close_session, execute_in_session
        from app.services.ai_agent_service import AIAgentService

        # 1. Seed source + run the chain.
        self._seed_source()
        snapshots = self._apply_chain_and_snapshot()

        # 2. Evict the session — simulates server restart / TTL eviction.
        close_session(_SESSION_ID)
        AIAgentService.invalidate_replay_cache(_SESSION_ID)

        # 3. Build the client_steps payload exactly as the frontend would
        #    when reopening the dataset after the kill.  This is the path
        #    that _replay_session_views consumes.
        client_steps = [
            {
                "step_number": s["step_number"],
                "output_table": s["output_table"],
                # Intentionally pass an INVALID sql so we can prove that
                # replay used the snapshot.  If the snapshot path is honoured,
                # this SQL is never executed; if it falls back, the test fails.
                "sql": "SELECT this_column_does_not_exist FROM nowhere",
                "snapshot_path": s["snapshot_path"],
            }
            for s in snapshots
        ]

        # 4. Replay.
        ok = AIAgentService._replay_session_views(
            _SESSION_ID, _make_dataset_mock(), client_steps=client_steps,
        )
        self.assertTrue(ok, "replay must report success")

        # 5. Every view should be queryable and produce identical rows.
        for s in snapshots:
            replayed = execute_in_session(
                _SESSION_ID,
                f'SELECT * FROM "{s["output_table"]}" ORDER BY 1',
            )
            self.assertEqual(
                replayed, s["baseline"],
                f"replayed rows for {s['output_table']} must match the "
                f"original execution byte-for-byte",
            )

    def test_replay_without_snapshot_falls_back_to_sql(self) -> None:
        """When snapshot_path is missing, replay must still work via SQL.
        This guards the (b) fallback branch in _replay_session_views."""
        from app.services.duckdb_session import close_session, execute_in_session
        from app.services.ai_agent_service import AIAgentService

        self._seed_source()
        snapshots = self._apply_chain_and_snapshot()

        # Save the source table to a parquet so the SQL chain can be replayed
        # after eviction (without it, "FROM raw" wouldn't resolve).
        from app.services.duckdb_session import get_connection
        raw_path = os.path.join(self._tmpdir, "raw.parquet")
        get_connection(_SESSION_ID).execute(
            f"COPY raw TO '{raw_path}' (FORMAT PARQUET)"
        )

        close_session(_SESSION_ID)
        AIAgentService.invalidate_replay_cache(_SESSION_ID)

        # Re-register raw in the fresh session so the SQL replay has a source.
        from app.services.duckdb_session import register_view
        register_view(_SESSION_ID, "raw", raw_path)

        # Drop snapshot_path so replay must use SQL.
        client_steps = [
            {
                "step_number": s["step_number"],
                "output_table": s["output_table"],
                "sql": s["sql"],
                # snapshot_path intentionally omitted
            }
            for s in snapshots
        ]

        ok = AIAgentService._replay_session_views(
            _SESSION_ID, _make_dataset_mock(), client_steps=client_steps,
        )
        self.assertTrue(ok, "SQL-fallback replay must succeed")

        for s in snapshots:
            replayed = execute_in_session(
                _SESSION_ID,
                f'SELECT * FROM "{s["output_table"]}" ORDER BY 1',
            )
            self.assertEqual(
                replayed, s["baseline"],
                f"SQL-replayed rows for {s['output_table']} must match",
            )


class NonDeterministicSQLRejectionTests(unittest.TestCase):
    """Item 4: planner / executor must reject SQL that would make snapshots
    diverge from a future replay."""

    def test_random_rejected(self) -> None:
        from app.services.sql_safety import (
            NonDeterministicSQLError, reject_nondeterministic,
        )
        with self.assertRaises(NonDeterministicSQLError):
            reject_nondeterministic("SELECT *, RANDOM() AS r FROM t")

    def test_now_rejected(self) -> None:
        from app.services.sql_safety import (
            NonDeterministicSQLError, reject_nondeterministic,
        )
        with self.assertRaises(NonDeterministicSQLError):
            reject_nondeterministic("SELECT *, NOW() AS ts FROM t")

    def test_current_timestamp_rejected(self) -> None:
        from app.services.sql_safety import (
            NonDeterministicSQLError, reject_nondeterministic,
        )
        with self.assertRaises(NonDeterministicSQLError):
            reject_nondeterministic("SELECT *, CURRENT_TIMESTAMP AS ts FROM t")

    def test_unseeded_sample_rejected(self) -> None:
        from app.services.sql_safety import (
            NonDeterministicSQLError, reject_nondeterministic,
        )
        with self.assertRaises(NonDeterministicSQLError):
            reject_nondeterministic("SELECT * FROM t USING SAMPLE 10%")

    def test_seeded_sample_allowed(self) -> None:
        """USING SAMPLE with a REPEATABLE seed is deterministic."""
        from app.services.sql_safety import reject_nondeterministic
        # Should not raise.
        reject_nondeterministic("SELECT * FROM t USING SAMPLE 10% (RESERVOIR, 42) REPEATABLE (42)")

    def test_string_literal_with_now_allowed(self) -> None:
        """A string literal containing 'NOW()' must NOT trigger the guard."""
        from app.services.sql_safety import reject_nondeterministic
        reject_nondeterministic("SELECT 'queried at NOW()' AS note FROM t")

    def test_column_named_random_allowed(self) -> None:
        """A column literally named ``random`` (no parens) must be allowed."""
        from app.services.sql_safety import reject_nondeterministic
        reject_nondeterministic("SELECT random_id, value FROM t")

    def test_deterministic_sql_allowed(self) -> None:
        from app.services.sql_safety import reject_nondeterministic
        reject_nondeterministic(
            "SELECT id, UPPER(name), amount * 2 FROM t WHERE amount > 100"
        )

    def test_empty_sql_allowed(self) -> None:
        """Empty SQL is the caller's problem to handle, not ours."""
        from app.services.sql_safety import reject_nondeterministic
        reject_nondeterministic("")
        reject_nondeterministic(None)  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
