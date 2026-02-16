from __future__ import annotations

from datetime import datetime, timedelta, timezone

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models_db import DatasetMetaDB
from .object_storage import StorageService


def schedule_archival_job(scheduler) -> None:
    if not settings.enable_auto_archival:
        return
    scheduler.add_job(run_archival_job, CronTrigger(hour=2, minute=0, timezone=timezone.utc), id="dataset-archival", replace_existing=True)


def run_archival_job() -> None:
    db: Session = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        cold_cutoff = now - timedelta(days=90)
        archived_cutoff = now - timedelta(days=180)

        cold_datasets = (
            db.query(DatasetMetaDB)
            .filter(DatasetMetaDB.last_queried_at < cold_cutoff)
            .filter(DatasetMetaDB.access_tier == "hot")
            .filter(DatasetMetaDB.storage_provider == "s3")
            .all()
        )

        for dataset in cold_datasets:
            if dataset.storage_path:
                StorageService.archive_to_glacier(dataset.storage_path)
                dataset.access_tier = "cold"

        archived_datasets = (
            db.query(DatasetMetaDB)
            .filter(DatasetMetaDB.last_queried_at < archived_cutoff)
            .filter(DatasetMetaDB.access_tier == "cold")
            .all()
        )

        for dataset in archived_datasets:
            dataset.access_tier = "archived"

        db.commit()
    finally:
        db.close()
