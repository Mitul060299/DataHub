"""Tests for the safe storage delete + retry queue introduced to prevent
orphan S3 / R2 objects when the inline delete fails.

These tests use an in-memory SQLite DB so they don't depend on Postgres
or any cloud storage.  All ``StorageService.delete`` calls are patched.
"""
from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

# Match the convention used by the other tests in this directory.
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models_db import PendingStorageDeleteDB


def _fresh_session():
    """Return a brand-new SQLite-backed Session with the queue table created.

    We purposely avoid ``Base.metadata.create_all`` because several other
    models in this codebase use Postgres-only types (``JSONB``) which the
    SQLite dialect cannot render.  Only the table under test is needed.
    """
    engine = create_engine("sqlite:///:memory:")
    PendingStorageDeleteDB.__table__.create(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session(), engine


class SafeStorageDeleteTests(unittest.TestCase):
    def test_success_does_not_enqueue(self) -> None:
        from app.services.storage_cleanup import safe_storage_delete

        session, _engine = _fresh_session()
        with patch("app.services.storage_cleanup.StorageService.delete", return_value=None) as m:
            ok = safe_storage_delete("s3://bucket/key.parquet", source="dataset", db=session)
        session.commit()

        self.assertTrue(ok)
        m.assert_called_once_with("s3://bucket/key.parquet")
        self.assertEqual(session.query(PendingStorageDeleteDB).count(), 0)

    def test_failure_enqueues_with_retry_window(self) -> None:
        from app.services.storage_cleanup import safe_storage_delete

        session, _engine = _fresh_session()
        with patch(
            "app.services.storage_cleanup.StorageService.delete",
            side_effect=RuntimeError("boto3 timeout"),
        ):
            ok = safe_storage_delete("s3://bucket/orphan.parquet", source="artifact", db=session)
        session.commit()

        self.assertFalse(ok)
        rows = session.query(PendingStorageDeleteDB).all()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row.storage_path, "s3://bucket/orphan.parquet")
        self.assertEqual(row.source, "artifact")
        self.assertEqual(row.attempts, 0)
        self.assertIn("boto3 timeout", row.last_error or "")
        # next_attempt_at should be in the future (the first backoff window).
        # SQLite drops tzinfo, so compare both as naive UTC.
        nxt = row.next_attempt_at
        if nxt.tzinfo is not None:
            nxt = nxt.replace(tzinfo=None)
        self.assertGreater(nxt, datetime.utcnow() - timedelta(seconds=5))

    def test_empty_storage_path_is_a_noop(self) -> None:
        from app.services.storage_cleanup import safe_storage_delete

        session, _engine = _fresh_session()
        with patch("app.services.storage_cleanup.StorageService.delete") as m:
            ok = safe_storage_delete("", source="dataset", db=session)
            ok_none = safe_storage_delete(None, source="dataset", db=session)
        self.assertTrue(ok)
        self.assertTrue(ok_none)
        m.assert_not_called()
        self.assertEqual(session.query(PendingStorageDeleteDB).count(), 0)

    def test_does_not_raise_when_enqueue_fails(self) -> None:
        """If even the queue insert fails, we must NOT raise -- the user-facing
        DELETE handler is in the middle of a request and a row was already
        deleted; raising here would be worse than logging."""
        from app.services.storage_cleanup import safe_storage_delete

        session, _engine = _fresh_session()
        # First make StorageService raise, THEN make the session.add raise too.
        with patch(
            "app.services.storage_cleanup.StorageService.delete",
            side_effect=RuntimeError("s3 down"),
        ), patch.object(session, "add", side_effect=RuntimeError("db dead")):
            ok = safe_storage_delete("s3://bucket/x.parquet", source="dataset", db=session)
        # safe_storage_delete swallowed both exceptions.
        self.assertFalse(ok)


class DrainPendingDeletesTests(unittest.TestCase):
    def _enqueue(self, session, *, path: str, attempts: int = 0, ready: bool = True) -> None:
        import uuid as _uuid
        when = datetime.utcnow() + (
            timedelta(minutes=-1) if ready else timedelta(hours=1)
        )
        session.add(
            PendingStorageDeleteDB(
                id=str(_uuid.uuid4()),
                storage_path=path,
                source="dataset",
                attempts=attempts,
                last_error=None,
                next_attempt_at=when,
            )
        )
        session.commit()

    def test_successful_drain_removes_rows(self) -> None:
        from app.services.storage_cleanup import drain_pending_storage_deletes

        session, _engine = _fresh_session()
        self._enqueue(session, path="s3://b/a.parquet")
        self._enqueue(session, path="s3://b/b.parquet")

        with patch("app.services.storage_cleanup.StorageService.delete", return_value=None):
            stats = drain_pending_storage_deletes(db=session)
        session.commit()

        self.assertEqual(stats["attempted"], 2)
        self.assertEqual(stats["succeeded"], 2)
        self.assertEqual(stats["failed"], 0)
        self.assertEqual(session.query(PendingStorageDeleteDB).count(), 0)

    def test_failure_increments_attempts_and_pushes_next_attempt(self) -> None:
        from app.services.storage_cleanup import drain_pending_storage_deletes

        session, _engine = _fresh_session()
        self._enqueue(session, path="s3://b/flaky.parquet", attempts=0)
        before = datetime.utcnow()

        with patch(
            "app.services.storage_cleanup.StorageService.delete",
            side_effect=RuntimeError("still down"),
        ):
            stats = drain_pending_storage_deletes(db=session)
        session.commit()

        self.assertEqual(stats["attempted"], 1)
        self.assertEqual(stats["failed"], 1)
        rows = session.query(PendingStorageDeleteDB).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].attempts, 1)
        # next_attempt_at must have advanced beyond the call instant.
        # SQLite drops tzinfo on DateTime columns, so normalise to naive UTC.
        nxt = rows[0].next_attempt_at
        if nxt.tzinfo is not None:
            nxt = nxt.replace(tzinfo=None)
        self.assertGreater(nxt, before)
        self.assertIn("still down", rows[0].last_error or "")

    def test_abandons_after_max_attempts(self) -> None:
        from app.services.storage_cleanup import drain_pending_storage_deletes, MAX_ATTEMPTS

        session, _engine = _fresh_session()
        # One short of the cap -- one more failure should abandon the row.
        self._enqueue(session, path="s3://b/dead.parquet", attempts=MAX_ATTEMPTS - 1)

        with patch(
            "app.services.storage_cleanup.StorageService.delete",
            side_effect=RuntimeError("permanent"),
        ):
            stats = drain_pending_storage_deletes(db=session)
        session.commit()

        self.assertEqual(stats["abandoned"], 1)
        self.assertEqual(session.query(PendingStorageDeleteDB).count(), 0)

    def test_skips_rows_not_yet_ready(self) -> None:
        from app.services.storage_cleanup import drain_pending_storage_deletes

        session, _engine = _fresh_session()
        self._enqueue(session, path="s3://b/later.parquet", ready=False)

        with patch("app.services.storage_cleanup.StorageService.delete") as m:
            stats = drain_pending_storage_deletes(db=session)

        self.assertEqual(stats["attempted"], 0)
        m.assert_not_called()
        # Row is still queued for the future.
        self.assertEqual(session.query(PendingStorageDeleteDB).count(), 1)


if __name__ == "__main__":
    unittest.main()
