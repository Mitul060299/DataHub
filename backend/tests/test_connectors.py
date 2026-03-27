"""
Connector unit tests.

SQLite tests run against a real in-process database (no mocking needed).
All server-based connectors (PostgreSQL, MySQL, MSSQL, Oracle) are tested by
patching sqlalchemy.create_engine so no live server is required.
"""

from __future__ import annotations

import io
import os
import sqlite3
import tempfile
import unittest
from typing import Any
from unittest.mock import MagicMock, patch, call

import pandas as pd

from app.services.connectors import (
    BigQueryConnector,
    GoogleSheetsConnector,
    HttpCsvConnector,
    InlineCsvConnector,
    MySQLConnector,
    OracleConnector,
    PostgreSQLConnector,
    SQLServerConnector,
    SQLiteConnector,
    SnowflakeConnector,
    connector_registry,
)


# ─── helpers ──────────────────────────────────────────────────────────────────

def _make_engine_mock(rows: list[tuple] | None = None, fetchone_row: tuple | None = None):
    """
    Build a layered mock: create_engine → engine → engine.connect() ctx mgr
    → conn.execute() → result.fetchall() / fetchone().
    """
    result_mock = MagicMock()
    result_mock.fetchall.return_value = rows or []
    result_mock.fetchone.return_value = fetchone_row or (1,)

    conn_mock = MagicMock()
    conn_mock.execute.return_value = result_mock
    # Support pd.read_sql_query — it calls conn directly
    conn_mock.__enter__ = MagicMock(return_value=conn_mock)
    conn_mock.__exit__ = MagicMock(return_value=False)

    engine_mock = MagicMock()
    engine_mock.connect.return_value = conn_mock

    return engine_mock, conn_mock, result_mock


# ─── InlineCsvConnector ───────────────────────────────────────────────────────

class TestInlineCsvConnector(unittest.TestCase):
    def setUp(self):
        self.c = InlineCsvConnector()

    def test_reads_csv_text(self):
        df = self.c.read({"csv_text": "a,b\n1,2\n3,4"})
        self.assertEqual(list(df.columns), ["a", "b"])
        self.assertEqual(len(df), 2)

    def test_missing_csv_text_raises(self):
        with self.assertRaises(ValueError, msg="csv_text is required"):
            self.c.read({})

    def test_empty_csv_text_raises(self):
        with self.assertRaises(ValueError):
            self.c.read({"csv_text": ""})


# ─── HttpCsvConnector ─────────────────────────────────────────────────────────

class TestHttpCsvConnector(unittest.TestCase):
    def setUp(self):
        self.c = HttpCsvConnector()

    def test_missing_url_raises(self):
        with self.assertRaises(ValueError):
            self.c.read({})

    @patch("app.services.connectors.pd.read_csv")
    def test_reads_from_url(self, mock_read_csv):
        mock_read_csv.return_value = pd.DataFrame({"x": [1]})
        df = self.c.read({"url": "https://example.com/data.csv"})
        mock_read_csv.assert_called_once_with("https://example.com/data.csv")
        self.assertEqual(len(df), 1)


# ─── SQLiteConnector — real in-process tests ─────────────────────────────────

