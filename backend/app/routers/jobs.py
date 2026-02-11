from fastapi import APIRouter, Header, Depends
import uuid
from sqlalchemy.orm import Session
from ..models import ScheduledJob
from ..models_db import ScheduledJobDB
from ..db import get_db
from ..security import get_current_role, require_role

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/", response_model=ScheduledJob)
def create_job(
    name: str,
    cron: str,
    action: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ScheduledJob:
    role = get_current_role(authorization)
    require_role("editor", role)
    job_id = str(uuid.uuid4())
    db.add(ScheduledJobDB(id=job_id, name=name, cron=cron, action=action, status="scheduled"))
    db.commit()
    return ScheduledJob(job_id=job_id, name=name, cron=cron, action=action, status="scheduled")


@router.get("/", response_model=list[ScheduledJob])
def list_jobs(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> list[ScheduledJob]:
    role = get_current_role(authorization)
    require_role("viewer", role)
    rows = db.query(ScheduledJobDB).order_by(ScheduledJobDB.created_at.desc()).all()
    return [
        ScheduledJob(
            job_id=row.id,
            name=row.name,
            cron=row.cron,
            action=row.action,
            status=row.status,
        )
        for row in rows
    ]
