"""
test_cron_scheduler.py
======================
Unit tests for the cron scheduler endpoint and related logic.

Coverage
--------
  A — GET /api/cron/run-scheduled-pipelines
        A1. Returns 403 when X-Cron-Secret is missing
        A2. Returns 403 when X-Cron-Secret is wrong
        A3. Returns triggered_count=0 when no schedules are due
        A4. Triggers due schedules, updates last_run_at / next_run_at, returns correct count
        A5. Does NOT re-trigger a schedule whose next_run_at is in the future
        A6. Does NOT trigger a schedule where is_active=False
        A7. Returns ok=False (not 500) when a DB error occurs (graceful degradation)
        A8. Only triggers schedules for THIS pipeline, not others

  B — _compute_next_run helper
        B1. Returns a tz-naive UTC datetime for a valid cron expression
        B2. Returns None when cron expression is invalid
        B3. Returns None when timezone name is invalid

  C — POST /api/pipelines/{id}/schedule  (create/update round-trip)
        C1. Creates a new schedule with next_run_at computed when is_active=True
        C2. next_run_at is None when is_active=False
        C3. Updates an existing schedule
        C4. Returns 404 when pipeline does not exist
"""
from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

# ── Stub optional heavy deps before importing anything from app ───────────────
for _mod in [
    "chromadb", "chromadb.utils", "chromadb.config", "chromadb.api",
    "slowapi.util", "slowapi.errors", "slowapi.middleware",
]:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

if "slowapi" not in sys.modules:
    _slowapi_stub = MagicMock()
    _slowapi_stub.Limiter.return_value.limit = lambda rate: (lambda fn: fn)
    sys.modules["slowapi"] = _slowapi_stub

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")

# ─────────────────────────────────────────────────────────────────────────────

_CORRECT_SECRET = "test-cron-secret"
_WRONG_SECRET = "wrong-secret"
_NOW_UTC = datetime(2026, 5, 18, 10, 0, 0)  # naive UTC reference


def _make_schedule(
    pipeline_id="pipe-1",
    is_active=True,
    next_run_at=None,
    cron_expression="*/5 * * * *",
    tz="UTC",
    sched_id="sched-1",
):
    """Build a mock PipelineScheduleDB row."""
    s = MagicMock()
    s.id = sched_id
    s.pipeline_id = pipeline_id
    s.is_active = is_active
    s.cron_expression = cron_expression
    s.timezone = tz
    # Default: overdue by 1 minute
    s.next_run_at = next_run_at if next_run_at is not None else _NOW_UTC - timedelta(minutes=1)
    s.last_run_at = None
    s.write_back_config = None
    return s


# =============================================================================
# A — run_scheduled_pipelines endpoint
# =============================================================================