class TestSQLiteConnector(unittest.TestCase):
    def setUp(self):
        self.c = SQLiteConnector()
        # Create a temp SQLite file with two tables
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        conn = sqlite3.connect(self.tmp.name)
        conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        conn.execute("CREATE TABLE orders (id INTEGER PRIMARY KEY, amount REAL)")
        conn.execute("INSERT INTO users VALUES (1, 'Alice'), (2, 'Bob')")
        conn.execute("INSERT INTO orders VALUES (1, 99.9)")
        conn.commit()
        conn.close()

    def tearDown(self):
        os.unlink(self.tmp.name)

    # read
    def test_read_by_table(self):
        df = self.c.read({"file_path": self.tmp.name, "table": "users"})
        self.assertEqual(set(df.columns), {"id", "name"})
        self.assertEqual(len(df), 2)

    def test_read_by_query(self):
        df = self.c.read({"file_path": self.tmp.name, "query": "SELECT name FROM users WHERE id = 1"})
        self.assertEqual(df.iloc[0]["name"], "Alice")

    def test_read_with_where_clause(self):
        df = self.c.read({"file_path": self.tmp.name, "table": "users", "where": "id = 2"})
        self.assertEqual(len(df), 1)
        self.assertEqual(df.iloc[0]["name"], "Bob")

    def test_read_missing_file_path_raises(self):
        with self.assertRaises(ValueError, msg="file_path is required"):
            self.c.read({"table": "users"})

    def test_read_missing_query_and_table_raises(self):
        with self.assertRaises(ValueError):
            self.c.read({"file_path": self.tmp.name})

    def test_read_nonexistent_table_raises(self):
        with self.assertRaises(Exception):
            self.c.read({"file_path": self.tmp.name, "table": "nonexistent"})

    # test_connection
    def test_connection_success(self):
        result = self.c.test_connection({"file_path": self.tmp.name})
        self.assertTrue(result["success"])
        self.assertIn(self.tmp.name, result["message"])

    def test_connection_missing_file_path(self):
        result = self.c.test_connection({})
        self.assertFalse(result["success"])
        self.assertIn("file_path", result["error"])

    def test_connection_bad_path_fails_gracefully(self):
        result = self.c.test_connection({"file_path": "/nonexistent/path/db.sqlite"})
        # SQLite creates empty files; this should either succeed or fail gracefully
        # (no unhandled exception)
        self.assertIn("success", result)

    # list_tables
    def test_list_tables_returns_both_tables(self):
        tables = self.c.list_tables({"file_path": self.tmp.name})
        names = {t["table"] for t in tables}
        self.assertIn("users", names)
        self.assertIn("orders", names)
        for t in tables:
            self.assertEqual(t["schema"], "main")
            self.assertIn("row_count", t)

    def test_list_tables_missing_file_path_returns_empty(self):
        tables = self.c.list_tables({})
        self.assertEqual(tables, [])

    def test_list_tables_empty_database(self):
        tmp2 = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        tmp2.close()
        try:
            conn = sqlite3.connect(tmp2.name)
            conn.close()
            tables = self.c.list_tables({"file_path": tmp2.name})
            self.assertEqual(tables, [])
        finally:
            os.unlink(tmp2.name)


# ─── PostgreSQLConnector ──────────────────────────────────────────────────────

_PG_CREDS = {"host": "localhost", "port": 5432, "database": "db", "username": "u", "password": "p"}

class TestPostgreSQLConnector(unittest.TestCase):
    def setUp(self):
        self.c = PostgreSQLConnector()

    def test_missing_credentials_raises(self):
        with self.assertRaises(ValueError):
            self.c.read({"host": "localhost"})

    def test_missing_query_and_table_raises(self):
        with self.assertRaises(ValueError):
            self.c.read({**_PG_CREDS})

    @patch("app.services.connectors.create_engine")
    @patch("app.services.connectors.pd.read_sql_query")
    def test_read_by_table(self, mock_rsq, mock_ce):
        engine_mock, conn_mock, _ = _make_engine_mock()
        mock_ce.return_value = engine_mock
        mock_rsq.return_value = pd.DataFrame({"id": [1]})
        df = self.c.read({**_PG_CREDS, "table": "users", "schema": "public"})
        self.assertEqual(len(df), 1)
        mock_ce.assert_called_once()
        url = mock_ce.call_args[0][0]
        self.assertIn("postgresql+psycopg", url)

    @patch("app.services.connectors.create_engine")
    @patch("app.services.connectors.pd.read_sql_query")
    def test_read_by_query(self, mock_rsq, mock_ce):
        engine_mock, conn_mock, _ = _make_engine_mock()
        mock_ce.return_value = engine_mock
        mock_rsq.return_value = pd.DataFrame({"x": [42]})
        df = self.c.read({**_PG_CREDS, "query": "SELECT 42 AS x"})
        self.assertEqual(df.iloc[0]["x"], 42)

    @patch("app.services.connectors.create_engine")
    def test_test_connection_success(self, mock_ce):
        engine_mock, conn_mock, result_mock = _make_engine_mock(fetchone_row=("PostgreSQL 16",))
        mock_ce.return_value = engine_mock
        result = self.c.test_connection(_PG_CREDS)
        self.assertTrue(result["success"])

    def test_test_connection_missing_credentials(self):
        result = self.c.test_connection({"host": "localhost"})
        self.assertFalse(result["success"])
        self.assertIn("error", result)

    @patch("app.services.connectors.create_engine")
    def test_test_connection_engine_error(self, mock_ce):
        mock_ce.side_effect = Exception("connection refused")
        result = self.c.test_connection(_PG_CREDS)
        self.assertFalse(result["success"])
        self.assertIn("connection refused", result["error"])

    @patch("app.services.connectors.create_engine")
    def test_list_tables_success(self, mock_ce):
        rows = [("public", "users", 100), ("public", "orders", 50)]
        engine_mock, conn_mock, _ = _make_engine_mock(rows=rows)
        mock_ce.return_value = engine_mock
        tables = self.c.list_tables(_PG_CREDS)
        self.assertEqual(len(tables), 2)
        self.assertEqual(tables[0]["table"], "users")
        self.assertEqual(tables[0]["row_count"], 100)

    @patch("app.services.connectors.create_engine")
    def test_list_tables_engine_error_returns_empty(self, mock_ce):
        mock_ce.side_effect = Exception("timeout")
        tables = self.c.list_tables(_PG_CREDS)
        self.assertEqual(tables, [])

    def test_list_tables_missing_credentials_returns_empty(self):
        tables = self.c.list_tables({"host": "localhost"})
        self.assertEqual(tables, [])


