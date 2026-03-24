from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models_db import PipelineRunV2DB
from ..controllers.cleaning_controller import CleaningController

router = APIRouter(prefix="/cleaning", tags=["cleaning"])


class CommandRequest(BaseModel):
    message: str
    session_id: str
    dataset_id: str | None = None
    workspace_id: str | None = None
    project_id: str | None = None
    pipeline_steps: list[dict[str, Any]] = Field(default_factory=list)
    plan_approved: bool = False
    pending_plan: list[dict[str, Any]] = Field(default_factory=list)
    conversation_history: list[dict[str, Any]] = Field(default_factory=list)
    secondary_dataset_ids: list[str] = Field(
        default_factory=list,
        description="Additional dataset IDs to make available for JOIN/UNION in SQL steps",
    )


class TransformationRequest(BaseModel):
    transformation: dict[str, Any]


@router.post("/datasets/{dataset_id}/analyze")
def analyze_dataset(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return CleaningController.analyze_dataset(dataset_id, authorization, db)


@router.post("/datasets/{dataset_id}/chat")
async def process_command(
    dataset_id: str,
    payload: CommandRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    async def event_stream():
        last_run_id: str | None = None
        try:
            stream = await CleaningController.process_command_stream(
                dataset_id=dataset_id,
                message=payload.message,
                session_id=payload.session_id,
                pipeline_steps=payload.pipeline_steps,
                plan_approved=payload.plan_approved,
                pending_plan=payload.pending_plan,
                workspace_id=payload.workspace_id,
                authorization=authorization,
                db=db,
                secondary_dataset_ids=payload.secondary_dataset_ids or [],
            )
            async for event in stream:
                if isinstance(event, dict):
                    event_run_id = event.get("run_id")
                    if isinstance(event_run_id, str) and event_run_id:
                        last_run_id = event_run_id

                    if event.get("type") == "agent.done":
                        done_run_id = event.get("run_id")
                        if not done_run_id and isinstance(event.get("pipeline_steps"), list):
                            for step in event.get("pipeline_steps", []):
                                if isinstance(step, dict) and isinstance(step.get("run_id"), str) and step.get("run_id"):
                                    done_run_id = step.get("run_id")
                                    break
                        if not done_run_id and payload.plan_approved:
                            latest_agent_run = (
                                db.query(PipelineRunV2DB)
                                .filter(PipelineRunV2DB.input_dataset_id == dataset_id)
                                .filter(PipelineRunV2DB.triggered_by == "agent")
                                .order_by(PipelineRunV2DB.created_at.desc())
                                .first()
                            )
                            if latest_agent_run:
                                done_run_id = str(latest_agent_run.id)
                        event = {
                            **event,
                            "run_id": done_run_id or last_run_id,
                        }
                yield _sse(event)
        except HTTPException:
            raise
        except Exception as exc:
            yield _sse({"type": "agent.error", "error": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


def _sse(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.post("/datasets/{dataset_id}/transform")
def execute_transformation(
    dataset_id: str,
    payload: TransformationRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return CleaningController.execute_transformation(
        dataset_id,
        payload.transformation,
        authorization,
        db,
    )


@router.post("/datasets/{dataset_id}/undo")
def undo_last_transformation(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return CleaningController.undo_last_transformation(dataset_id, authorization, db)


@router.get("/datasets/{dataset_id}/history")
def get_history(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return CleaningController.get_history(dataset_id, authorization, db)


@router.get("/jobs/{job_id}/status")
def get_job_status(
    job_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    return CleaningController.get_job_status(job_id, authorization)
