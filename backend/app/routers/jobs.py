from fastapi import APIRouter, Header
import uuid
from ..models import ScheduledJob
from ..services.jobs import job_store
from ..security import get_current_role, require_role

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/", response_model=ScheduledJob)
def create_job(name: str, cron: str, action: str, authorization: str | None = Header(default=None)) -> ScheduledJob:
    role = get_current_role(authorization)
    require_role("editor", role)
    job = ScheduledJob(job_id=str(uuid.uuid4()), name=name, cron=cron, action=action, status="scheduled")
    job_store.save(job)
    return job


@router.get("/", response_model=list[ScheduledJob])
def list_jobs() -> list[ScheduledJob]:
    return job_store.list()