# ─── MySQLConnector ───────────────────────────────────────────────────────────

_MYSQL_CREDS = {"host": "localhost", "port": 3306, "database": "db", "username": "u", "password": "p"}

class TestMySQLConnector(unittest.TestCase):
    def setUp(self):
        self.c = MySQLConnector()

    def test_missing_credentials_raises(self):
        with self.assertRaises(ValueError):
            self.c.read({"host": "localhost"})

    def test_missing_query_and_table_raises(self):
        with self.assertRaises(ValueError):
            self.c.read({**_MYSQL_CREDS})

    @patch("app.services.connectors.create_engine")
    @patch("app.services.connectors.pd.read_sql_query")
    def test_read_uses_pymysql_driver(self, mock_rsq, mock_ce):
        engine_mock, _, _ = _make_engine_mock()
        mock_ce.return_value = engine_mock
        mock_rsq.return_value = pd.DataFrame({"a": [1]})
        self.c.read({**_MYSQL_CREDS, "table": "t"})
        url = mock_ce.call_args[0][0]
        self.assertIn("mysql+pymysql", url)

    @patch("app.services.connectors.create_engine")
    def test_test_connection_success(self, mock_ce):
        engine_mock, _, _ = _make_engine_mock()
        mock_ce.return_value = engine_mock
        result = self.c.test_connection(_MYSQL_CREDS)
        self.assertTrue(result["success"])

    def test_test_connection_missing_credentials(self):
        result = self.c.test_connection({"host": "localhost"})
        self.assertFalse(result["success"])

    @patch("app.services.connectors.create_engine")
    def test_test_connection_engine_error(self, mock_ce):
        mock_ce.side_effect = Exception("access denied")
        result = self.c.test_connection(_MYSQL_CREDS)
        self.assertFalse(result["success"])
        self.assertIn("access denied", result["error"])

    @patch("app.services.connectors.create_engine")
    def test_list_tables_success(self, mock_ce):
        rows = [("db", "products", 200)]
        engine_mock, _, _ = _make_engine_mock(rows=rows)
        mock_ce.return_value = engine_mock
        tables = self.c.list_tables(_MYSQL_CREDS)
        self.assertEqual(tables[0]["table"], "products")
        self.assertEqual(tables[0]["row_count"], 200)

    @patch("app.services.connectors.create_engine")
    def test_list_tables_engine_error_returns_empty(self, mock_ce):
        mock_ce.side_effect = Exception("timeout")
        tables = self.c.list_tables(_MYSQL_CREDS)
        self.assertEqual(tables, [])

    def test_list_tables_missing_credentials_returns_empty(self):
        tables = self.c.list_tables({"host": "x"})
        self.assertEqual(tables, [])


