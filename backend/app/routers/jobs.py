from fastapi import APIRouter, Header, Depends, Request, HTTPException
import uuid
import logging
from sqlalchemy.orm import Session
from ..models import ScheduledJob
from ..models_db import ScheduledJobDB
from ..db import get_db
from ..security import get_current_role, require_role
from ..services.plan_guard import resolve_user_plan, enforce_scheduling
from ..services.job_queue import verify_qstash_signature
from ..config import settings

logger = logging.getLogger(__name__)

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
    user_plan = resolve_user_plan(db, authorization)
    enforce_scheduling(user_plan)
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


# ── Phase 4: QStash worker consumer ──────────────────────────────────────────

@router.post("/worker")
async def qstash_worker(
    request: Request,
    upstash_signature: str | None = Header(default=None, alias="Upstash-Signature"),
) -> dict:
    """
    QStash job consumer endpoint.

    QStash delivers job payloads here via signed HTTP POST.  We verify the
    HMAC-SHA256 signature before dispatching any work.

    If QSTASH_TOKEN is not configured (local dev), signature verification is
    skipped so the endpoint can be called directly for testing.

    Phase 4 trigger: enable QStash delivery when pipeline jobs timeout (>30 s)
    or OOM-kill the API under concurrent load.
    """
    body = await request.body()

    # Verify signature when QStash is enabled
    if settings.qstash_token:
        if not upstash_signature:
            raise HTTPException(status_code=401, detail="Missing Upstash-Signature header")
        if not verify_qstash_signature(body, upstash_signature):
            raise HTTPException(status_code=401, detail="Invalid QStash signature")

    try:
        import json
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    job_type = payload.get("job_type", "")
    logger.info("QStash worker received job: type=%s", job_type)

    if job_type == "agent_pipeline_run":
        # Import here to avoid circular imports; run synchronously inside the worker
        from ..services.pipelines import run_pipeline_job
        dataset_id = payload.get("dataset_id")
        session_id = payload.get("session_id")
        user_id = payload.get("user_id")
        if not all([dataset_id, user_id]):
            raise HTTPException(status_code=422, detail="Missing dataset_id or user_id in payload")
        try:
            run_pipeline_job(dataset_id=dataset_id, session_id=session_id, user_id=user_id)
        except Exception as exc:
            logger.exception("Pipeline job failed: %s", exc)
            # Return 500 so QStash retries the job
            raise HTTPException(status_code=500, detail=f"Pipeline job failed: {exc}")
        return {"status": "ok", "job_type": job_type, "dataset_id": dataset_id}

    logger.warning("Unknown job_type received: %s — ignored", job_type)
    # Return 200 to prevent QStash from retrying unknown job types
    return {"status": "ignored", "job_type": job_type}
