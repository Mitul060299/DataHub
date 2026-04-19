"""Tests for soft-delete (Trash) and retention sweep.

The dataset_meta table uses ``JSONB`` columns that SQLite cannot render, so we
exercise the new logic primarily through mocked sessions and lightweight fakes
for ``DatasetMetaDB`` instead of building the full ORM table in memory.
"""
from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import mock

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")


class _Query:
    """Minimal fluent stand-in for ``session.query(Model)`` used in unit tests."""

    def __init__(self, rows: list, *, deleted_returns: int = 0):
        self._rows = list(rows)
        self._deleted_returns = deleted_returns
        self.filter_calls: list = []
        self.delete_calls = 0

    def filter(self, *args, **kwargs):
        self.filter_calls.append((args, kwargs))
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, _n):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None

    def delete(self, *args, **kwargs):
        self.delete_calls += 1
        return self._deleted_returns


class _FakeSession:
    """Mock session that records calls without touching a DB."""

    def __init__(self, query_map: dict):
        self._query_map = query_map  # model -> _Query
        self.commits = 0
        self.rollbacks = 0
        self.flushes = 0
        self.added: list = []

    def query(self, model):
        return self._query_map.get(model, _Query([]))

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def flush(self):
        self.flushes += 1

    def close(self):
        pass


class RetentionDaysTests(unittest.TestCase):
    def test_default_is_thirty(self) -> None:
        from app.services.trash_retention import _retention_days
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("TRASH_RETENTION_DAYS", None)
            self.assertEqual(_retention_days(), 30)

    def test_env_override(self) -> None:
        from app.services.trash_retention import _retention_days
        with mock.patch.dict(os.environ, {"TRASH_RETENTION_DAYS": "7"}):
            self.assertEqual(_retention_days(), 7)

    def test_invalid_env_falls_back_to_default(self) -> None:
        from app.services.trash_retention import _retention_days
        with mock.patch.dict(os.environ, {"TRASH_RETENTION_DAYS": "not-a-number"}):
            self.assertEqual(_retention_days(), 30)

    def test_minimum_is_one_day(self) -> None:
        from app.services.trash_retention import _retention_days
        with mock.patch.dict(os.environ, {"TRASH_RETENTION_DAYS": "0"}):
            self.assertEqual(_retention_days(), 1)


class PurgeExpiredTrashTests(unittest.TestCase):
    def test_no_expired_rows_is_a_noop(self) -> None:
        from app.services import trash_retention
        from app.models_db import DatasetMetaDB

        session = _FakeSession({DatasetMetaDB: _Query([])})
        with mock.patch.object(trash_retention, "_purge_one") as purge:
            stats = trash_retention.purge_expired_trash(db=session, retention_days=30)
        self.assertEqual(stats, {"scanned": 0, "purged": 0, "errors": 0})
        purge.assert_not_called()

    def test_purges_each_expired_row(self) -> None:
        from app.services import trash_retention
        from app.models_db import DatasetMetaDB

        old = datetime.now(timezone.utc) - timedelta(days=45)
        rows = [
            SimpleNamespace(id="d1", deleted_at=old, storage_path=None, parent_id=None, user_id="u", workspace_id="w", name="d1"),
            SimpleNamespace(id="d2", deleted_at=old, storage_path=None, parent_id=None, user_id="u", workspace_id="w", name="d2"),
        ]
        session = _FakeSession({DatasetMetaDB: _Query(rows)})
        with mock.patch.object(trash_retention, "_purge_one") as purge:
            stats = trash_retention.purge_expired_trash(db=session, retention_days=30)
        self.assertEqual(stats["scanned"], 2)
        self.assertEqual(stats["purged"], 2)
        self.assertEqual(stats["errors"], 0)
        self.assertEqual(purge.call_count, 2)

    def test_per_row_exception_is_recorded_and_does_not_abort_sweep(self) -> None:
        from app.services import trash_retention
        from app.models_db import DatasetMetaDB

        old = datetime.now(timezone.utc) - timedelta(days=45)
        rows = [
            SimpleNamespace(id="ok-1", deleted_at=old, storage_path=None, parent_id=None, user_id=None, workspace_id=None, name=None),
            SimpleNamespace(id="bad", deleted_at=old, storage_path=None, parent_id=None, user_id=None, workspace_id=None, name=None),
            SimpleNamespace(id="ok-2", deleted_at=old, storage_path=None, parent_id=None, user_id=None, workspace_id=None, name=None),
        ]
        session = _FakeSession({DatasetMetaDB: _Query(rows)})

        def _maybe_raise(_session, meta, *, retention_days):
            if meta.id == "bad":
                raise RuntimeError("boom")

        with mock.patch.object(trash_retention, "_purge_one", side_effect=_maybe_raise):
            stats = trash_retention.purge_expired_trash(db=session, retention_days=30)
        self.assertEqual(stats["scanned"], 3)
        self.assertEqual(stats["purged"], 2)
        self.assertEqual(stats["errors"], 1)