# ─── SQLServerConnector ───────────────────────────────────────────────────────

_MSSQL_CREDS = {"host": "localhost", "port": 1433, "database": "db", "username": "sa", "password": "p"}

class TestSQLServerConnector(unittest.TestCase):
    def setUp(self):
        self.c = SQLServerConnector()

    def test_missing_credentials_raises(self):
        with self.assertRaises(ValueError):
            self.c.read({"host": "localhost"})

    def test_missing_query_and_table_raises(self):
        with self.assertRaises(ValueError):
            self.c.read({**_MSSQL_CREDS})

    @patch("app.services.connectors.create_engine")
    @patch("app.services.connectors.pd.read_sql_query")
    def test_read_uses_pymssql_driver(self, mock_rsq, mock_ce):
        engine_mock, _, _ = _make_engine_mock()
        mock_ce.return_value = engine_mock
        mock_rsq.return_value = pd.DataFrame({"col": [1]})
        self.c.read({**_MSSQL_CREDS, "table": "t"})
        url = mock_ce.call_args[0][0]
        self.assertIn("mssql+pymssql", url)

    @patch("app.services.connectors.create_engine")
    def test_test_connection_success(self, mock_ce):
        engine_mock, _, _ = _make_engine_mock()
        mock_ce.return_value = engine_mock
        result = self.c.test_connection(_MSSQL_CREDS)
        self.assertTrue(result["success"])

    def test_test_connection_missing_credentials(self):
        result = self.c.test_connection({"host": "localhost"})
        self.assertFalse(result["success"])

    @patch("app.services.connectors.create_engine")
    def test_test_connection_engine_error(self, mock_ce):
        mock_ce.side_effect = Exception("login failed")
        result = self.c.test_connection(_MSSQL_CREDS)
        self.assertFalse(result["success"])
        self.assertIn("login failed", result["error"])

    @patch("app.services.connectors.create_engine")
    def test_list_tables_returns_schema_and_table(self, mock_ce):
        rows = [("dbo", "invoices", 0), ("dbo", "customers", 0)]
        engine_mock, _, _ = _make_engine_mock(rows=rows)
        mock_ce.return_value = engine_mock
        tables = self.c.list_tables(_MSSQL_CREDS)
        self.assertEqual(len(tables), 2)
        self.assertEqual(tables[0]["schema"], "dbo")
        self.assertEqual(tables[0]["table"], "invoices")

    @patch("app.services.connectors.create_engine")
    def test_list_tables_engine_error_returns_empty(self, mock_ce):
        mock_ce.side_effect = Exception("network error")
        tables = self.c.list_tables(_MSSQL_CREDS)
        self.assertEqual(tables, [])

    def test_list_tables_missing_credentials_returns_empty(self):
        tables = self.c.list_tables({"host": "x"})
        self.assertEqual(tables, [])


# ─── OracleConnector ──────────────────────────────────────────────────────────

_ORA_CREDS = {"host": "localhost", "port": 1521, "service_name": "ORCL", "username": "scott", "password": "tiger"}

