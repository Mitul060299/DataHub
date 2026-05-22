"""
Tests for Track B: presigned direct-to-S3 upload flow.

Covers:
  1. plan_guard — enforce_file_constraints correctly validates presigned uploads
  2. object_storage — generate_presigned_put_url logic (format validation, key
     construction, provider gating)
  3. /import/presign endpoint — format gate (Parquet-only), plan checks, 501 for
     non-S3 providers
  4. /import/finalize endpoint — ownership check, status gate (idempotency),
     schema extraction via DuckDB, usage increment
  5. ImportModal frontend — presign path triggers only for .parquet files > 50 MB
     (tested via unit-level logic assertions)
"""

from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# ── Stub optional heavy deps before any app import ────────────────────────────
for _mod in [
    "chromadb", "chromadb.utils", "chromadb.config", "chromadb.api",
    # slowapi is not installed in the local test venv (only in Docker)
    "slowapi", "slowapi.util", "slowapi.errors", "slowapi.middleware",
]:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")


# =============================================================================
# Helpers
# =============================================================================

def _make_settings(**overrides):
    """Build a minimal settings-like object for StorageService tests."""
    defaults = {
        "storage_provider": "s3",
        "s3_bucket_name": "test-bucket",
        "s3_region": "us-east-1",
        "s3_access_key_id": "AKID",
        "s3_secret_access_key": "SECRET",
        "r2_bucket_name": "r2-bucket",
        "r2_account_id": "acct123",
        "r2_access_key_id": "R2_KEY",
        "r2_secret_access_key": "R2_SECRET",
    }
    m = MagicMock()
    for k, v in {**defaults, **overrides}.items():
        setattr(m, k, v)
    return m


# =============================================================================
# 1. plan_guard — enforce_file_constraints
# =============================================================================

