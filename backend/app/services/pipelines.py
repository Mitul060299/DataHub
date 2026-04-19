from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..db import SessionLocal
from ..models_db import PipelineDB, PipelineRunDB
from ..services.connectors import connector_registry
from ..routers.datasets import save_dataset, get_dataset_from_db
from ..services.profiler import profile_dataframe
from ..services.insights import generate_insights
from ..services.recipes import recipe_store
from ..services.transformer import apply_steps
from ..services.archival import schedule_archival_job
from ..services.tenant_isolation_monitor import schedule_tenant_isolation_job
from ..services.storage_cleanup import schedule_storage_cleanup_job

_scheduler: BackgroundScheduler | None = None


def _parse_time(value: str | None) -> tuple[int, int]:
    if not value:
        return 0, 0
    parts = value.split(":")
    if len(parts) != 2:
        return 0, 0
    hour = max(0, min(23, int(parts[0])))
    minute = max(0, min(59, int(parts[1])))
    return hour, minute


def _weekday_to_cron(value: int | None) -> str | None:
    if value is None:
        return None
    mapping = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}
    return mapping.get(value)


def build_trigger(cadence: str, time_of_day: str | None, day_of_week: int | None, day_of_month: int | None) -> CronTrigger:
    hour, minute = _parse_time(time_of_day)
    if cadence == "weekly":
        day = _weekday_to_cron(day_of_week) or "mon"
        return CronTrigger(day_of_week=day, hour=hour, minute=minute, timezone=timezone.utc)
    if cadence == "monthly":
        dom = day_of_month or 1
        dom = max(1, min(28, dom))
        return CronTrigger(day=dom, hour=hour, minute=minute, timezone=timezone.utc)
    return CronTrigger(hour=hour, minute=minute, timezone=timezone.utc)


def _ensure_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(timezone=timezone.utc)
    return _scheduler


def start_scheduler() -> None:
    if os.getenv("SCHEDULER_ENABLED") != "1":
        return
    scheduler = _ensure_scheduler()
    if scheduler.running:
        return
    scheduler.start()
    schedule_archival_job(scheduler)
    schedule_tenant_isolation_job(scheduler)
    schedule_storage_cleanup_job(scheduler)
    _load_jobs()


def _load_jobs() -> None:
    scheduler = _ensure_scheduler()
    db = SessionLocal()
    try:
        pipelines = db.query(PipelineDB).filter(PipelineDB.enabled.is_(True)).all()
        for pipeline in pipelines:
            schedule_pipeline(pipeline.id, pipeline=pipeline, scheduler=scheduler)
    finally:
        db.close()


def schedule_pipeline(pipeline_id: str, pipeline: PipelineDB | None = None, scheduler: BackgroundScheduler | None = None) -> None:
    if os.getenv("SCHEDULER_ENABLED") != "1":
        return
    scheduler = scheduler or _ensure_scheduler()
    if scheduler.get_job(pipeline_id):
        scheduler.remove_job(pipeline_id)
    db = SessionLocal()
    try:
        if pipeline is None:
            pipeline = db.query(PipelineDB).filter(PipelineDB.id == pipeline_id).first()
        if not pipeline or not pipeline.enabled:
            return
        trigger = build_trigger(pipeline.cadence, pipeline.time_of_day, pipeline.day_of_week, pipeline.day_of_month)
        scheduler.add_job(run_pipeline_job, trigger, args=[pipeline.id], id=pipeline.id, replace_existing=True)
        pipeline.next_run_at = scheduler.get_job(pipeline.id).next_run_time
        db.commit()
    finally:
        db.close()


def run_pipeline_job(pipeline_id: str) -> None:
    db = SessionLocal()
    run_id = None
    try:
        pipeline = db.query(PipelineDB).filter(PipelineDB.id == pipeline_id).first()
        if not pipeline or not pipeline.enabled:
            return
        run = PipelineRunDB(
            pipeline_id=pipeline.id,
            status="running",
            started_at=datetime.now(timezone.utc),
            metadata_={},
        )
        db.add(run)
        db.commit()
        run_id = run.id
        dataset_id, metadata = execute_pipeline(pipeline, db)
        run = db.query(PipelineRunDB).filter(PipelineRunDB.id == run_id).first()
        if run:
            run.status = "success"
            run.dataset_id = dataset_id
            run.metadata_ = metadata
            run.finished_at = datetime.now(timezone.utc)
        pipeline.last_run_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        if run_id:
            run = db.query(PipelineRunDB).filter(PipelineRunDB.id == run_id).first()
            if run:
                run.status = "failed"
                run.error = str(exc)
                run.finished_at = datetime.now(timezone.utc)
                db.commit()
    finally:
        db.close()


def execute_pipeline(pipeline: PipelineDB, db) -> tuple[str, dict[str, Any]]:
    dataset_id = pipeline.dataset_id
    metadata: dict[str, Any] = {}
    if pipeline.connector:
        connector = connector_registry.get(pipeline.connector)
        if not connector:
            raise ValueError("Connector not found")
        config = pipeline.connector_config or {}
        df = connector.read(config)
        dataset_id = save_dataset(df, db, parent_id=dataset_id)
        metadata["imported_rows"] = int(df.shape[0])

    if pipeline.apply_recipe and dataset_id:
        recipe = recipe_store.get(dataset_id)
        if recipe:
            df = get_dataset_from_db(dataset_id, db)
            transformed = apply_steps(df, recipe.steps)
            dataset_id = save_dataset(transformed, db, parent_id=dataset_id)
            metadata["recipe_steps"] = len(recipe.steps)

    if dataset_id and (pipeline.run_profile or pipeline.run_insights):
        df = get_dataset_from_db(dataset_id, db)
        if pipeline.run_profile:
            profile = profile_dataframe(df)
            metadata["profile_issues"] = len(profile.get("issues", []))
        if pipeline.run_insights:
            insights = generate_insights(df)
            metadata["insight_anomalies"] = len(insights.get("anomalies", []))

    pipeline.last_run_at = datetime.now(timezone.utc)
    pipeline.last_run_metadata = metadata
    db.commit()
    return dataset_id or "", metadata
