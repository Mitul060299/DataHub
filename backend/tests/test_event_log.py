"""Tests for the ``pipeline_events`` append-only audit log.

We assert that:
  * ``materialize_dataset`` emits a ``dataset_materialized`` event,
  * ``materialize_artifact`` emits an ``artifact_materialized`` event,
  * the helper survives a broken DB session without raising,
  * the table schema accepts the columns the helper writes.
"""

from __future__ import annotations

import os
import unittest
import unittest.mock
from unittest.mock import MagicMock

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")


def _fresh_session() -> tuple[Session, "object"]:
    from app.db import Base
    from app.models_db import PipelineEventDB

    engine = create_engine("sqlite:///:memory:", future=True)
    PipelineEventDB.__table__.create(bind=engine)
    session = Session(bind=engine, future=True)
    return session, engine


class EmitEventTests(unittest.TestCase):
    def test_basic_insert_persists_after_commit(self) -> None:
        from app.models_db import PipelineEventDB
        from app.services.event_log import emit_event

        session, _ = _fresh_session()
        emit_event(
            session,
            event_type="dataset_materialized",
            user_id="u-1",
            payload={"dataset_id": "ds-1", "triggered_by": "user_upload"},
        )
        session.commit()

        rows = session.query(PipelineEventDB).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].event_type, "dataset_materialized")
        self.assertEqual(rows[0].user_id, "u-1")
        self.assertEqual(rows[0].payload["dataset_id"], "ds-1")
        self.assertEqual(rows[0].payload["triggered_by"], "user_upload")

    def test_swallows_db_failure(self) -> None:
        """A broken session must not raise out of emit_event."""
        from app.services.event_log import emit_event

        broken = MagicMock()
        broken.add.side_effect = RuntimeError("db is on fire")
        result = emit_event(broken, event_type="dataset_deleted", user_id="u-1")
        self.assertIsNone(result)

    def test_empty_event_type_is_a_noop(self) -> None:
        from app.models_db import PipelineEventDB
        from app.services.event_log import emit_event

        session, _ = _fresh_session()
        emit_event(session, event_type="")
        session.commit()
        self.assertEqual(session.query(PipelineEventDB).count(), 0)


class PersistencePolicyEmitsEventsTests(unittest.TestCase):
    """The materialize helpers must call ``emit_event`` with the right tags.

    We mock the underlying constructors so the test doesn't need the real
    ``dataset_meta`` / ``artifacts`` tables (those use raw JSONB which is
    Postgres-only and won't render on SQLite).
    """

    def test_materialize_dataset_calls_emit_event(self) -> None:
        from app.services import persistence_policy

        captured: dict = {}

        def _fake_emit(_db, **kwargs):
            captured.update(kwargs)
            return None

        db = MagicMock()
        # Bypass the real ORM constructor; we only care about the audit call.
        with unittest.mock.patch.object(persistence_policy, "DatasetMetaDB",
                                        return_value=MagicMock()), \
             unittest.mock.patch("app.services.event_log.emit_event",
                                 side_effect=_fake_emit):
            persistence_policy.materialize_dataset(
                db,
                triggered_by="user_save",
                id="ds-evt-9",
                user_id="u-9",
                workspace_id="ws-1",
                name="orders",
                row_count=42,
                source_type="checkpoint",
                parent_id="parent-1",
            )

        self.assertEqual(captured.get("event_type"), "dataset_materialized")
        self.assertEqual(captured.get("user_id"), "u-9")
        payload = captured.get("payload") or {}
        self.assertEqual(payload.get("triggered_by"), "user_save")
        self.assertEqual(payload.get("dataset_id"), "ds-evt-9")
        self.assertEqual(payload.get("name"), "orders")
        self.assertEqual(payload.get("parent_id"), "parent-1")

    def test_materialize_artifact_calls_emit_event(self) -> None:
        from app.services import persistence_policy

        captured: dict = {}

        def _fake_emit(_db, **kwargs):
            captured.update(kwargs)
            return None

        db = MagicMock()
        with unittest.mock.patch.object(persistence_policy, "ArtifactDB",
                                        return_value=MagicMock()), \
             unittest.mock.patch("app.services.event_log.emit_event",
                                 side_effect=_fake_emit):
            persistence_policy.materialize_artifact(
                db,
                triggered_by="user_save",
                id="a-evt-9",
                user_id="u-9",
                session_id="sess-1",
                pipeline_run_id="run-1",
                step_id="step-1",
                name="checkpoint v1",
                type="checkpoint",
                format="parquet",
                row_count=10,
            )

        self.assertEqual(captured.get("event_type"), "artifact_materialized")
        self.assertEqual(captured.get("session_id"), "sess-1")
        self.assertEqual(captured.get("run_id"), "run-1")
        self.assertEqual(captured.get("step_id"), "step-1")
        payload = captured.get("payload") or {}
        self.assertEqual(payload.get("triggered_by"), "user_save")
        self.assertEqual(payload.get("artifact_id"), "a-evt-9")
        self.assertEqual(payload.get("type"), "checkpoint")


if __name__ == "__main__":
    unittest.main()
