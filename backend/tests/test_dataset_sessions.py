"""Tests for ``DatasetSessionDB`` HTTP endpoints (chat session binding only).

After alembic 0059 the table holds only ``chat_session_id`` -- the
``live_*`` preview columns were dropped because they were the source of
every "ghost artifact on refresh" bug we shipped.  The frontend now
derives the live preview pointer from the latest ``pipeline_steps`` row.
"""
from __future__ import annotations

import os
import unittest
from unittest import mock

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models_db import DatasetSessionDB


def _fresh_session():
    engine = create_engine("sqlite:///:memory:")
    DatasetSessionDB.__table__.create(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session(), engine


class _Patches:
    """Context manager that patches the auth shims in the datasets router."""

    def __init__(self, user_id: str = "u-1", role: str = "editor"):
        self.user_id = user_id
        self.role = role
        self._exits: list = []

    def __enter__(self):
        from app.routers import datasets as datasets_router
        for target, value in (
            ("get_current_role", lambda *_a, **_k: self.role),
            ("require_role", lambda *_a, **_k: None),
            ("get_current_user_id", lambda *_a, **_k: self.user_id),
        ):
            patcher = mock.patch.object(datasets_router, target, side_effect=value)
            patcher.start()
            self._exits.append(patcher.stop)
        return self

    def __exit__(self, *_exc):
        for stop in reversed(self._exits):
            stop()


class GetSessionTests(unittest.TestCase):
    def test_returns_empty_payload_when_no_row_exists(self) -> None:
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        with _Patches(user_id="u-1", role="viewer"):
            result = datasets_router.get_dataset_session(
                dataset_id="ds-1", authorization=None, db=session
            )
        self.assertEqual(result["dataset_id"], "ds-1")
        self.assertIsNone(result["chat_session_id"])
        self.assertIsNone(result["updated_at"])

    def test_returns_persisted_row_for_owner_only(self) -> None:
        import uuid as _uuid
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        session.add(DatasetSessionDB(
            id=str(_uuid.uuid4()),
            user_id="u-1", dataset_id="ds-1",
            chat_session_id="chat-mine",
        ))
        session.add(DatasetSessionDB(
            id=str(_uuid.uuid4()),
            user_id="u-other", dataset_id="ds-1",
            chat_session_id="chat-other",
        ))
        session.commit()

        with _Patches(user_id="u-1", role="viewer"):
            result = datasets_router.get_dataset_session(
                dataset_id="ds-1", authorization=None, db=session
            )
        self.assertEqual(result["chat_session_id"], "chat-mine")


class UpsertSessionTests(unittest.TestCase):
    def test_creates_a_new_row_on_first_call(self) -> None:
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        with _Patches(user_id="u-1"):
            result = datasets_router.upsert_dataset_session(
                dataset_id="ds-1",
                payload={"chat_session_id": "chat-1"},
                authorization=None,
                db=session,
            )
        self.assertTrue(result["created"])
        self.assertEqual(result["chat_session_id"], "chat-1")
        rows = session.query(DatasetSessionDB).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].user_id, "u-1")
        self.assertEqual(rows[0].dataset_id, "ds-1")

    def test_legacy_live_fields_are_silently_ignored(self) -> None:
        """Older frontend builds still send live_* keys.  The endpoint
        accepts the request without error and simply does not persist
        them -- this is the deprecation shim."""
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        with _Patches(user_id="u-1"):
            result = datasets_router.upsert_dataset_session(
                dataset_id="ds-1",
                payload={
                    "chat_session_id": "chat-1",
                    "live_table_name": "ignored",
                    "live_row_count": 999,
                    "live_step_label": "ignored",
                    "live_rows_changed": 7,
                },
                authorization=None,
                db=session,
            )
        self.assertEqual(result["chat_session_id"], "chat-1")
        self.assertNotIn("live_table_name", result)

    def test_explicit_null_clears_chat_session_id(self) -> None:
        import uuid as _uuid
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        session.add(DatasetSessionDB(
            id=str(_uuid.uuid4()),
            user_id="u-1", dataset_id="ds-1",
            chat_session_id="chat-1",
        ))
        session.commit()
        with _Patches(user_id="u-1"):
            result = datasets_router.upsert_dataset_session(
                dataset_id="ds-1",
                payload={"chat_session_id": None},
                authorization=None,
                db=session,
            )
        self.assertIsNone(result["chat_session_id"])

    def test_non_dict_payload_raises_422(self) -> None:
        from fastapi import HTTPException
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        with _Patches(user_id="u-1"):
            with self.assertRaises(HTTPException) as ctx:
                datasets_router.upsert_dataset_session(
                    dataset_id="ds-1",
                    payload="oops",  # type: ignore[arg-type]
                    authorization=None,
                    db=session,
                )
        self.assertEqual(ctx.exception.status_code, 422)


class IsolationTests(unittest.TestCase):
    def test_two_users_get_independent_rows_for_the_same_dataset(self) -> None:
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        with _Patches(user_id="u-a"):
            datasets_router.upsert_dataset_session(
                dataset_id="ds-1",
                payload={"chat_session_id": "chat-a"},
                authorization=None, db=session,
            )
        with _Patches(user_id="u-b"):
            datasets_router.upsert_dataset_session(
                dataset_id="ds-1",
                payload={"chat_session_id": "chat-b"},
                authorization=None, db=session,
            )

        with _Patches(user_id="u-a", role="viewer"):
            a = datasets_router.get_dataset_session("ds-1", None, session)
        with _Patches(user_id="u-b", role="viewer"):
            b = datasets_router.get_dataset_session("ds-1", None, session)

        self.assertEqual(a["chat_session_id"], "chat-a")
        self.assertEqual(b["chat_session_id"], "chat-b")
        self.assertEqual(session.query(DatasetSessionDB).count(), 2)


class ClearSessionTests(unittest.TestCase):
    def test_delete_removes_only_caller_row(self) -> None:
        import uuid as _uuid
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        session.add(DatasetSessionDB(
            id=str(_uuid.uuid4()),
            user_id="u-1", dataset_id="ds-1", chat_session_id="mine",
        ))
        session.add(DatasetSessionDB(
            id=str(_uuid.uuid4()),
            user_id="u-other", dataset_id="ds-1", chat_session_id="other",
        ))
        session.commit()

        with _Patches(user_id="u-1"):
            result = datasets_router.clear_dataset_session(
                dataset_id="ds-1", authorization=None, db=session
            )
        self.assertEqual(result["deleted"], 1)
        survivors = session.query(DatasetSessionDB).all()
        self.assertEqual(len(survivors), 1)
        self.assertEqual(survivors[0].user_id, "u-other")

    def test_delete_when_no_row_returns_zero(self) -> None:
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        with _Patches(user_id="u-1"):
            result = datasets_router.clear_dataset_session(
                dataset_id="ds-missing", authorization=None, db=session
            )
        self.assertEqual(result["deleted"], 0)


if __name__ == "__main__":
    unittest.main()