class TestOracleConnector(unittest.TestCase):
    def setUp(self):
        self.c = OracleConnector()

    def test_missing_host_raises(self):
        # host defaults to "localhost" when omitted; pass None explicitly to trigger validation
        with self.assertRaises(ValueError):
            self.c.read({"host": None, "username": "u", "password": "p", "service_name": "ORCL", "table": "t"})

    def test_missing_service_name_and_sid_raises(self):
        with self.assertRaises(ValueError):
            self.c.read({"host": "h", "username": "u", "password": "p", "table": "t"})

    def test_missing_query_and_table_raises(self):
        with self.assertRaises(ValueError):
            self.c.read({**_ORA_CREDS})

    @patch("app.services.connectors.create_engine")
    @patch("app.services.connectors.pd.read_sql_query")
    def test_read_uses_oracledb_driver(self, mock_rsq, mock_ce):
        engine_mock, _, _ = _make_engine_mock()
        mock_ce.return_value = engine_mock
        mock_rsq.return_value = pd.DataFrame({"n": [1]})
        self.c.read({**_ORA_CREDS, "table": "t"})
        url = mock_ce.call_args[0][0]
        self.assertIn("oracle+oracledb", url)
        self.assertIn("ORCL", url)

    @patch("app.services.connectors.create_engine")
    @patch("app.services.connectors.pd.read_sql_query")
    def test_read_uses_sid_when_service_name_absent(self, mock_rsq, mock_ce):
        engine_mock, _, _ = _make_engine_mock()
        mock_ce.return_value = engine_mock
        mock_rsq.return_value = pd.DataFrame({"n": [1]})
        creds = {**_ORA_CREDS}
        del creds["service_name"]
        creds["sid"] = "MYSID"
        self.c.read({**creds, "table": "t"})
        url = mock_ce.call_args[0][0]
        self.assertIn("MYSID", url)

    @patch("app.services.connectors.create_engine")
    def test_test_connection_success(self, mock_ce):
        engine_mock, _, _ = _make_engine_mock()
        mock_ce.return_value = engine_mock
        result = self.c.test_connection(_ORA_CREDS)
        self.assertTrue(result["success"])

    def test_test_connection_missing_credentials(self):
        result = self.c.test_connection({"host": "localhost"})
        self.assertFalse(result["success"])

    def test_test_connection_missing_service_name_and_sid(self):
        result = self.c.test_connection({"host": "h", "username": "u", "password": "p"})
        self.assertFalse(result["success"])

    @patch("app.services.connectors.create_engine")
    def test_test_connection_engine_error(self, mock_ce):
        mock_ce.side_effect = Exception("ORA-12541: no listener")
        result = self.c.test_connection(_ORA_CREDS)
        self.assertFalse(result["success"])
        self.assertIn("ORA-12541", result["error"])

    @patch("app.services.connectors.create_engine")
    def test_list_tables_success(self, mock_ce):
        rows = [("SCOTT", "EMP", 14), ("SCOTT", "DEPT", 4)]
        engine_mock, _, _ = _make_engine_mock(rows=rows)
        mock_ce.return_value = engine_mock
        tables = self.c.list_tables(_ORA_CREDS)
        self.assertEqual(len(tables), 2)
        self.assertEqual(tables[0]["schema"], "SCOTT")
        self.assertEqual(tables[0]["table"], "EMP")
        self.assertEqual(tables[0]["row_count"], 14)

    @patch("app.services.connectors.create_engine")
    def test_list_tables_engine_error_returns_empty(self, mock_ce):
        mock_ce.side_effect = Exception("ORA-01017: invalid username/password")
        tables = self.c.list_tables(_ORA_CREDS)
        self.assertEqual(tables, [])

    def test_list_tables_missing_credentials_returns_empty(self):
        tables = self.c.list_tables({"host": "x"})
        self.assertEqual(tables, [])


# ─── ConnectorRegistry ────────────────────────────────────────────────────────