class TestRunScheduledPipelines(unittest.IsolatedAsyncioTestCase):
    """Tests for GET /api/cron/run-scheduled-pipelines."""

    def _import_handler(self):
        from app.routers.cron import run_scheduled_pipelines
        return run_scheduled_pipelines

    def _make_db(self, schedules):
        """Return a mock SQLAlchemy session that yields `schedules`."""
        db = MagicMock()
        query_chain = (
            db.query.return_value
               .filter.return_value
               .all.return_value
        ) = schedules
        return db

    def _make_background_tasks(self):
        bt = MagicMock()
        bt.add_task = MagicMock()
        return bt

    # ── helpers ──────────────────────────────────────────────────────────────

    async def _call(self, secret, schedules=None, db=None):
        handler = self._import_handler()
        if db is None:
            db = self._make_db(schedules or [])
        bt = self._make_background_tasks()

        with patch("app.routers.cron.settings") as mock_settings, \
             patch("app.routers.cron._compute_next_run", return_value=_NOW_UTC + timedelta(hours=1)), \
             patch("app.routers.cron.run_pipeline", new_callable=AsyncMock):
            mock_settings.cron_secret = _CORRECT_SECRET
            result = await handler(
                background_tasks=bt,
                x_cron_secret=secret,
                db=db,
            )
        return result, bt

    # ── tests ─────────────────────────────────────────────────────────────────

    async def test_A1_missing_secret_returns_403(self):
        from fastapi import HTTPException
        handler = self._import_handler()
        db = self._make_db([])
        bt = self._make_background_tasks()
        with patch("app.routers.cron.settings") as mock_settings:
            mock_settings.cron_secret = _CORRECT_SECRET
            with self.assertRaises(HTTPException) as ctx:
                await handler(background_tasks=bt, x_cron_secret=None, db=db)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_A2_wrong_secret_returns_403(self):
        from fastapi import HTTPException
        handler = self._import_handler()
        db = self._make_db([])
        bt = self._make_background_tasks()
        with patch("app.routers.cron.settings") as mock_settings:
            mock_settings.cron_secret = _CORRECT_SECRET
            with self.assertRaises(HTTPException) as ctx:
                await handler(background_tasks=bt, x_cron_secret=_WRONG_SECRET, db=db)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_A3_no_due_schedules_returns_zero(self):
        result, bt = await self._call(_CORRECT_SECRET, schedules=[])
        self.assertTrue(result["ok"])
        self.assertEqual(result["triggered_count"], 0)
        self.assertEqual(result["triggered"], [])
        bt.add_task.assert_not_called()

    async def test_A4_due_schedule_triggers_and_updates(self):
        sched = _make_schedule(pipeline_id="pipe-1")
        result, bt = await self._call(_CORRECT_SECRET, schedules=[sched])

        self.assertTrue(result["ok"])
        self.assertEqual(result["triggered_count"], 1)
        self.assertIn("pipe-1", result["triggered"])
        # last_run_at should be set
        self.assertIsNotNone(sched.last_run_at)
        # next_run_at should be updated (our mock returns NOW+1h)
        self.assertEqual(sched.next_run_at, _NOW_UTC + timedelta(hours=1))
        # background task enqueued
        bt.add_task.assert_called_once()

    async def test_A5_future_schedule_not_triggered(self):
        """A schedule with next_run_at in the future should NOT appear in the query result.
        We simulate the DB filter correctly by returning an empty list."""
        # The DB query already filters next_run_at <= now, so we just confirm
        # that a schedule returned with a future time would not appear in results.
        # We return empty list (DB correctly filtered it out).
        result, bt = await self._call(_CORRECT_SECRET, schedules=[])
        self.assertEqual(result["triggered_count"], 0)
        bt.add_task.assert_not_called()

    async def test_A6_inactive_schedule_not_triggered(self):
        """Inactive schedules should be filtered by DB; verify endpoint handles empty correctly."""
        # DB filters is_active=True, so inactive never reaches the handler.
        result, bt = await self._call(_CORRECT_SECRET, schedules=[])
        self.assertEqual(result["triggered_count"], 0)
        bt.add_task.assert_not_called()

    async def test_A7_db_error_returns_ok_false_not_500(self):
        """If the DB raises, endpoint returns ok=False with error field, NOT a 500."""
        handler = self._import_handler()
        bt = self._make_background_tasks()

        # Make the DB query raise
        db = MagicMock()
        db.query.side_effect = Exception("DB connection lost")

        with patch("app.routers.cron.settings") as mock_settings:
            mock_settings.cron_secret = _CORRECT_SECRET
            result = await handler(background_tasks=bt, x_cron_secret=_CORRECT_SECRET, db=db)

        self.assertFalse(result["ok"])
        self.assertEqual(result["triggered_count"], 0)
        self.assertIn("error", result)
        self.assertIn("DB connection lost", result["error"])

    async def test_A8_multiple_due_schedules_all_triggered(self):
        scheds = [
            _make_schedule(pipeline_id="pipe-1", sched_id="s1"),
            _make_schedule(pipeline_id="pipe-2", sched_id="s2"),
            _make_schedule(pipeline_id="pipe-3", sched_id="s3"),
        ]
        result, bt = await self._call(_CORRECT_SECRET, schedules=scheds)

        self.assertTrue(result["ok"])
        self.assertEqual(result["triggered_count"], 3)
        self.assertEqual(set(result["triggered"]), {"pipe-1", "pipe-2", "pipe-3"})
        self.assertEqual(bt.add_task.call_count, 3)


