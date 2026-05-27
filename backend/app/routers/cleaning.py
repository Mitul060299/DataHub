
import json
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..models_db import PipelineRunV2DB
from ..controllers.cleaning_controller import CleaningController
from ..services.rate_limiter import limiter

router = APIRouter(prefix="/cleaning", tags=["cleaning"])


class CommandRequest(BaseModel):
    message: str
    session_id: str
    dataset_id: str | None = None
    project_id: str | None = None
    pipeline_steps: list[dict[str, Any]] = Field(default_factory=list)
    plan_approved: bool = False
    plan_pending_modification: bool = False
    pending_plan: list[dict[str, Any]] = Field(default_factory=list)
    conversation_history: list[dict[str, Any]] = Field(default_factory=list)
    secondary_dataset_ids: list[str] = Field(
        default_factory=list,
        description="Additional dataset IDs to make available for JOIN/UNION in SQL steps",
    )


class TransformationRequest(BaseModel):
    transformation: dict[str, Any]


class AnalyzeRequest(BaseModel):
    session_id: str | None = None
    table_name: str | None = None
    pipeline_steps: list[dict[str, Any]] = Field(
        default_factory=list,
        description=(
            "Client-known pipeline steps with sql + output_table. Used to replay "
            "the DuckDB session if it was lost (refresh / restart) without depending "
            "on the previous request's PipelineStepDB write being committed yet."
        ),
    )


@router.post("/datasets/{dataset_id}/analyze")
def analyze_dataset(
    dataset_id: str,
    payload: AnalyzeRequest | None = None,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return CleaningController.analyze_dataset(
        dataset_id, authorization, db,
        session_id=payload.session_id if payload else None,
        table_name=payload.table_name if payload else None,
        client_pipeline_steps=(payload.pipeline_steps if payload else None) or None,
    )


@router.post("/datasets/{dataset_id}/chat", response_class=StreamingResponse)
@limiter.limit("60/minute")
async def process_command(
    request: Request,
    dataset_id: str,
    payload: CommandRequest,
    authorization: str | None = Header(default=None),
):
    async def event_stream():
        import asyncio as _asyncio
        last_run_id: str | None = None
        try:
            stream = await CleaningController.process_command_stream(
                dataset_id=dataset_id,
                message=payload.message,
                session_id=payload.session_id,
                pipeline_steps=payload.pipeline_steps,
                plan_approved=payload.plan_approved,
                pending_plan=payload.pending_plan,
                project_id=payload.project_id,
                authorization=authorization,
                secondary_dataset_ids=payload.secondary_dataset_ids or [],
                conversation_history=payload.conversation_history or [],
                plan_pending_modification=payload.plan_pending_modification,
            )
            # Drive the async iterator manually so we can inject ": keep-alive\n\n"
            # SSE comments every 15 s.  This prevents Render / Caddy / nginx from
            # closing the connection during slow LLM inference (30 s no-data timeout).
            _aiter = stream.__aiter__()
            _next_task: _asyncio.Task = _asyncio.create_task(_aiter.__anext__())
            try:
                while True:
                    _done, _ = await _asyncio.wait({_next_task}, timeout=5.0)
                    if not _done:
                        yield ": keep-alive\n\n"
                        continue
                    try:
                        event = _next_task.result()
                    except StopAsyncIteration:
                        break
                    _next_task = _asyncio.create_task(_aiter.__anext__())
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
                                _db = SessionLocal()
                                try:
                                    latest_agent_run = (
                                        _db.query(PipelineRunV2DB)
                                        .filter(PipelineRunV2DB.input_dataset_id == dataset_id)
                                        .filter(PipelineRunV2DB.triggered_by == "agent")
                                        .order_by(PipelineRunV2DB.created_at.desc())
                                        .first()
                                    )
                                    if latest_agent_run:
                                        done_run_id = str(latest_agent_run.id)
                                finally:
                                    _db.close()
                            event = {
                                **event,
                                "run_id": done_run_id or last_run_id,
                            }
                    yield _sse(event)
            finally:
                if not _next_task.done():
                    _next_task.cancel()
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
    return f"data: {json.dumps(data, default=str)}\n\n"


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


class RewriteStepRequest(BaseModel):
    """Rewrite a single pipeline step's SQL using a natural-language instruction.

    The backend calls a lightweight LLM with the current SQL, the dataset
    schema at the point *before* this step, and the user's plain-English
    change request.  It returns the rewritten SQL and an updated description.
    No DuckDB execution happens here — the caller applies the result via replay.
    """
    current_sql: str
    current_description: str
    user_message: str
    columns: list[str] = Field(default_factory=list, description="Column names available at this step's input")


class ReplayRequest(BaseModel):
    """Replay a chain of pipeline steps starting from pivot_dataset_id.

    Each step dict must contain at minimum a ``sql`` key with the DuckDB
    SQL that was used to produce its output.  The full ``rawConfig`` stored
    by the frontend can be passed in as-is.

    If *up_to_step_number* is provided (1-based), only steps with
    ``step_number <= up_to_step_number`` will be executed.  This supports
    the "Run up to here" feature: the frontend slices ``steps`` to the
    target step and sets this field accordingly so the controller can apply
    the snapshot fast-path when the target step already has a persisted
    Parquet snapshot.
    """
    steps: list[dict[str, Any]] = Field(default_factory=list)
    up_to_step_number: int | None = Field(default=None, ge=1)


@router.post("/datasets/{dataset_id}/replay")
def replay_steps(
    dataset_id: str,
    payload: ReplayRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Re-execute a list of steps against *dataset_id* as the pivot/base.

    Used for surgical mid-pipeline step removal: after splicing out step N,
    the frontend calls this with the steps that followed N, starting from
    the output dataset of step N-1.

    Also used for "Run up to here": the frontend passes a truncated steps
    list and sets ``up_to_step_number`` so the controller can short-circuit
    via the target step's Parquet snapshot when available.

    Returns the updated chain so the frontend can patch the steps array and
    set the active dataset to *final_dataset_id*.
    """
    return CleaningController.replay_steps(
        dataset_id, payload.steps, authorization, db,
        up_to_step_number=payload.up_to_step_number,
    )


@router.post("/datasets/{dataset_id}/rewrite-step")
async def rewrite_step(
    dataset_id: str,
    payload: RewriteStepRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Use an LLM to rewrite a single step's SQL based on a plain-English instruction.

    Returns ``{"new_sql": str, "new_description": str}``.
    No DuckDB execution is performed — the caller applies the result via /replay.
    """
    return await CleaningController.rewrite_step(
        dataset_id,
        payload.current_sql,
        payload.current_description,
        payload.user_message,
        payload.columns,
        authorization,
        db,
    )