class TestConnectorRegistry(unittest.TestCase):
    def test_all_expected_connectors_registered(self):
        names = connector_registry.list()
        for expected in [
            "postgresql", "mysql", "sqlite", "mssql", "oracle",
            "google_sheets", "inline_csv", "http_csv", "sql_query",
            "snowflake", "bigquery", "redshift",
        ]:
            self.assertIn(expected, names, f"'{expected}' not found in registry")

    def test_get_returns_correct_type(self):
        self.assertIsInstance(connector_registry.get("sqlite"), SQLiteConnector)
        self.assertIsInstance(connector_registry.get("postgresql"), PostgreSQLConnector)
        self.assertIsInstance(connector_registry.get("mysql"), MySQLConnector)
        self.assertIsInstance(connector_registry.get("mssql"), SQLServerConnector)
        self.assertIsInstance(connector_registry.get("oracle"), OracleConnector)

    def test_get_unknown_returns_none(self):
        self.assertIsNone(connector_registry.get("nonexistent_connector_xyz"))

    def test_each_registered_connector_has_read_method(self):
        for name in connector_registry.list():
            c = connector_registry.get(name)
            self.assertTrue(hasattr(c, "read"), f"'{name}' connector missing read()")

    def test_each_registered_connector_has_test_connection_or_pass(self):
        # All new DB connectors must implement test_connection
        for name in ["postgresql", "mysql", "sqlite", "mssql", "oracle"]:
            c = connector_registry.get(name)
            self.assertTrue(
                hasattr(c, "test_connection"),
                f"'{name}' connector missing test_connection()"
            )

    def test_each_registered_connector_has_list_tables(self):
        for name in ["postgresql", "mysql", "sqlite", "mssql", "oracle"]:
            c = connector_registry.get(name)
            self.assertTrue(
                hasattr(c, "list_tables"),
                f"'{name}' connector missing list_tables()"
            )

    def test_register_and_remove_custom_connector(self):
        class _Dummy:
            name = "_test_dummy"
            def read(self, config): return pd.DataFrame()
        connector_registry.register("_test_dummy", _Dummy())
        self.assertIsNotNone(connector_registry.get("_test_dummy"))
        connector_registry.remove("_test_dummy")
        self.assertIsNone(connector_registry.get("_test_dummy"))


# ─── Connection URL construction ─────────────────────────────────────────────

class TestConnectionURLs(unittest.TestCase):
    """Verify that each connector builds the correct SQLAlchemy dialect URL."""

    @patch("app.services.connectors.create_engine")
    @patch("app.services.connectors.pd.read_sql_query")
    def test_postgresql_url_format(self, mock_rsq, mock_ce):
        mock_ce.return_value, _, _ = _make_engine_mock()
        mock_rsq.return_value = pd.DataFrame()
        PostgreSQLConnector().read({**_PG_CREDS, "table": "t"})
        url = mock_ce.call_args[0][0]
        self.assertTrue(url.startswith("postgresql+psycopg://u:p@localhost:5432/db"))

    @patch("app.services.connectors.create_engine")
    @patch("app.services.connectors.pd.read_sql_query")
    def test_mysql_url_format(self, mock_rsq, mock_ce):
        mock_ce.return_value, _, _ = _make_engine_mock()
        mock_rsq.return_value = pd.DataFrame()
        MySQLConnector().read({**_MYSQL_CREDS, "table": "t"})
        url = mock_ce.call_args[0][0]
        self.assertTrue(url.startswith("mysql+pymysql://u:p@localhost:3306/db"))

    @patch("app.services.connectors.create_engine")
    @patch("app.services.connectors.pd.read_sql_query")
    def test_mssql_url_format(self, mock_rsq, mock_ce):
        mock_ce.return_value, _, _ = _make_engine_mock()
        mock_rsq.return_value = pd.DataFrame()
        SQLServerConnector().read({**_MSSQL_CREDS, "table": "t"})
        url = mock_ce.call_args[0][0]
        self.assertTrue(url.startswith("mssql+pymssql://sa:p@localhost:1433/db"))

    @patch("app.services.connectors.create_engine")
    @patch("app.services.connectors.pd.read_sql_query")
    def test_oracle_url_format_service_name(self, mock_rsq, mock_ce):
        mock_ce.return_value, _, _ = _make_engine_mock()
        mock_rsq.return_value = pd.DataFrame()
        OracleConnector().read({**_ORA_CREDS, "table": "t"})
        url = mock_ce.call_args[0][0]
        self.assertTrue(url.startswith("oracle+oracledb://scott:tiger@localhost:1521/ORCL"))

    def test_sqlite_url_format(self):
        # SQLite URL is built inline — verify via test_connection which calls create_engine
        with patch("app.services.connectors.create_engine") as mock_ce:
            engine_mock, _, _ = _make_engine_mock()
            mock_ce.return_value = engine_mock
            SQLiteConnector().test_connection({"file_path": "/tmp/test.db"})
            url = mock_ce.call_args[0][0]
            self.assertEqual(url, "sqlite:////tmp/test.db")


if __name__ == "__main__":
    unittest.main()