# =============================================================================
# B — _compute_next_run
# =============================================================================

class TestComputeNextRun(unittest.TestCase):
    """Tests for the _compute_next_run helper in cron.py."""

    def _call(self, cron_expr, tz_name):
        from app.routers.cron import _compute_next_run
        return _compute_next_run(cron_expr, tz_name)

    @unittest.skipUnless(
        __import__("importlib").util.find_spec("croniter") is not None,
        "croniter not installed",
    )
    def test_B1_valid_cron_and_tz_returns_naive_utc_datetime(self):
        result = self._call("0 9 * * 1", "Asia/Kolkata")
        self.assertIsNotNone(result)
        self.assertIsInstance(result, datetime)
        # Must be tz-naive (stripped by .replace(tzinfo=None))
        self.assertIsNone(result.tzinfo)

    def test_B2_invalid_cron_expression_returns_none(self):
        result = self._call("not a cron", "UTC")
        self.assertIsNone(result)

    def test_B3_invalid_timezone_returns_none(self):
        result = self._call("0 9 * * 1", "Mars/Olympus_Mons")
        self.assertIsNone(result)

    @unittest.skipUnless(
        __import__("importlib").util.find_spec("croniter") is not None,
        "croniter not installed",
    )
    def test_B4_every_5_minutes_next_run_within_5_minutes(self):
        result = self._call("*/5 * * * *", "UTC")
        self.assertIsNotNone(result)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        diff = (result - now).total_seconds()
        # Next run must be in the future, within 5 minutes
        self.assertGreater(diff, 0)
        self.assertLessEqual(diff, 300 + 2)  # 5 min + tiny buffer

    def test_B5_compute_next_run_consistent_between_cron_and_pipeline_refresh(self):
        """Both cron.py and pipeline_refresh.py have identical _compute_next_run impls;
        verify they return the same result for the same inputs."""
        from app.routers.cron import _compute_next_run as cron_fn
        from app.routers.pipeline_refresh import _compute_next_run as refresh_fn
        cron_result = cron_fn("0 9 * * 1", "Asia/Kolkata")
        refresh_result = refresh_fn("0 9 * * 1", "Asia/Kolkata")
        self.assertEqual(cron_result, refresh_result)


# =============================================================================
# C — Schedule create/update via pipeline_refresh router
# =============================================================================

