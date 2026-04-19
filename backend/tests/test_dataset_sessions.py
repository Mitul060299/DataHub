"""Tests for arch #2: server-side DatasetSessionDB endpoints.

The dataset_meta table uses Postgres-only JSONB columns that SQLite cannot
render, so we exercise the new endpoints through a real SQLite session that
ONLY creates the dataset_sessions table — no other ORM tables are needed.
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

    def __init__(self, user_id="u-1", role="editor"):
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
        self.assertIsNone(result["live_table_name"])
        self.assertIsNone(result["updated_at"])

    def test_returns_persisted_row_for_owner_only(self) -> None:
        import uuid as _uuid
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        # Seed two rows: one for u-1 and one for u-other on the same dataset.
        session.add(DatasetSessionDB(
            id=str(_uuid.uuid4()),
            user_id="u-1", dataset_id="ds-1",
            chat_session_id="chat-mine", live_table_name="t_mine",
            live_row_count=10, live_step_label="my step", live_rows_changed=2,
        ))
        session.add(DatasetSessionDB(
            id=str(_uuid.uuid4()),
            user_id="u-other", dataset_id="ds-1",
            chat_session_id="chat-other", live_table_name="t_other",
            live_row_count=99, live_step_label="other step",
        ))
        session.commit()

        with _Patches(user_id="u-1", role="viewer"):
            result = datasets_router.get_dataset_session(
                dataset_id="ds-1", authorization=None, db=session
            )
        self.assertEqual(result["chat_session_id"], "chat-mine")
        self.assertEqual(result["live_table_name"], "t_mine")
        self.assertEqual(result["live_row_count"], 10)
        self.assertEqual(result["live_step_label"], "my step")
        self.assertEqual(result["live_rows_changed"], 2)


class UpsertSessionTests(unittest.TestCase):
    def test_creates_a_new_row_on_first_call(self) -> None:
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        with _Patches(user_id="u-1"):
            result = datasets_router.upsert_dataset_session(
                dataset_id="ds-1",
                payload={
                    "chat_session_id": "chat-1",
                    "live_table_name": "session_t1",
                    "live_row_count": 42,
                    "live_step_label": "Filter rows",
                    "live_rows_changed": 5,
                },
                authorization=None,
                db=session,
            )
        self.assertTrue(result["created"])
        self.assertEqual(result["chat_session_id"], "chat-1")
        self.assertEqual(result["live_table_name"], "session_t1")
        self.assertEqual(result["live_row_count"], 42)
        rows = session.query(DatasetSessionDB).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].user_id, "u-1")
        self.assertEqual(rows[0].dataset_id, "ds-1")

    def test_partial_update_leaves_omitted_fields_untouched(self) -> None:
        import uuid as _uuid
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        session.add(DatasetSessionDB(
            id=str(_uuid.uuid4()),
            user_id="u-1", dataset_id="ds-1",
            chat_session_id="chat-keep", live_table_name="t_keep",
            live_row_count=1, live_step_label="keep me",
        ))
        session.commit()

        with _Patches(user_id="u-1"):
            result = datasets_router.upsert_dataset_session(
                dataset_id="ds-1",
                payload={"live_table_name": "t_new"},
                authorization=None,
                db=session,
            )

        self.assertFalse(result["created"])
        self.assertEqual(result["live_table_name"], "t_new")
        # Untouched fields preserved.
        self.assertEqual(result["chat_session_id"], "chat-keep")
        self.assertEqual(result["live_row_count"], 1)
        self.assertEqual(result["live_step_label"], "keep me")
        # Only one row total — no duplicate insert.
        self.assertEqual(session.query(DatasetSessionDB).count(), 1)

    def test_explicit_null_clears_field(self) -> None:
        import uuid as _uuid
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        session.add(DatasetSessionDB(
            id=str(_uuid.uuid4()),
            user_id="u-1", dataset_id="ds-1",
            chat_session_id="chat-1", live_table_name="t1",
            live_row_count=10,
        ))
        session.commit()

        with _Patches(user_id="u-1"):
            result = datasets_router.upsert_dataset_session(
                dataset_id="ds-1",
                payload={"live_table_name": None, "live_row_count": None},
                authorization=None,
                db=session,
            )
        self.assertIsNone(result["live_table_name"])
        self.assertIsNone(result["live_row_count"])
        # chat_session_id was not in payload — preserved.
        self.assertEqual(result["chat_session_id"], "chat-1")

    def test_invalid_int_raises_422(self) -> None:
        from fastapi import HTTPException
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        with _Patches(user_id="u-1"):
            with self.assertRaises(HTTPException) as ctx:
                datasets_router.upsert_dataset_session(
                    dataset_id="ds-1",
                    payload={"live_row_count": "not-a-number"},
                    authorization=None,
                    db=session,
                )
        self.assertEqual(ctx.exception.status_code, 422)

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
                payload={"live_table_name": "t_a"},
                authorization=None, db=session,
            )
        with _Patches(user_id="u-b"):
            datasets_router.upsert_dataset_session(
                dataset_id="ds-1",
                payload={"live_table_name": "t_b"},
                authorization=None, db=session,
            )

        with _Patches(user_id="u-a", role="viewer"):
            a = datasets_router.get_dataset_session("ds-1", None, session)
        with _Patches(user_id="u-b", role="viewer"):
            b = datasets_router.get_dataset_session("ds-1", None, session)

        self.assertEqual(a["live_table_name"], "t_a")
        self.assertEqual(b["live_table_name"], "t_b")
        self.assertEqual(session.query(DatasetSessionDB).count(), 2)


class ClearSessionTests(unittest.TestCase):
    def test_delete_removes_only_caller_row(self) -> None:
        import uuid as _uuid
        from app.routers import datasets as datasets_router
        session, _ = _fresh_session()
        session.add(DatasetSessionDB(
            id=str(_uuid.uuid4()),
            user_id="u-1", dataset_id="ds-1", live_table_name="mine",
        ))
        session.add(DatasetSessionDB(
            id=str(_uuid.uuid4()),
            user_id="u-other", dataset_id="ds-1", live_table_name="other",
        ))
        session.commit()

        with _Patches(user_id="u-1"):
            result = datasets_router.clear_dataset_session(
                dataset_id="ds-1", authorization=None, db=session
            )
        self.assertEqual(result["deleted"], 1)
        # u-other's row survives.
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
