"""
Tests for DuckDB session query guards introduced 2025-04-14:
  - DML write-op blocking (BlockedSQLError)
  - Query timeout (QueryTimeoutError)
"""
from __future__ import annotations

import time
import unittest

from app.services.duckdb_session import (
    BlockedSQLError,
    QueryTimeoutError,
    QUERY_TIMEOUT_SECONDS,
    _BLOCKED_DML,
    execute_in_session,
    close_session,
)

# ── Helpers ───────────────────────────────────────────────────────────────────

_SESSION = "test-user:test-session-guards"


def _teardown() -> None:
    close_session(_SESSION)


# ── Unit tests: _BLOCKED_DML regex ────────────────────────────────────────────

class BlockedDMLRegexTests(unittest.TestCase):
    """Verify the regex alone — no DuckDB connection needed."""

    def _blocked(self, sql: str) -> bool:
        import re as _re
        stripped = _re.sub(r"^\s*--[^\n]*\n", "", sql, flags=_re.MULTILINE).lstrip()
        return bool(_BLOCKED_DML.match(stripped))

    # --- must block ---
    def test_drop_table(self):
        self.assertTrue(self._blocked("DROP TABLE foo"))

    def test_drop_table_if_exists(self):
        self.assertTrue(self._blocked("DROP TABLE IF EXISTS foo"))

    def test_delete_from(self):
        self.assertTrue(self._blocked("DELETE FROM orders WHERE id = 1"))

    def test_insert_into(self):
        self.assertTrue(self._blocked("INSERT INTO t SELECT * FROM s"))

    def test_update(self):
        self.assertTrue(self._blocked("UPDATE customers SET name='x' WHERE id=1"))

    def test_truncate(self):
        self.assertTrue(self._blocked("TRUNCATE TABLE foo"))

    def test_leading_whitespace(self):
        self.assertTrue(self._blocked("   \n  DROP TABLE foo"))

    def test_comment_then_drop(self):
        # A comment line before DROP must not hide the DROP
        self.assertTrue(self._blocked("-- drop this\nDROP TABLE foo\n"))

    def test_case_insensitive(self):
        self.assertTrue(self._blocked("drop table foo"))
        self.assertTrue(self._blocked("Delete From bar"))
        self.assertTrue(self._blocked("INSERT Into baz SELECT 1"))

    # --- must allow ---
    def test_select_allowed(self):
        self.assertFalse(self._blocked("SELECT * FROM foo"))

    def test_create_table_as_select_allowed(self):
        self.assertFalse(self._blocked("CREATE OR REPLACE TABLE t AS SELECT 1"))

    def test_with_select_allowed(self):
        self.assertFalse(self._blocked("WITH cte AS (SELECT 1) SELECT * FROM cte"))

    def test_describe_allowed(self):
        self.assertFalse(self._blocked("DESCRIBE foo"))

    def test_column_named_drop_allowed(self):
        # "drop" inside a SELECT expression, not as a statement keyword
        self.assertFalse(self._blocked("SELECT drop_date FROM orders"))


# ── Integration tests: execute_in_session ─────────────────────────────────────

class ExecuteInSessionDMLGuardTests(unittest.TestCase):
    """Verify that execute_in_session raises BlockedSQLError for write DML."""

    def tearDown(self):
        _teardown()

    def test_drop_table_blocked(self):
        with self.assertRaises(BlockedSQLError):
            execute_in_session(_SESSION, "DROP TABLE IF EXISTS nonexistent")

    def test_delete_from_blocked(self):
        with self.assertRaises(BlockedSQLError):
            execute_in_session(_SESSION, "DELETE FROM foo WHERE 1=1")

    def test_insert_into_blocked(self):
        with self.assertRaises(BlockedSQLError):
            execute_in_session(_SESSION, "INSERT INTO t SELECT 1")

    def test_update_blocked(self):
        with self.assertRaises(BlockedSQLError):
            execute_in_session(_SESSION, "UPDATE t SET x = 1")

    def test_truncate_blocked(self):
        with self.assertRaises(BlockedSQLError):
            execute_in_session(_SESSION, "TRUNCATE TABLE t")

    def test_comment_masked_drop_blocked(self):
        sql = "-- just a note\nDROP TABLE IF EXISTS nonexistent"
        with self.assertRaises(BlockedSQLError):
            execute_in_session(_SESSION, sql)

    def test_select_still_works(self):
        rows = execute_in_session(_SESSION, "SELECT 42 AS answer")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["answer"], 42)

    def test_create_table_as_select_allowed(self):
        """Internal DDL pattern (planner uses this for summarise) must not be blocked.

        DuckDB returns [{'Count': N}] for CREATE TABLE AS SELECT — not an empty list.
        The important assertion is that no BlockedSQLError is raised.
        """
        rows = execute_in_session(_SESSION, "CREATE OR REPLACE TABLE _test_guard AS SELECT 1 AS n")
        # DuckDB returns a row-count result; just confirm it's a list with no exception
        self.assertIsInstance(rows, list)

    def test_with_cte_allowed(self):
        rows = execute_in_session(_SESSION, "WITH cte AS (SELECT 1 AS x) SELECT * FROM cte")
        self.assertEqual(rows[0]["x"], 1)


# ── Integration tests: QueryTimeout ──────────────────────────────────────────

class QueryTimeoutTests(unittest.TestCase):
    """Verify the timeout mechanism fires for a genuinely slow query.

    We monkeypatch QUERY_TIMEOUT_SECONDS to 1 so the test runs quickly
    without waiting the full 60-second default.
    """

    def tearDown(self):
        _teardown()

    def test_fast_query_completes(self):
        """A simple query must finish well within the timeout."""
        rows = execute_in_session(_SESSION, "SELECT range AS n FROM range(100)")
        self.assertEqual(len(rows), 100)

    def test_timeout_fires(self):
        """A query that generates a massive cross join should be killed by the timeout."""
        import app.services.duckdb_session as _mod
        original = _mod.QUERY_TIMEOUT_SECONDS
        _mod.QUERY_TIMEOUT_SECONDS = 1          # 1-second budget
        try:
            # range(10000) CROSS JOIN range(10000) = 100 M rows — always slow
            with self.assertRaises(QueryTimeoutError):
                execute_in_session(
                    _SESSION,
                    "SELECT a.n, b.n AS m FROM range(10000) a(n) CROSS JOIN range(10000) b(n)",
                )
        finally:
            _mod.QUERY_TIMEOUT_SECONDS = original

    def test_timeout_disabled_when_zero(self):
        """Setting timeout to 0 runs inline without the thread overhead."""
        import app.services.duckdb_session as _mod
        original = _mod.QUERY_TIMEOUT_SECONDS
        _mod.QUERY_TIMEOUT_SECONDS = 0
        try:
            rows = execute_in_session(_SESSION, "SELECT 1 AS x")
            self.assertEqual(rows[0]["x"], 1)
        finally:
            _mod.QUERY_TIMEOUT_SECONDS = original


if __name__ == "__main__":
    unittest.main()