class PurgeOneTests(unittest.TestCase):
    def test_purge_one_emits_dataset_purged_event(self) -> None:
        from app.services import trash_retention
        from app.models_db import (
            ArtifactDB,
            DatasetChunkDB,
            DatasetDataDB,
            DatasetMetaDB,
        )

        meta = SimpleNamespace(
            id="ds-1",
            user_id="u-1",
            workspace_id="w-1",
            name="My Trashed DS",
            storage_path="s3://bucket/ds-1.parquet",
            parent_id=None,
        )
        # No children for this row.
        children_q = _Query([])
        # Distinct delete-counting queries per model.
        queries = {
            ArtifactDB: _Query([]),
            DatasetMetaDB: children_q,
            DatasetDataDB: _Query([]),
            DatasetChunkDB: _Query([]),
        }
        session = _FakeSession(queries)

        captured = {}

        def _capture_emit(_db, *, event_type, user_id=None, workspace_id=None, payload=None, **kw):
            captured["event_type"] = event_type
            captured["user_id"] = user_id
            captured["workspace_id"] = workspace_id
            captured["payload"] = payload
            return None

        with mock.patch.object(trash_retention, "emit_event", side_effect=_capture_emit), \
             mock.patch.object(trash_retention, "safe_storage_delete", return_value=True) as ssd:
            trash_retention._purge_one(session, meta, retention_days=30)

        ssd.assert_called_once_with("s3://bucket/ds-1.parquet", source="dataset", db=session)
        self.assertEqual(captured["event_type"], "dataset_purged")
        self.assertEqual(captured["user_id"], "u-1")
        self.assertEqual(captured["workspace_id"], "w-1")
        self.assertEqual(captured["payload"]["dataset_id"], "ds-1")
        self.assertEqual(captured["payload"]["reason"], "trash_retention_expired")
        self.assertEqual(captured["payload"]["retention_days"], 30)


class SoftDeleteRouterTests(unittest.TestCase):
    """Direct calls to router functions with a mocked session.

    We bypass FastAPI/TestClient because app start-up requires Postgres.
    """

    def _make_meta(self, *, dataset_id="d-1", deleted_at=None, parent_id=None):
        return SimpleNamespace(
            id=dataset_id,
            user_id="u-1",
            workspace_id="w-1",
            name="DS",
            storage_path=None,
            deleted_at=deleted_at,
            parent_id=parent_id,
        )

    def test_soft_delete_marks_deleted_at_and_does_not_remove_row(self) -> None:
        from app.routers import datasets as datasets_router
        from app.models_db import DatasetMetaDB

        meta = self._make_meta()
        # First call returns meta; later .filter().all() for children returns []
        target_q = _Query([meta])
        children_q = _Query([])
        # Single shared Query object: order matters — first get_meta, then children.
        # Use a small dispatcher.
        call_order = {"n": 0}
        responses = [target_q, children_q]

        class _Sess(_FakeSession):
            def query(self, model):
                idx = call_order["n"]
                call_order["n"] += 1
                if idx < len(responses):
                    return responses[idx]
                return _Query([])

        session = _Sess({})

        with mock.patch.object(datasets_router, "get_current_role", return_value="editor"), \
             mock.patch.object(datasets_router, "require_role"), \
             mock.patch.object(datasets_router, "get_current_user_id", return_value="u-1"), \
             mock.patch.object(datasets_router, "invalidate_profile_cache"), \
             mock.patch.object(datasets_router, "emit_event"), \
             mock.patch.object(datasets_router.audit_store, "add"):
            result = datasets_router.delete_dataset(
                dataset_id="d-1", hard=False, authorization=None, db=session
            )

        self.assertEqual(result["status"], "trashed")
        self.assertIsNotNone(meta.deleted_at)
        # Hard-delete path NEVER runs in the soft branch — no .delete() calls
        # on the target query.
        self.assertEqual(target_q.delete_calls, 0)
        self.assertEqual(children_q.delete_calls, 0)
        self.assertEqual(session.commits, 1)

    def test_soft_delete_already_trashed_is_idempotent(self) -> None:
        from app.routers import datasets as datasets_router

        meta = self._make_meta(deleted_at=datetime.now(timezone.utc))
        target_q = _Query([meta])
        session = _FakeSession({})
        session.query = lambda model: target_q  # type: ignore[assignment]

        with mock.patch.object(datasets_router, "get_current_role", return_value="editor"), \
             mock.patch.object(datasets_router, "require_role"), \
             mock.patch.object(datasets_router, "get_current_user_id", return_value="u-1"):
            result = datasets_router.delete_dataset(
                dataset_id="d-1", hard=False, authorization=None, db=session
            )
        self.assertEqual(result["status"], "already_trashed")
        self.assertEqual(session.commits, 0)

    def test_restore_clears_deleted_at(self) -> None:
        from app.routers import datasets as datasets_router

        meta = self._make_meta(deleted_at=datetime.now(timezone.utc))
        target_q = _Query([meta])
        session = _FakeSession({})
        session.query = lambda model: target_q  # type: ignore[assignment]

        with mock.patch.object(datasets_router, "get_current_role", return_value="editor"), \
             mock.patch.object(datasets_router, "require_role"), \
             mock.patch.object(datasets_router, "get_current_user_id", return_value="u-1"), \
             mock.patch.object(datasets_router, "invalidate_profile_cache"), \
             mock.patch.object(datasets_router, "emit_event"), \
             mock.patch.object(datasets_router.audit_store, "add"):
            result = datasets_router.restore_dataset(
                dataset_id="d-1", authorization=None, db=session
            )

        self.assertEqual(result["status"], "restored")
        self.assertIsNone(meta.deleted_at)
        self.assertEqual(session.commits, 1)

    def test_restore_on_active_dataset_is_noop(self) -> None:
        from app.routers import datasets as datasets_router

        meta = self._make_meta(deleted_at=None)
        target_q = _Query([meta])
        session = _FakeSession({})
        session.query = lambda model: target_q  # type: ignore[assignment]

        with mock.patch.object(datasets_router, "get_current_role", return_value="editor"), \
             mock.patch.object(datasets_router, "require_role"), \
             mock.patch.object(datasets_router, "get_current_user_id", return_value="u-1"):
            result = datasets_router.restore_dataset(
                dataset_id="d-1", authorization=None, db=session
            )
        self.assertEqual(result["status"], "not_trashed")
        self.assertEqual(session.commits, 0)


if __name__ == "__main__":
    unittest.main()