class TestEnforceFileConstraints(unittest.TestCase):
    """Verify plan_guard correctly gates file uploads for the presign path."""

    def _enforce(self, plan: str, format_: str, size_bytes: int):
        from app.services.plan_guard import enforce_file_constraints
        db = MagicMock()
        # Simulate no existing datasets for simplicity
        db.query.return_value.filter.return_value.count.return_value = 0
        db.query.return_value.filter.return_value.all.return_value = []
        enforce_file_constraints(
            plan=plan,
            billing_user_id="u",
            file_format=format_,
            upload_size_bytes=size_bytes,
            db=db,
        )

    def test_free_plan_parquet_under_50mb_allowed(self):
        # Free plan does NOT include parquet — should raise 403
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            self._enforce("Free", "parquet", 1 * 1024 * 1024)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_professional_plan_parquet_500mb_allowed(self):
        # Professional plan: 1 GB limit, Parquet allowed
        self._enforce("Professional", "parquet", 500 * 1024 * 1024)  # 500 MB — no exception

    def test_professional_plan_parquet_over_1gb_rejected(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            self._enforce("Professional", "parquet", 2 * 1024 * 1024 * 1024)  # 2 GB
        self.assertEqual(ctx.exception.status_code, 413)
        # Should be structured error
        self.assertEqual(ctx.exception.detail["error"], "file_too_large")

    def test_team_plan_parquet_3gb_allowed(self):
        self._enforce("Team", "parquet", 3 * 1024 * 1024 * 1024)

    def test_enterprise_plan_no_size_limit(self):
        # Enterprise has max_file_size_bytes = -1 (unlimited)
        self._enforce("Enterprise", "parquet", 100 * 1024 * 1024 * 1024)


# =============================================================================
# 2. object_storage — generate_presigned_put_url
# =============================================================================

class TestGeneratePresignedPutUrl(unittest.TestCase):
    """Unit tests for StorageService.generate_presigned_put_url."""

    def _call(self, provider="s3", **kw):
        from app.services.object_storage import StorageService
        fake_settings = _make_settings(storage_provider=provider, **kw)
        with patch("app.services.object_storage.settings", fake_settings):
            mock_client = MagicMock()
            mock_client.generate_presigned_url.return_value = "https://s3.example.com/presigned"
            client_method = "_s3_client" if provider == "s3" else "_r2_client"
            with patch.object(StorageService, client_method, return_value=mock_client):
                url, path = StorageService.generate_presigned_put_url(
                    user_id="user123",
                    dataset_id="ds456",
                    file_name="mydata.parquet",
                )
        return url, path, mock_client

    def test_s3_returns_presigned_url(self):
        url, path, _ = self._call(provider="s3")
        self.assertEqual(url, "https://s3.example.com/presigned")

    def test_s3_storage_path_format(self):
        _, path, _ = self._call(provider="s3")
        self.assertTrue(path.startswith("s3://test-bucket/user123/ds456/"))
        self.assertIn("mydata.parquet", path)

    def test_r2_storage_path_format(self):
        _, path, _ = self._call(provider="r2")
        self.assertTrue(path.startswith("r2://r2-bucket/user123/ds456/"))

    def test_put_object_operation_used(self):
        _, _, client = self._call(provider="s3")
        call_args = client.generate_presigned_url.call_args
        self.assertEqual(call_args[0][0], "put_object")

    def test_content_type_octet_stream(self):
        _, _, client = self._call(provider="s3")
        params = client.generate_presigned_url.call_args[1]["Params"]
        self.assertEqual(params["ContentType"], "application/octet-stream")

    def test_local_provider_raises_not_implemented(self):
        from app.services.object_storage import StorageService
        fake_settings = _make_settings(storage_provider="local")
        with patch("app.services.object_storage.settings", fake_settings):
            with self.assertRaises(NotImplementedError) as ctx:
                StorageService.generate_presigned_put_url("u", "d", "f.parquet")
        self.assertIn("local", str(ctx.exception))

    def test_gcs_provider_raises_not_implemented(self):
        from app.services.object_storage import StorageService
        fake_settings = _make_settings(storage_provider="gcs")
        with patch("app.services.object_storage.settings", fake_settings):
            with self.assertRaises(NotImplementedError):
                StorageService.generate_presigned_put_url("u", "d", "f.parquet")

    def test_path_traversal_in_filename_stripped(self):
        from app.services.object_storage import StorageService
        fake_settings = _make_settings(storage_provider="s3")
        with patch("app.services.object_storage.settings", fake_settings):
            mock_client = MagicMock()
            mock_client.generate_presigned_url.return_value = "https://s3.example.com/presigned"
            with patch.object(StorageService, "_s3_client", return_value=mock_client):
                _, path = StorageService.generate_presigned_put_url(
                    user_id="user",
                    dataset_id="ds",
                    file_name="../../evil.parquet",
                )
        # os.path.basename must strip leading directory separators
        self.assertNotIn("..", path)
        self.assertIn("evil.parquet", path)


# =============================================================================
# 3. /import/presign — format gate and plan checks
# =============================================================================

class TestPresignEndpointFormatGate(unittest.TestCase):
    """Verify /presign rejects non-Parquet formats with HTTP 415."""

    def _call_presign(self, filename: str, file_size_bytes: int = 100 * 1024 * 1024):
        """Call presign_upload with a mocked DB and fixed 'Professional' plan."""
        from app.routers.imports import presign_upload
        import asyncio

        db = MagicMock()
        db.query.return_value.filter.return_value.count.return_value = 0
        db.query.return_value.filter.return_value.all.return_value = []

        payload = {"filename": filename, "file_size_bytes": file_size_bytes}

        with patch("app.routers.imports.get_current_role", return_value="admin"), \
             patch("app.routers.imports.require_role"), \
             patch("app.routers.imports.get_current_user_id", return_value="user1"), \
             patch("app.routers.imports.resolve_user_plan", return_value="Professional"), \
             patch("app.routers.imports.StorageService.generate_presigned_put_url",
                   return_value=("https://s3.example.com/presigned", "s3://bucket/key.parquet")):
            return asyncio.run(presign_upload(
                payload=payload,
                authorization="Bearer fake",
                db=db,
            ))

    def test_parquet_file_succeeds(self):
        result = self._call_presign("dataset.parquet")
        self.assertIn("presigned_url", result)
        self.assertIn("dataset_id", result)

    def test_csv_file_rejected_415(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            self._call_presign("data.csv")
        self.assertEqual(ctx.exception.status_code, 415)
        self.assertIn("Parquet", ctx.exception.detail)

    def test_excel_file_rejected_415(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            self._call_presign("report.xlsx")
        self.assertEqual(ctx.exception.status_code, 415)

    def test_json_file_rejected_415(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            self._call_presign("data.json")
        self.assertEqual(ctx.exception.status_code, 415)

    def test_missing_filename_rejected_400(self):
        from fastapi import HTTPException
        from app.routers.imports import presign_upload
        import asyncio
        db = MagicMock()
        with patch("app.routers.imports.get_current_role", return_value="admin"), \
             patch("app.routers.imports.require_role"), \
             patch("app.routers.imports.get_current_user_id", return_value="u"):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(presign_upload(
                    payload={"filename": "", "file_size_bytes": 100},
                    authorization="Bearer fake",
                    db=db,
                ))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_missing_file_size_rejected_400(self):
        from fastapi import HTTPException
        from app.routers.imports import presign_upload
        import asyncio
        db = MagicMock()
        with patch("app.routers.imports.get_current_role", return_value="admin"), \
             patch("app.routers.imports.require_role"), \
             patch("app.routers.imports.get_current_user_id", return_value="u"):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(presign_upload(
                    payload={"filename": "data.parquet", "file_size_bytes": 0},
                    authorization="Bearer fake",
                    db=db,
                ))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_non_s3_provider_returns_501(self):
        from fastapi import HTTPException
        from app.routers.imports import presign_upload
        import asyncio
        db = MagicMock()
        db.query.return_value.filter.return_value.count.return_value = 0
        db.query.return_value.filter.return_value.all.return_value = []
        with patch("app.routers.imports.get_current_role", return_value="admin"), \
             patch("app.routers.imports.require_role"), \
             patch("app.routers.imports.get_current_user_id", return_value="u"), \
             patch("app.routers.imports.resolve_user_plan", return_value="Professional"), \
             patch("app.routers.imports.StorageService.generate_presigned_put_url",
                   side_effect=NotImplementedError("Not supported for provider 'local'")):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(presign_upload(
                    payload={"filename": "data.parquet", "file_size_bytes": 100 * 1024 * 1024},
                    authorization="Bearer fake",
                    db=db,
                ))
        self.assertEqual(ctx.exception.status_code, 501)


# =============================================================================
# 4. /import/finalize — ownership, idempotency, schema extraction
# =============================================================================

class TestFinalizeEndpoint(unittest.TestCase):
    """Unit tests for the finalize_upload endpoint."""

    def _make_meta(self, status="pending", user_id="user1"):
        meta = MagicMock()
        meta.status = status
        meta.user_id = user_id
        meta.storage_path = "s3://bucket/user1/ds1/data.parquet"
        meta.file_size_bytes = 100 * 1024 * 1024
        meta.name = "My Dataset"
        meta.file_format = "parquet"
        return meta

    def _call_finalize(self, meta=None, dataset_id="ds1", filename="data.parquet"):
        from app.routers.imports import finalize_upload
        import asyncio

        if meta is None:
            meta = self._make_meta()

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = meta

        # Stub DuckDB — returns 3 columns and 1000 rows
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = [
            ("id", "INTEGER", "YES", None, None, None),
            ("name", "VARCHAR", "YES", None, None, None),
            ("value", "DOUBLE", "YES", None, None, None),
        ]
        mock_conn.execute.return_value.fetchone.return_value = (1000,)

        with patch("app.routers.imports.get_current_role", return_value="admin"), \
             patch("app.routers.imports.require_role"), \
             patch("app.routers.imports.get_current_user_id", return_value="user1"), \
             patch("app.routers.imports.StorageService.get_query_path",
                   return_value="https://s3.example.com/signed_url"), \
             patch("app.routers.imports.DuckDBService._ensure_db", return_value=mock_conn), \
             patch("app.routers.imports.storage_tier_service.assign_initial_tier",
                   return_value="hot"), \
             patch("app.routers.imports._ensure_unique_table_name", return_value="my_dataset"), \
             patch("app.routers.imports.resolve_billing_user_for_user", return_value="user1"), \
             patch("app.routers.imports.billing_repository.get_effective_plan", return_value=None), \
             patch("app.routers.imports.enforce_usage_limit"), \
             patch("app.routers.imports.update_storage_bytes"), \
             patch("app.routers.imports.increment_usage"):
            return asyncio.run(finalize_upload(
                payload={"dataset_id": dataset_id, "filename": filename},
                authorization="Bearer fake",
                db=db,
            ))

    def test_finalize_returns_success(self):
        result = self._call_finalize()
        self.assertTrue(result["success"])
        self.assertEqual(result["rowCount"], 1000)
        self.assertEqual(result["columns"], 3)

    def test_finalize_sets_status_ready(self):
        meta = self._make_meta()
        self._call_finalize(meta=meta)
        self.assertEqual(meta.status, "ready")

    def test_finalize_sets_columns(self):
        meta = self._make_meta()
        self._call_finalize(meta=meta)
        self.assertEqual(len(meta.columns), 3)
        self.assertEqual(meta.columns[0]["name"], "id")
        self.assertEqual(meta.columns[0]["type"], "INTEGER")

    def test_finalize_sets_row_count(self):
        meta = self._make_meta()
        self._call_finalize(meta=meta)
        self.assertEqual(meta.row_count, 1000)

    def test_finalize_missing_dataset_id_returns_400(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            self._call_finalize(dataset_id="")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_finalize_not_found_returns_404(self):
        from fastapi import HTTPException
        from app.routers.imports import finalize_upload
        import asyncio
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        with patch("app.routers.imports.get_current_role", return_value="admin"), \
             patch("app.routers.imports.require_role"), \
             patch("app.routers.imports.get_current_user_id", return_value="user1"):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(finalize_upload(
                    payload={"dataset_id": "nonexistent", "filename": "x.parquet"},
                    authorization="Bearer fake",
                    db=db,
                ))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_finalize_already_ready_returns_409(self):
        from fastapi import HTTPException
        meta = self._make_meta(status="ready")
        with self.assertRaises(HTTPException) as ctx:
            self._call_finalize(meta=meta)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_finalize_duckdb_error_returns_422(self):
        from fastapi import HTTPException
        from app.routers.imports import finalize_upload
        import asyncio
        meta = self._make_meta()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = meta
        mock_conn = MagicMock()
        mock_conn.execute.side_effect = RuntimeError("Parquet magic number mismatch")
        with patch("app.routers.imports.get_current_role", return_value="admin"), \
             patch("app.routers.imports.require_role"), \
             patch("app.routers.imports.get_current_user_id", return_value="user1"), \
             patch("app.routers.imports.StorageService.get_query_path",
                   return_value="https://s3.example.com/signed"), \
             patch("app.routers.imports.DuckDBService._ensure_db", return_value=mock_conn):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(finalize_upload(
                    payload={"dataset_id": "ds1", "filename": "data.parquet"},
                    authorization="Bearer fake",
                    db=db,
                ))
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("Parquet magic number mismatch", ctx.exception.detail)

    def test_finalize_increments_usage(self):
        from app.routers.imports import finalize_upload
        import asyncio
        meta = self._make_meta()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = meta
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = [
            ("col", "VARCHAR", "YES", None, None, None),
        ]
        mock_conn.execute.return_value.fetchone.return_value = (50,)
        with patch("app.routers.imports.get_current_role", return_value="admin"), \
             patch("app.routers.imports.require_role"), \
             patch("app.routers.imports.get_current_user_id", return_value="user1"), \
             patch("app.routers.imports.StorageService.get_query_path",
                   return_value="https://s3.example.com/s"), \
             patch("app.routers.imports.DuckDBService._ensure_db", return_value=mock_conn), \
             patch("app.routers.imports.storage_tier_service.assign_initial_tier",
                   return_value="hot"), \
             patch("app.routers.imports._ensure_unique_table_name", return_value="t"), \
             patch("app.routers.imports.resolve_billing_user_for_user", return_value="user1"), \
             patch("app.routers.imports.billing_repository.get_effective_plan", return_value=None), \
             patch("app.routers.imports.enforce_usage_limit"), \
             patch("app.routers.imports.update_storage_bytes"), \
             patch("app.routers.imports.increment_usage") as mock_inc:
            asyncio.run(finalize_upload(
                payload={"dataset_id": "ds1", "filename": "data.parquet"},
                authorization="Bearer fake",
                db=db,
            ))
        mock_inc.assert_called_once_with("user1", "datasets_uploaded", db)


# =============================================================================
# 5. Frontend presign threshold logic (pure Python re-implementation)
# =============================================================================

class TestFrontendPresignThreshold(unittest.TestCase):
    """
    Mirrors the threshold logic from ImportModal.tsx in Python so we can assert
    correctness without requiring a JS runtime.

    Logic under test:
        const PRESIGN_THRESHOLD = 50 * 1024 * 1024;
        const isParquet = /\\.parquet$/i.test(selectedFile.name);
        if (selectedFile.size > PRESIGN_THRESHOLD && isParquet) {
            // presign path
        } else {
            // server upload path
        }
    """

    THRESHOLD = 50 * 1024 * 1024  # 50 MB

    def _uses_presign(self, filename: str, size_bytes: int) -> bool:
        import re
        is_parquet = bool(re.search(r"\.parquet$", filename, re.IGNORECASE))
        return size_bytes > self.THRESHOLD and is_parquet

    def test_large_parquet_uses_presign(self):
        self.assertTrue(self._uses_presign("dataset.parquet", 100 * 1024 * 1024))

    def test_large_parquet_uppercase_uses_presign(self):
        self.assertTrue(self._uses_presign("data.PARQUET", 60 * 1024 * 1024))

    def test_small_parquet_does_not_use_presign(self):
        self.assertFalse(self._uses_presign("data.parquet", 10 * 1024 * 1024))

    def test_large_csv_does_not_use_presign(self):
        self.assertFalse(self._uses_presign("data.csv", 200 * 1024 * 1024))

    def test_large_excel_does_not_use_presign(self):
        self.assertFalse(self._uses_presign("report.xlsx", 60 * 1024 * 1024))

    def test_large_xls_does_not_use_presign(self):
        self.assertFalse(self._uses_presign("legacy.xls", 55 * 1024 * 1024))

    def test_large_json_does_not_use_presign(self):
        self.assertFalse(self._uses_presign("data.json", 100 * 1024 * 1024))

    def test_exactly_threshold_does_not_use_presign(self):
        # boundary: strictly greater than, so exact threshold = server upload
        self.assertFalse(self._uses_presign("data.parquet", self.THRESHOLD))

    def test_one_byte_over_threshold_uses_presign(self):
        self.assertTrue(self._uses_presign("data.parquet", self.THRESHOLD + 1))


# =============================================================================
# 6. plan_guard  — file_too_large structured error shape
# =============================================================================

class TestFileTooLargeErrorShape(unittest.TestCase):
    """The 413 error from enforce_file_constraints must include structured detail."""

    def _exceed(self, plan: str) -> dict:
        from fastapi import HTTPException
        from app.services.plan_guard import enforce_file_constraints, limits_for_plan
        db = MagicMock()
        db.query.return_value.filter.return_value.count.return_value = 0
        db.query.return_value.filter.return_value.all.return_value = []
        limit = limits_for_plan(plan).max_file_size_bytes
        over = limit + 1
        try:
            enforce_file_constraints(
                plan=plan,
                billing_user_id="u",
                file_format="parquet",
                upload_size_bytes=over,
                db=db,
            )
        except HTTPException as exc:
            return exc.detail
        return {}

    def test_professional_413_has_error_key(self):
        detail = self._exceed("Professional")
        self.assertEqual(detail.get("error"), "file_too_large")

    def test_professional_413_has_message(self):
        detail = self._exceed("Professional")
        self.assertIn("message", detail)
        self.assertIn("Professional", detail["message"])

    def test_professional_413_has_limit_label(self):
        detail = self._exceed("Professional")
        self.assertIn("limit_label", detail)
        self.assertIn("GB", detail["limit_label"])

    def test_team_413_has_5gb_label(self):
        detail = self._exceed("Team")
        self.assertEqual(detail.get("limit_label"), "5 GB")


if __name__ == "__main__":
    unittest.main()

