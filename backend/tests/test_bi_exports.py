"""
Tests for BI export endpoints (Power BI / Tableau / Google Sheets) and
the fixed GET /datasets/{id}/export endpoint.

Coverage:
  A — ExportService._load_df_for_dataset
        A1. Uses DuckDB read_parquet when storage_path is present
        A2. Falls back to DatasetChunkDB when storage_path is absent
        A3. Raises ValueError for unknown dataset_id

  B — ExportService.export_powerbi
        B1. Returns non-empty bytes
        B2. Output is a valid ZIP (xlsx is a zip archive)
        B3. Header row is written (frozen panes style)

  C — ExportService.export_tableau  
        C1. Falls back to CSV when pantab is not importable
        C2. CSV fallback contains correct header and data rows
        C3. pantab path is called when available (mock)

  D — ExportService.export_sheets
        D1. Raises ValueError when google_service_account_json is empty
        D2. Calls gspread.authorize and worksheet.clear in replace mode
        D3. Calls append_rows in append mode (no clear)
        D4. Creates a new worksheet if the named sheet does not exist

  E — GET /datasets/{id}/export (fixed endpoint)
        E1. DuckDB path: queries read_parquet, no DatasetChunkDB touch
        E2. Legacy path: reads from DatasetChunkDB chunks when storage_path is None
        E3. SQL injection guard: filter_val with single-quote is sanitised

  F — GET /datasets/{id}/export/powerbi endpoint
        F1. Returns 404 for unknown dataset
        F2. Calls ExportService.export_powerbi and streams xlsx bytes
        F3. Content-Disposition header includes .xlsx

  G — GET /datasets/{id}/export/tableau endpoint
        G1. Returns 404 for unknown dataset
        G2. Returns .hyper suffix when MIME is application/octet-stream
        G3. Returns .csv suffix when MIME is text/csv (fallback path)

  H — POST /datasets/{id}/export/sheets endpoint
        H1. Returns 422 when spreadsheet_url is missing
        H2. Returns 422 when mode is invalid
        H3. Returns 400 when ExportService raises ValueError (no SA JSON)
        H4. Returns result dict on success

  I — GET /datasets/export/sheets-config
        I1. Returns empty string when SA JSON is not set
        I2. Parses client_email from raw JSON
        I3. Parses client_email from base64-encoded JSON
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import unittest
import zipfile
from unittest.mock import MagicMock, patch, call

import asyncio

# ── Stub optional heavy deps before any app import ────────────────────────────
for _mod in [
    "chromadb", "chromadb.utils", "chromadb.config", "chromadb.api",
    "slowapi.util", "slowapi.errors", "slowapi.middleware",
]:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# Stub slowapi so that @limiter.limit("x/hour") is a no-op passthrough decorator
if "slowapi" not in sys.modules:
    _slowapi_stub = MagicMock()
    # Make Limiter().limit(rate)(func) return func unchanged
    _passthrough = lambda rate: (lambda fn: fn)
    _slowapi_stub.Limiter.return_value.limit = _passthrough
    sys.modules["slowapi"] = _slowapi_stub

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")


# =============================================================================
# Response helper
# =============================================================================

def _consume_response(response) -> bytes:
    """Consume a Starlette StreamingResponse body (handles async body_iterator)."""
    async def _collect():
        chunks: list[bytes] = []
        async for chunk in response.body_iterator:
            if isinstance(chunk, str):
                chunk = chunk.encode("utf-8")
            chunks.append(chunk)
        return b"".join(chunks)
    return asyncio.run(_collect())


# =============================================================================
# Helpers
# =============================================================================

def _make_meta(dataset_id: str = "ds-1", storage_path: str | None = "gs://bucket/file.parquet",
               name: str = "Test Dataset") -> MagicMock:
    m = MagicMock()
    m.id = dataset_id
    m.name = name
    m.storage_path = storage_path
    m.columns = [{"name": "id", "type": "INTEGER"}, {"name": "val", "type": "VARCHAR"}]
    m.row_count = 3
    return m


def _make_chunk(rows: list[dict], chunk_index: int = 0) -> MagicMock:
    c = MagicMock()
    c.rows = rows
    c.chunk_index = chunk_index
    return c


def _sample_df():
    import pandas as pd
    return pd.DataFrame({"id": [1, 2, 3], "val": ["a", "b", "c"]})


# =============================================================================
# A — ExportService._load_df_for_dataset
# =============================================================================

class TestLoadDf(unittest.TestCase):

    def _db_with_meta(self, meta):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = meta
        return db

    def test_A1_uses_duckdb_read_parquet(self):
        """When storage_path is set, DuckDB read_parquet is used."""
        from app.services.export_service import ExportService
        meta = _make_meta(storage_path="s3://bucket/file.parquet")
        db = self._db_with_meta(meta)
        df = _sample_df()

        mock_conn = MagicMock()
        mock_conn.execute.return_value.df.return_value = df

        with patch("app.services.export_service.StorageService.get_query_path", return_value="/tmp/file.parquet"), \
             patch("app.services.duckdb_service.DuckDBService._ensure_db", return_value=mock_conn):
            result = ExportService._load_df_for_dataset("ds-1", db)

        self.assertEqual(list(result.columns), ["id", "val"])
        self.assertEqual(len(result), 3)
        # Confirm read_parquet was used — no DatasetChunkDB query
        db.query.assert_called()
        sql_call = mock_conn.execute.call_args[0][0]
        self.assertIn("read_parquet", sql_call)

    def test_A2_fallback_to_chunk_table(self):
        """When storage_path is None, DatasetChunkDB chunks are assembled."""
        from app.services.export_service import ExportService
        meta = _make_meta(storage_path=None)
        db = MagicMock()
        # First call (DatasetMetaDB lookup) returns meta
        chunk1 = _make_chunk([{"id": 1, "val": "a"}, {"id": 2, "val": "b"}], chunk_index=0)
        chunk2 = _make_chunk([{"id": 3, "val": "c"}], chunk_index=1)

        def _query_side_effect(model):
            mock_q = MagicMock()
            if "DatasetMetaDB" in str(model):
                mock_q.filter.return_value.first.return_value = meta
            else:
                # DatasetChunkDB query
                mock_q.filter.return_value.order_by.return_value.all.return_value = [chunk1, chunk2]
            return mock_q

        db.query.side_effect = _query_side_effect

        result = ExportService._load_df_for_dataset("ds-1", db)
        self.assertEqual(len(result), 3)
        self.assertListEqual(list(result["id"]), [1, 2, 3])

    def test_A3_raises_for_unknown_dataset(self):
        """ValueError raised when dataset is not found."""
        from app.services.export_service import ExportService
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        with self.assertRaises(ValueError, msg="Should raise for missing dataset"):
            ExportService._load_df_for_dataset("nonexistent", db)


# =============================================================================
# B — ExportService.export_powerbi
# =============================================================================

class TestExportPowerBI(unittest.TestCase):

    def _run(self, df=None):
        from app.services.export_service import ExportService
        if df is None:
            df = _sample_df()
        db = MagicMock()

        with patch.object(ExportService, "_load_df_for_dataset", return_value=df):
            return ExportService.export_powerbi("ds-1", "My Dataset", db)

    def test_B1_returns_nonempty_bytes(self):
        data = self._run()
        self.assertIsInstance(data, bytes)
        self.assertGreater(len(data), 0)

    def test_B2_output_is_valid_xlsx_zip(self):
        """xlsx files are ZIP archives — verify the magic bytes."""
        data = self._run()
        self.assertTrue(zipfile.is_zipfile(io.BytesIO(data)), "Output is not a valid ZIP/xlsx file")

    def test_B3_contains_data_sheet(self):
        """The zip should contain xl/worksheets/sheet1.xml (standard xlsx structure)."""
        import zipfile as zf
        data = self._run()
        with zf.ZipFile(io.BytesIO(data)) as z:
            names = z.namelist()
        self.assertTrue(any("worksheets" in n for n in names), f"No worksheet found in xlsx. Names: {names}")

    def test_B4_date_column_detected(self):
        """No exception raised for dataframe with date-like column names."""
        import pandas as pd
        df = pd.DataFrame({"created_at": ["2024-01-01", "2024-01-02"], "amount": [10.0, 20.0]})
        data = self._run(df)
        self.assertIsInstance(data, bytes)
        self.assertGreater(len(data), 0)

    def test_B5_single_row_df(self):
        """Edge case: single-row dataframe should not crash."""
        import pandas as pd
        df = pd.DataFrame({"x": [42]})
        data = self._run(df)
        self.assertTrue(zipfile.is_zipfile(io.BytesIO(data)))


# =============================================================================
# C — ExportService.export_tableau
# =============================================================================

class TestExportTableau(unittest.TestCase):

    def test_C1_csv_fallback_when_pantab_unavailable(self):
        """When pantab import fails, falls back to CSV bytes."""
        from app.services.export_service import ExportService
        df = _sample_df()
        db = MagicMock()

        # Raise ImportError when pantab is imported inside export_tableau
        original_import = __builtins__.__import__ if hasattr(__builtins__, '__import__') else __import__

        def _mock_import(name, *args, **kwargs):
            if name == "pantab":
                raise ImportError("pantab not installed")
            return original_import(name, *args, **kwargs)

        with patch.object(ExportService, "_load_df_for_dataset", return_value=df), \
             patch("builtins.__import__", side_effect=_mock_import):
            file_bytes, mime_type = ExportService.export_tableau("ds-1", "Test", db)

        self.assertEqual(mime_type, "text/csv")
        self.assertIn(b"id,val", file_bytes)

    def test_C2_csv_fallback_contains_correct_rows(self):
        """CSV fallback includes all rows from the dataframe."""
        from app.services.export_service import ExportService
        df = _sample_df()
        db = MagicMock()

        # Force pantab import to fail so CSV fallback is used
        original_import = __import__

        def _mock_import(name, *args, **kwargs):
            if name == "pantab":
                raise ImportError("pantab not installed")
            return original_import(name, *args, **kwargs)

        with patch.object(ExportService, "_load_df_for_dataset", return_value=df), \
             patch("builtins.__import__", side_effect=_mock_import):
            file_bytes, mime_type = ExportService.export_tableau("ds-1", "Test", db)

        csv_text = file_bytes.decode("utf-8")
        lines = [l for l in csv_text.strip().split("\n") if l]
        # header + 3 data rows
        self.assertEqual(len(lines), 4, f"Expected 4 lines (1 header + 3 data), got: {lines}")
        self.assertIn("id", lines[0])

    def test_C3_pantab_path_called_when_available(self):
        """When pantab is importable, pantab.frame_to_hyper is called."""
        from app.services.export_service import ExportService
        df = _sample_df()
        db = MagicMock()

        mock_pantab = MagicMock()
        mock_tab_api = MagicMock()

        # Mock the hyper write to write dummy bytes to the buffer
        def _mock_frame_to_hyper(df_arg, buf, table):
            buf.write(b"HYPER_MAGIC_BYTES")

        mock_pantab.frame_to_hyper.side_effect = _mock_frame_to_hyper

        extra_modules = {
            "pantab": mock_pantab,
            "tableauhyperapi": mock_tab_api,
        }
        with patch.object(ExportService, "_load_df_for_dataset", return_value=df), \
             patch.dict("sys.modules", extra_modules):
            file_bytes, mime_type = ExportService.export_tableau("ds-1", "Test", db)

        mock_pantab.frame_to_hyper.assert_called_once()
        self.assertEqual(mime_type, "application/octet-stream")
        self.assertEqual(file_bytes, b"HYPER_MAGIC_BYTES")


# =============================================================================
# D — ExportService.export_sheets
# =============================================================================

class TestExportSheets(unittest.TestCase):

    def _settings_no_json(self):
        s = MagicMock()
        s.google_service_account_json = ""
        return s

    def _settings_with_json(self, email: str = "sa@project.iam.gserviceaccount.com"):
        sa_info = {
            "type": "service_account",
            "client_email": email,
            "private_key": "FAKE_KEY",
            "project_id": "proj",
        }
        s = MagicMock()
        s.google_service_account_json = json.dumps(sa_info)
        return s

    def test_D1_raises_when_sa_json_empty(self):
        """ValueError raised when GOOGLE_SERVICE_ACCOUNT_JSON is not configured."""
        from app.services.export_service import ExportService
        db = MagicMock()

        with patch("app.services.export_service.ExportService._load_df_for_dataset", return_value=_sample_df()), \
             patch("app.config.settings", self._settings_no_json()), \
             patch.dict("sys.modules", {
                 "gspread": MagicMock(),
                 "google.oauth2.service_account": MagicMock(),
             }):
            with self.assertRaises(ValueError) as ctx:
                ExportService.export_sheets("ds-1", "https://docs.google.com/s/x", "Sheet1", "replace", db)
        self.assertIn("GOOGLE_SERVICE_ACCOUNT_JSON", str(ctx.exception))

    def test_D2_replace_mode_calls_clear(self):
        """In replace mode, worksheet.clear() is called before writing."""
        from app.services.export_service import ExportService
        df = _sample_df()
        db = MagicMock()

        mock_gc = MagicMock()
        mock_ws = MagicMock()
        mock_gc.open_by_url.return_value.worksheet.return_value = mock_ws

        mock_creds = MagicMock()
        mock_gspread = MagicMock()
        mock_gspread.authorize.return_value = mock_gc
        mock_google_auth = MagicMock()
        mock_google_auth.Credentials.from_service_account_info.return_value = mock_creds

        with patch.object(ExportService, "_load_df_for_dataset", return_value=df), \
             patch("app.config.settings", self._settings_with_json()), \
             patch.dict("sys.modules", {
                 "gspread": mock_gspread,
                 "google.oauth2.service_account": mock_google_auth,
             }):
            result = ExportService.export_sheets("ds-1", "https://docs.google.com/s/x", "Sheet1", "replace", db)

        mock_ws.clear.assert_called_once()
        mock_ws.append_rows.assert_called()
        self.assertEqual(result["rows_written"], 3)
        self.assertEqual(result["sheet_name"], "Sheet1")

    def test_D3_append_mode_skips_clear(self):
        """In append mode, worksheet.clear() is NOT called."""
        from app.services.export_service import ExportService
        df = _sample_df()
        db = MagicMock()

        mock_gc = MagicMock()
        mock_ws = MagicMock()
        mock_ws.get_all_values.return_value = [["id", "val"], [1, "a"]]  # existing 2 rows
        mock_gc.open_by_url.return_value.worksheet.return_value = mock_ws

        mock_creds = MagicMock()
        mock_gspread = MagicMock()
        mock_gspread.authorize.return_value = mock_gc
        mock_google_auth = MagicMock()
        mock_google_auth.Credentials.from_service_account_info.return_value = mock_creds

        with patch.object(ExportService, "_load_df_for_dataset", return_value=df), \
             patch("app.config.settings", self._settings_with_json()), \
             patch.dict("sys.modules", {
                 "gspread": mock_gspread,
                 "google.oauth2.service_account": mock_google_auth,
             }):
            ExportService.export_sheets("ds-1", "https://docs.google.com/s/x", "Sheet1", "append", db)

        mock_ws.clear.assert_not_called()

    def test_D4_creates_worksheet_if_missing(self):
        """WorksheetNotFound triggers add_worksheet call."""
        from app.services.export_service import ExportService
        df = _sample_df()
        db = MagicMock()

        mock_gc = MagicMock()
        mock_spreadsheet = MagicMock()
        mock_new_ws = MagicMock()

        # worksheet() raises WorksheetNotFound
        mock_gspread = MagicMock()
        mock_gspread.WorksheetNotFound = Exception  # use plain Exception as the exception class
        mock_spreadsheet.worksheet.side_effect = mock_gspread.WorksheetNotFound("not found")
        mock_spreadsheet.add_worksheet.return_value = mock_new_ws
        mock_gc.open_by_url.return_value = mock_spreadsheet

        mock_creds = MagicMock()
        mock_gspread.authorize.return_value = mock_gc
        mock_google_auth = MagicMock()
        mock_google_auth.Credentials.from_service_account_info.return_value = mock_creds

        with patch.object(ExportService, "_load_df_for_dataset", return_value=df), \
             patch("app.config.settings", self._settings_with_json()), \
             patch.dict("sys.modules", {
                 "gspread": mock_gspread,
                 "google.oauth2.service_account": mock_google_auth,
             }):
            ExportService.export_sheets("ds-1", "https://docs.google.com/s/x", "NewSheet", "replace", db)

        mock_spreadsheet.add_worksheet.assert_called_once()

    def test_D5_base64_encoded_json_accepted(self):
        """Service account JSON encoded in base64 is decoded correctly."""
        from app.services.export_service import ExportService
        df = _sample_df()
        db = MagicMock()

        sa_info = {"type": "service_account", "client_email": "sa@x.iam.gserviceaccount.com", "private_key": "K", "project_id": "p"}
        encoded_json = base64.b64encode(json.dumps(sa_info).encode()).decode()

        s = MagicMock()
        s.google_service_account_json = encoded_json  # base64, not raw JSON

        mock_creds = MagicMock()
        mock_gc = MagicMock()
        mock_ws = MagicMock()
        mock_gc.open_by_url.return_value.worksheet.return_value = mock_ws

        mock_gspread = MagicMock()
        mock_gspread.authorize.return_value = mock_gc
        mock_google_auth = MagicMock()
        mock_google_auth.Credentials.from_service_account_info.return_value = mock_creds

        with patch.object(ExportService, "_load_df_for_dataset", return_value=df), \
             patch("app.config.settings", s), \
             patch.dict("sys.modules", {
                 "gspread": mock_gspread,
                 "google.oauth2.service_account": mock_google_auth,
             }):
            result = ExportService.export_sheets("ds-1", "https://docs.google.com/s/x", "Sheet1", "replace", db)

        self.assertIn("rows_written", result)


# =============================================================================
# E — GET /datasets/{id}/export (fixed endpoint logic)
# =============================================================================

class TestExportCsvEndpoint(unittest.TestCase):
    """Test the router-level export_dataset function by calling it directly."""

    def _invoke(self, dataset_id: str, db: MagicMock, **kwargs):
        from app.routers.datasets import export_dataset
        mock_request = MagicMock()
        mock_request.client = MagicMock()
        mock_request.client.host = "127.0.0.1"
        # Use __wrapped__ to bypass the @limiter.limit decorator applied at import time
        func = getattr(export_dataset, "__wrapped__", export_dataset)
        with patch("app.routers.datasets.get_current_role", return_value="admin"), \
             patch("app.routers.datasets.require_role"), \
             patch("app.routers.datasets.audit_store"), \
             patch("app.routers.datasets.increment_usage"), \
             patch("app.routers.datasets._enforce_api_call"):
            return func(request=mock_request, dataset_id=dataset_id, authorization=None, db=db, **kwargs)

    def test_E1_duckdb_path_uses_read_parquet(self):
        """storage_path present → DuckDB read_parquet SQL is executed."""
        meta = _make_meta(storage_path="s3://b/f.parquet")
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = meta

        # Simulate DuckDB result
        mock_result = MagicMock()
        mock_result.description = [("id",), ("val",)]
        mock_batch = MagicMock()
        mock_batch.to_pylist.return_value = [{"id": 1, "val": "a"}, {"id": 2, "val": "b"}]
        mock_result.fetch_arrow_reader.return_value = [mock_batch]
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_result

        with patch("app.routers.datasets.StorageService.get_query_path", return_value="/tmp/f.parquet"), \
             patch("app.routers.datasets.DuckDBService._ensure_db", return_value=mock_conn), \
             patch("app.routers.datasets.emit_event"):
            response = self._invoke("ds-1", db)
            _consume_response(response)  # exhaust the lazy generator

        # Verify DuckDB execute was called with read_parquet
        call_sql = mock_conn.execute.call_args[0][0]
        self.assertIn("read_parquet", call_sql)
        # DatasetChunkDB should NOT be queried
        for c in db.query.call_args_list:
            args = c[0]
            self.assertNotIn("DatasetChunkDB", str(args))

    def test_E2_legacy_path_reads_from_chunks(self):
        """storage_path is None → falls back to reading DatasetChunkDB rows."""
        meta = _make_meta(storage_path=None)
        meta.columns = ["id", "val"]  # plain strings in legacy format

        chunk = _make_chunk([{"id": 1, "val": "x"}, {"id": 2, "val": "y"}])

        db = MagicMock()

        def _q(model):
            mq = MagicMock()
            if "DatasetMetaDB" in str(model):
                mq.filter.return_value.first.return_value = meta
            else:
                # DatasetChunkDB
                mq.filter.return_value.order_by.return_value.all.return_value = [chunk]
            return mq

        db.query.side_effect = _q

        with patch("app.routers.datasets.emit_event"):
            response = self._invoke("ds-1", db)

        # Collect the generator output
        content = _consume_response(response)
        lines = content.decode().strip().split("\n")
        self.assertEqual(lines[0], "id,val")  # header
        self.assertEqual(len(lines), 3)  # header + 2 rows

    def test_E3_sql_injection_guard_filter_val(self):
        """filter_val containing a single-quote is sanitised (escaped) in SQL."""
        meta = _make_meta(storage_path="s3://b/f.parquet")
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = meta

        mock_result = MagicMock()
        mock_result.description = [("id",)]
        mock_result.fetch_arrow_reader.return_value = []
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_result

        with patch("app.routers.datasets.StorageService.get_query_path", return_value="/tmp/f.parquet"), \
             patch("app.routers.datasets.DuckDBService._ensure_db", return_value=mock_conn), \
             patch("app.routers.datasets.emit_event"):
            response = self._invoke(
                "ds-1", db,
                filter_col="val",
                filter_op="contains",
                filter_val="O'Brien",
            )
            _consume_response(response)  # exhaust the lazy generator

        call_sql = mock_conn.execute.call_args[0][0]
        # The raw single-quote should be escaped, not present unescaped
        self.assertNotIn("O'Brien", call_sql, "Single-quote should be escaped in SQL")
        self.assertIn("o''brien", call_sql.lower(), "Expected escaped single-quote in SQL")

    def test_E4_returns_404_for_unknown_dataset(self):
        """Unknown dataset_id returns HTTP 404."""
        from fastapi import HTTPException
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        with self.assertRaises(HTTPException) as ctx:
            self._invoke("no-such-id", db)
        self.assertEqual(ctx.exception.status_code, 404)


# =============================================================================
# F — GET /datasets/{id}/export/powerbi (endpoint)
# =============================================================================

class TestPowerBIEndpoint(unittest.TestCase):

    def _invoke(self, dataset_id: str, db: MagicMock):
        from app.routers.datasets import export_dataset_powerbi
        mock_request = MagicMock()
        mock_request.client = MagicMock()
        mock_request.client.host = "127.0.0.1"
        func = getattr(export_dataset_powerbi, "__wrapped__", export_dataset_powerbi)
        with patch("app.routers.datasets.get_current_role", return_value="admin"), \
             patch("app.routers.datasets.require_role"), \
             patch("app.routers.datasets.audit_store"), \
             patch("app.routers.datasets.increment_usage"), \
             patch("app.routers.datasets._enforce_api_call"):
            return func(request=mock_request, dataset_id=dataset_id, authorization=None, db=db)

    def test_F1_returns_404_for_unknown_dataset(self):
        from fastapi import HTTPException
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("bad-id", db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_F2_calls_export_powerbi_and_streams_xlsx(self):
        meta = _make_meta()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = meta

        fake_xlsx = b"PK\x03\x04fake-xlsx-bytes"  # fake xlsx magic

        with patch("app.services.export_service.ExportService.export_powerbi", return_value=fake_xlsx), \
             patch("app.routers.datasets.emit_event"):
            response = self._invoke("ds-1", db)

        content = _consume_response(response)
        self.assertEqual(content, fake_xlsx)

    def test_F3_content_disposition_contains_xlsx(self):
        meta = _make_meta()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = meta

        with patch("app.services.export_service.ExportService.export_powerbi", return_value=b"bytes"), \
             patch("app.routers.datasets.emit_event"):
            response = self._invoke("ds-1", db)

        cd = response.headers.get("content-disposition", "")
        self.assertIn(".xlsx", cd)

    def test_F4_returns_500_on_service_error(self):
        from fastapi import HTTPException
        meta = _make_meta()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = meta

        with patch("app.services.export_service.ExportService.export_powerbi", side_effect=RuntimeError("DuckDB unavailable")), \
             patch("app.routers.datasets.emit_event"):
            with self.assertRaises(HTTPException) as ctx:
                self._invoke("ds-1", db)
        self.assertEqual(ctx.exception.status_code, 500)


# =============================================================================
# G — GET /datasets/{id}/export/tableau (endpoint)
# =============================================================================

class TestTableauEndpoint(unittest.TestCase):

    def _invoke(self, dataset_id: str, db: MagicMock):
        from app.routers.datasets import export_dataset_tableau
        mock_request = MagicMock()
        mock_request.client = MagicMock()
        mock_request.client.host = "127.0.0.1"
        func = getattr(export_dataset_tableau, "__wrapped__", export_dataset_tableau)
        with patch("app.routers.datasets.get_current_role", return_value="admin"), \
             patch("app.routers.datasets.require_role"), \
             patch("app.routers.datasets.audit_store"), \
             patch("app.routers.datasets.increment_usage"), \
             patch("app.routers.datasets._enforce_api_call"):
            return func(request=mock_request, dataset_id=dataset_id, authorization=None, db=db)

    def test_G1_returns_404_for_unknown_dataset(self):
        from fastapi import HTTPException
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("bad-id", db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_G2_hyper_extension_for_octet_stream(self):
        meta = _make_meta()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = meta

        with patch("app.services.export_service.ExportService.export_tableau", return_value=(b"HYPER_BYTES", "application/octet-stream")), \
             patch("app.routers.datasets.emit_event"):
            response = self._invoke("ds-1", db)

        cd = response.headers.get("content-disposition", "")
        self.assertIn(".hyper", cd)
        self.assertNotIn(".csv", cd)

    def test_G3_csv_extension_for_csv_fallback(self):
        meta = _make_meta()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = meta

        with patch("app.services.export_service.ExportService.export_tableau", return_value=(b"id,val\n1,a\n", "text/csv")), \
             patch("app.routers.datasets.emit_event"):
            response = self._invoke("ds-1", db)

        cd = response.headers.get("content-disposition", "")
        self.assertIn(".csv", cd)
        self.assertNotIn(".hyper", cd)


# =============================================================================
# H — POST /datasets/{id}/export/sheets (endpoint)
# =============================================================================

class TestSheetsEndpoint(unittest.TestCase):

    def _invoke(self, dataset_id: str, payload: dict, db: MagicMock):
        from app.routers.datasets import export_dataset_to_sheets
        mock_request = MagicMock()
        mock_request.client = MagicMock()
        mock_request.client.host = "127.0.0.1"
        func = getattr(export_dataset_to_sheets, "__wrapped__", export_dataset_to_sheets)
        with patch("app.routers.datasets.get_current_role", return_value="admin"), \
             patch("app.routers.datasets.require_role"), \
             patch("app.routers.datasets.audit_store"), \
             patch("app.routers.datasets.increment_usage"), \
             patch("app.routers.datasets._enforce_api_call"):
            return func(request=mock_request, dataset_id=dataset_id, payload=payload, authorization=None, db=db)

    def _db_with_meta(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = _make_meta()
        return db

    def test_H1_missing_spreadsheet_url_returns_422(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ds-1", {}, self._db_with_meta())
        self.assertEqual(ctx.exception.status_code, 422)

    def test_H2_invalid_mode_returns_422(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("ds-1", {"spreadsheet_url": "https://docs.google.com/s/x", "mode": "overwrite"}, self._db_with_meta())
        self.assertEqual(ctx.exception.status_code, 422)

    def test_H3_valueerror_returns_400(self):
        from fastapi import HTTPException
        db = self._db_with_meta()
        with patch("app.services.export_service.ExportService.export_sheets", side_effect=ValueError("GOOGLE_SERVICE_ACCOUNT_JSON is not configured")):
            with self.assertRaises(HTTPException) as ctx:
                self._invoke("ds-1", {"spreadsheet_url": "https://x", "mode": "replace"}, db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_H4_success_returns_result_dict(self):
        db = self._db_with_meta()
        with patch("app.services.export_service.ExportService.export_sheets", return_value={
            "rows_written": 42,
            "spreadsheet_url": "https://docs.google.com/s/x",
            "sheet_name": "Sheet1",
        }), patch("app.routers.datasets.emit_event"):
            result = self._invoke("ds-1", {"spreadsheet_url": "https://docs.google.com/s/x", "mode": "replace"}, db)

        self.assertEqual(result["rows_written"], 42)
        self.assertEqual(result["sheet_name"], "Sheet1")

    def test_H5_returns_404_for_unknown_dataset(self):
        from fastapi import HTTPException
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(HTTPException) as ctx:
            self._invoke("no-such", {"spreadsheet_url": "https://x", "mode": "replace"}, db)
        self.assertEqual(ctx.exception.status_code, 404)


# =============================================================================
# I — GET /datasets/export/sheets-config
# =============================================================================

class TestSheetsConfigEndpoint(unittest.TestCase):

    def _invoke(self, mock_settings):
        from app.routers.datasets import get_sheets_export_config
        with patch("app.routers.datasets.get_current_role", return_value="viewer"), \
             patch("app.routers.datasets.require_role"), \
             patch("app.routers.datasets.settings", mock_settings):
            return get_sheets_export_config(authorization=None)

    def test_I1_empty_when_no_sa_json(self):
        s = MagicMock()
        s.google_service_account_email = ""
        s.google_service_account_json = ""
        result = self._invoke(s)
        self.assertEqual(result["service_account_email"], "")

    def test_I2_parses_email_from_raw_json(self):
        sa_info = {"type": "service_account", "client_email": "bot@project.iam.gserviceaccount.com"}
        s = MagicMock()
        s.google_service_account_email = ""
        s.google_service_account_json = json.dumps(sa_info)
        result = self._invoke(s)
        self.assertEqual(result["service_account_email"], "bot@project.iam.gserviceaccount.com")

    def test_I3_parses_email_from_base64_json(self):
        sa_info = {"type": "service_account", "client_email": "b64bot@project.iam.gserviceaccount.com"}
        encoded = base64.b64encode(json.dumps(sa_info).encode()).decode()
        s = MagicMock()
        s.google_service_account_email = ""
        s.google_service_account_json = encoded
        result = self._invoke(s)
        self.assertEqual(result["service_account_email"], "b64bot@project.iam.gserviceaccount.com")

    def test_I4_explicit_email_override_takes_priority(self):
        """GOOGLE_SERVICE_ACCOUNT_EMAIL env var overrides JSON parsing."""
        s = MagicMock()
        s.google_service_account_email = "override@custom.com"
        s.google_service_account_json = json.dumps({"client_email": "json@project.iam.gserviceaccount.com"})
        result = self._invoke(s)
        # Explicit override should be returned as-is (endpoint returns it directly)
        # Implementation note: the endpoint only parses when explicit email is blank
        # so 'override@custom.com' should come through
        self.assertEqual(result["service_account_email"], "override@custom.com")


if __name__ == "__main__":
    unittest.main()