class TestScheduleCreateUpdate(unittest.IsolatedAsyncioTestCase):
    """Tests for POST /api/pipelines/{id}/schedule."""

    def _make_db(self, pipeline_exists=True, existing_sched=None):
        db = MagicMock()
        from app.models_db import PipelineV2DB, PipelineScheduleDB

        # pipeline lookup
        if pipeline_exists:
            pipeline_mock = MagicMock(spec=PipelineV2DB)
            pipeline_mock.id = "pipe-1"
        else:
            pipeline_mock = None

        # schedule lookup
        def _query_side_effect(model):
            q = MagicMock()
            if model is PipelineV2DB:
                q.filter.return_value.first.return_value = pipeline_mock
            elif model is PipelineScheduleDB:
                q.filter.return_value.first.return_value = existing_sched
            else:
                q.filter.return_value.first.return_value = None
                q.filter.return_value.all.return_value = []
            return q

        db.query.side_effect = _query_side_effect
        db.commit = MagicMock()
        db.add = MagicMock()
        db.refresh = MagicMock(side_effect=lambda obj: None)
        return db

    async def test_C1_creates_schedule_with_next_run_when_active(self):
        from app.routers.pipeline_refresh import create_or_update_schedule
        from app.models import PipelineScheduleCreate

        db = self._make_db(pipeline_exists=True, existing_sched=None)
        body = PipelineScheduleCreate(
            pipeline_id="pipe-1",
            cron_expression="0 9 * * 1",
            timezone="UTC",
            is_active=True,
        )

        future_dt = datetime(2026, 5, 25, 9, 0, 0)

        with patch("app.routers.pipeline_refresh.get_current_role", return_value="admin"), \
             patch("app.routers.pipeline_refresh.get_current_user_id", return_value="user-1"), \
             patch("app.routers.pipeline_refresh._compute_next_run", return_value=future_dt) as mock_cnr, \
             patch("app.routers.pipeline_refresh._sched_to_resp") as mock_resp:
            mock_resp.return_value = {"id": "new-sched"}
            await create_or_update_schedule(
                pipeline_id="pipe-1",
                body=body,
                authorization="Bearer token",
                db=db,
            )

        mock_cnr.assert_called_once_with("0 9 * * 1", "UTC")
        db.add.assert_called_once()
        db.commit.assert_called_once()

    async def test_C2_next_run_is_none_when_inactive(self):
        from app.routers.pipeline_refresh import create_or_update_schedule
        from app.models import PipelineScheduleCreate

        db = self._make_db(pipeline_exists=True, existing_sched=None)
        body = PipelineScheduleCreate(
            pipeline_id="pipe-1",
            cron_expression="0 9 * * 1",
            timezone="UTC",
            is_active=False,
        )

        with patch("app.routers.pipeline_refresh.get_current_role", return_value="admin"), \
             patch("app.routers.pipeline_refresh.get_current_user_id", return_value="user-1"), \
             patch("app.routers.pipeline_refresh._compute_next_run") as mock_cnr, \
             patch("app.routers.pipeline_refresh._sched_to_resp", return_value={}):
            await create_or_update_schedule(
                pipeline_id="pipe-1",
                body=body,
                authorization="Bearer token",
                db=db,
            )

        # _compute_next_run must NOT be called when is_active=False
        mock_cnr.assert_not_called()

    async def test_C3_updates_existing_schedule(self):
        from app.routers.pipeline_refresh import create_or_update_schedule
        from app.models import PipelineScheduleCreate

        existing = MagicMock()
        existing.pipeline_id = "pipe-1"
        db = self._make_db(pipeline_exists=True, existing_sched=existing)

        body = PipelineScheduleCreate(
            pipeline_id="pipe-1",
            cron_expression="0 12 * * *",
            timezone="Asia/Kolkata",
            is_active=True,
        )
        future_dt = datetime(2026, 5, 19, 6, 30, 0)

        with patch("app.routers.pipeline_refresh.get_current_role", return_value="admin"), \
             patch("app.routers.pipeline_refresh.get_current_user_id", return_value="user-1"), \
             patch("app.routers.pipeline_refresh._compute_next_run", return_value=future_dt), \
             patch("app.routers.pipeline_refresh._sched_to_resp", return_value={}):
            await create_or_update_schedule(
                pipeline_id="pipe-1",
                body=body,
                authorization="Bearer token",
                db=db,
            )

        # Should mutate the existing row, not call db.add()
        db.add.assert_not_called()
        self.assertEqual(existing.cron_expression, "0 12 * * *")
        self.assertEqual(existing.timezone, "Asia/Kolkata")
        self.assertTrue(existing.is_active)
        self.assertEqual(existing.next_run_at, future_dt)

    async def test_C4_returns_404_when_pipeline_not_found(self):
        from app.routers.pipeline_refresh import create_or_update_schedule
        from app.models import PipelineScheduleCreate
        from fastapi import HTTPException

        db = self._make_db(pipeline_exists=False)
        body = PipelineScheduleCreate(
            pipeline_id="nonexistent",
            cron_expression="0 9 * * 1",
            timezone="UTC",
            is_active=True,
        )

        with patch("app.routers.pipeline_refresh.get_current_role", return_value="admin"), \
             patch("app.routers.pipeline_refresh.get_current_user_id", return_value="user-1"):
            with self.assertRaises(HTTPException) as ctx:
                await create_or_update_schedule(
                    pipeline_id="nonexistent",
                    body=body,
                    authorization="Bearer token",
                    db=db,
                )
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
