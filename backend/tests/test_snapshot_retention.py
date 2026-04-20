"""Tests for the per-step Parquet snapshot retention sweep.

The sweep evicts ``PipelineStepDB.snapshot_path`` entries by two rules:

  1. **TTL** -- created_at older than ``SNAPSHOT_RETENTION_DAYS`` (default 30)
  2. **Cap** -- keep at most ``SNAPSHOT_KEEP_PER_SESSION`` (default 20) per
     session_id, evicting the oldest by step_number/created_at beyond that

Both rules NULL the column even if the underlying storage delete is
queued for retry, so a failing object store never blocks the sweep.
"""
from __future__ import annotations

import os
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")

from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from app.models_db import PendingStorageDeleteDB, PipelineStepDB


# JSONB is Postgres-only.  PipelineStepDB.input_tables uses it, so register
# a one-line shim that emits ``JSON`` (which SQLite happily stores as TEXT)
# whenever the SQLite dialect renders DDL.  This keeps the test fast +
# dependency-free without touching the production model definition.
@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(_element, _compiler, **_kw):  # pragma: no cover
    return "JSON"


def _fresh_session():
    """Build a SQLite session with only the tables this sweep touches.

    Other models in the codebase use ``JSONB`` which SQLite cannot render,
    so we cherry-pick.  ``PipelineStepDB.input_tables`` is JSONB; we
    sidestep it by passing a list literal that SQLAlchemy serialises.
    """
    engine = create_engine("sqlite:///:memory:")
    PendingStorageDeleteDB.__table__.create(bind=engine)
    PipelineStepDB.__table__.create(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session(), engine


def _mk_step(
    *,
    user_id: str = "u-1",
    session_id: str = "sess-1",
    step_number: int = 1,
    snapshot_path: str | None = "s3://b/u-1/d-1/step.parquet",
    created_at: datetime | None = None,
) -> PipelineStepDB:
    return PipelineStepDB(
        id=str(uuid.uuid4()),
        user_id=user_id,
        session_id=session_id,
        step_number=step_number,
        operation="select",
        input_tables=[],
        status="completed",
        snapshot_path=snapshot_path,
        created_at=created_at or datetime.now(timezone.utc),
    )


class TtlPassTests(unittest.TestCase):
    def test_evicts_rows_older_than_cutoff(self) -> None:
        from app.services import snapshot_retention

        session, _ = _fresh_session()
        old_ts = datetime.now(timezone.utc) - timedelta(days=45)
        new_ts = datetime.now(timezone.utc) - timedelta(days=2)
        old = _mk_step(step_number=1, created_at=old_ts,
                       snapshot_path="s3://b/u-1/d-1/step_old.parquet")
        keep = _mk_step(step_number=2, created_at=new_ts,
                        snapshot_path="s3://b/u-1/d-1/step_new.parquet")
        session.add_all([old, keep])
        session.commit()

        with patch(
            "app.services.snapshot_retention.safe_storage_delete",
            return_value=True,
        ) as m:
            stats = snapshot_retention.purge_old_snapshots(
                db=session, retention_days=30, keep_per_session=999,
            )

        self.assertEqual(stats["scanned"], 1)
        self.assertEqual(stats["purged"], 1)
        self.assertEqual(stats["errors"], 0)
        m.assert_called_once_with(
            "s3://b/u-1/d-1/step_old.parquet",
            source="pipeline_snapshot_ttl",
            db=session,
        )
        # Old row's snapshot_path is NULL; the surviving row is untouched.
        session.expire_all()
        self.assertIsNone(session.get(PipelineStepDB, old.id).snapshot_path)
        self.assertEqual(
            session.get(PipelineStepDB, keep.id).snapshot_path,
            "s3://b/u-1/d-1/step_new.parquet",
        )

    def test_storage_delete_failure_still_clears_path(self) -> None:
        """A queued retry must not leave the row to be re-scanned forever."""
        from app.services import snapshot_retention

        session, _ = _fresh_session()
        old = _mk_step(
            created_at=datetime.now(timezone.utc) - timedelta(days=60),
            snapshot_path="s3://b/u-1/d-1/will_fail.parquet",
        )
        session.add(old)
        session.commit()

        with patch(
            "app.services.snapshot_retention.safe_storage_delete",
            return_value=False,  # queued for retry
        ):
            stats = snapshot_retention.purge_old_snapshots(
                db=session, retention_days=30,
            )

        self.assertEqual(stats["scanned"], 1)
        self.assertEqual(stats["purged"], 1)  # row was processed even though queued
        session.expire_all()
        self.assertIsNone(session.get(PipelineStepDB, old.id).snapshot_path)

    def test_rows_without_snapshot_path_are_ignored(self) -> None:
        from app.services import snapshot_retention

        session, _ = _fresh_session()
        no_path = _mk_step(
            created_at=datetime.now(timezone.utc) - timedelta(days=99),
            snapshot_path=None,
        )
        session.add(no_path)
        session.commit()

        with patch("app.services.snapshot_retention.safe_storage_delete") as m:
            stats = snapshot_retention.purge_old_snapshots(
                db=session, retention_days=30,
            )

        self.assertEqual(stats["scanned"], 0)
        self.assertEqual(stats["purged"], 0)
        m.assert_not_called()


class CapPassTests(unittest.TestCase):
    def test_keeps_most_recent_n_per_session(self) -> None:
        from app.services import snapshot_retention

        session, _ = _fresh_session()
        # 25 fresh rows in one session, all under the TTL.
        recent = datetime.now(timezone.utc) - timedelta(hours=1)
        steps = [
            _mk_step(
                step_number=i,
                created_at=recent + timedelta(seconds=i),
                snapshot_path=f"s3://b/u-1/d-1/step_{i}.parquet",
            )
            for i in range(25)
        ]
        session.add_all(steps)
        session.commit()

        with patch(
            "app.services.snapshot_retention.safe_storage_delete",
            return_value=True,
        ) as m:
            stats = snapshot_retention.purge_old_snapshots(
                db=session, retention_days=30, keep_per_session=20,
            )

        # 5 rows over the cap should be evicted.
        self.assertEqual(stats["scanned"], 5)
        self.assertEqual(stats["purged"], 5)
        self.assertEqual(m.call_count, 5)
        for call in m.call_args_list:
            self.assertEqual(call.kwargs["source"], "pipeline_snapshot_cap")

        session.expire_all()
        survivors = (
            session.query(PipelineStepDB)
            .filter(PipelineStepDB.snapshot_path.isnot(None))
            .all()
        )
        self.assertEqual(len(survivors), 20)
        # The 20 newest step_numbers (5..24) should survive.
        kept = sorted(s.step_number for s in survivors)
        self.assertEqual(kept, list(range(5, 25)))

    def test_under_cap_session_is_untouched(self) -> None:
        from app.services import snapshot_retention

        session, _ = _fresh_session()
        steps = [
            _mk_step(step_number=i, snapshot_path=f"s3://b/x/y/step_{i}.parquet")
            for i in range(10)
        ]
        session.add_all(steps)
        session.commit()

        with patch(
            "app.services.snapshot_retention.safe_storage_delete",
            return_value=True,
        ) as m:
            stats = snapshot_retention.purge_old_snapshots(
                db=session, retention_days=30, keep_per_session=20,
            )

        self.assertEqual(stats["scanned"], 0)
        self.assertEqual(stats["purged"], 0)
        m.assert_not_called()

    def test_null_session_id_is_skipped_by_cap_pass(self) -> None:
        """The cap pass groups by session_id; rows with NULL session can
        only be evicted via the TTL pass."""
        from app.services import snapshot_retention

        session, _ = _fresh_session()
        steps = [
            _mk_step(
                session_id=None,  # type: ignore[arg-type]
                step_number=i,
                snapshot_path=f"s3://b/x/y/step_{i}.parquet",
            )
            for i in range(30)
        ]
        session.add_all(steps)
        session.commit()

        with patch(
            "app.services.snapshot_retention.safe_storage_delete",
            return_value=True,
        ):
            stats = snapshot_retention.purge_old_snapshots(
                db=session, retention_days=30, keep_per_session=5,
            )
        self.assertEqual(stats["scanned"], 0)


class LimitTests(unittest.TestCase):
    def test_limit_caps_total_evictions_per_run(self) -> None:
        from app.services import snapshot_retention

        session, _ = _fresh_session()
        old_ts = datetime.now(timezone.utc) - timedelta(days=60)
        steps = [
            _mk_step(step_number=i, created_at=old_ts,
                     snapshot_path=f"s3://b/x/y/old_{i}.parquet")
            for i in range(10)
        ]
        session.add_all(steps)
        session.commit()

        with patch(
            "app.services.snapshot_retention.safe_storage_delete",
            return_value=True,
        ):
            stats = snapshot_retention.purge_old_snapshots(
                db=session, retention_days=30, limit=3,
            )

        self.assertEqual(stats["scanned"], 3)
        self.assertEqual(stats["purged"], 3)
        # 7 rows still have snapshot_path set; the next sweep will pick them up.
        session.expire_all()
        remaining = (
            session.query(PipelineStepDB)
            .filter(PipelineStepDB.snapshot_path.isnot(None))
            .count()
        )
        self.assertEqual(remaining, 7)


if __name__ == "__main__":
    unittest.main()
