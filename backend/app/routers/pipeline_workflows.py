"""
Pipeline Workflows Router - Reusable workflow operations
Path: /api/pipelines/*
"""

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from app.db import get_db
from app.security import get_current_subject
from app.services.pipeline_engine import PipelineEngine

router = APIRouter(prefix="/api/pipelines", tags=["pipeline-workflows"])


class CreatePipelineRequest(BaseModel):
    name: str
    steps: List[dict]
    description: Optional[str] = None
    workspace_id: str = "default"
    is_public: bool = False
    execution_config: Dict[str, Any] = Field(default_factory=dict)


class UpdatePipelineRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[List[dict]] = None
    execution_config: Optional[Dict[str, Any]] = None


class RunPipelineRequest(BaseModel):
    input_dataset_id: str
    session_id: Optional[str] = None
    runtime_parameters: Dict[str, Any] = Field(default_factory=dict)
    triggered_by: str = "manual"


class ClonePipelineRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    workspace_id: Optional[str] = None


@router.post("")
async def create_pipeline(
    payload: CreatePipelineRequest,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Create a new pipeline"""

    user_plan = "free"
    engine = PipelineEngine(db=db, user_id=current_user_id, user_plan=user_plan)

    pipeline = engine.create_pipeline(
        name=payload.name,
        steps=payload.steps,
        description=payload.description,
        workspace_id=payload.workspace_id,
        execution_config=payload.execution_config,
        is_public=payload.is_public,
    )

    return {
        "success": True,
        "data": {
            "id": str(pipeline.id),
            "name": pipeline.name,
            "status": pipeline.status,
            "version": pipeline.version,
            "steps_count": len(pipeline.steps),
        }
    }


@router.get("")
async def list_pipelines(
    workspace_id: Optional[str] = "default",
    status: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """List user's pipelines"""

    user_plan = "free"
    engine = PipelineEngine(db=db, user_id=current_user_id, user_plan=user_plan)

    pipelines, total = engine.list_pipelines(
        workspace_id=workspace_id,
        status=status,
        limit=limit,
        offset=offset,
    )

    return {
        "success": True,
        "data": {
            "total": total,
            "pipelines": [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "description": p.description,
                    "status": p.status,
                    "version": p.version,
                    "steps_count": len(p.steps),
                    "created_at": p.created_at.isoformat(),
                    "updated_at": p.updated_at.isoformat(),
                }
                for p in pipelines
            ]
        }
    }


@router.get("/{pipeline_id}")
async def get_pipeline(
    pipeline_id: str,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Get pipeline details"""

    user_plan = "free"
    engine = PipelineEngine(db=db, user_id=current_user_id, user_plan=user_plan)

    pipeline = engine.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    return {
        "success": True,
        "data": {
            "id": str(pipeline.id),
            "name": pipeline.name,
            "description": pipeline.description,
            "status": pipeline.status,
            "steps": pipeline.steps,
            "execution_config": pipeline.execution_config,
            "version": pipeline.version,
            "checksum": pipeline.checksum,
            "is_public": pipeline.is_public,
            "created_at": pipeline.created_at.isoformat(),
            "updated_at": pipeline.updated_at.isoformat(),
        }
    }


@router.patch("/{pipeline_id}")
async def update_pipeline(
    pipeline_id: str,
    payload: UpdatePipelineRequest,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Update pipeline"""

    user_plan = "free"
    engine = PipelineEngine(db=db, user_id=current_user_id, user_plan=user_plan)

    try:
        pipeline = engine.update_pipeline(
            pipeline_id=pipeline_id,
            name=payload.name,
            description=payload.description,
            steps=payload.steps,
            execution_config=payload.execution_config,
        )

        return {
            "success": True,
            "data": {
                "id": str(pipeline.id),
                "version": pipeline.version,
                "updated": True,
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{pipeline_id}/publish")
async def publish_pipeline(
    pipeline_id: str,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Publish pipeline for execution"""

    user_plan = "free"
    engine = PipelineEngine(db=db, user_id=current_user_id, user_plan=user_plan)

    try:
        pipeline = engine.publish_pipeline(pipeline_id)
        return {
            "success": True,
            "data": {
                "id": str(pipeline.id),
                "status": pipeline.status,
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{pipeline_id}/clone")
async def clone_pipeline(
    pipeline_id: str,
    payload: ClonePipelineRequest,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Clone an existing pipeline to a new draft pipeline"""

    user_plan = "free"
    engine = PipelineEngine(db=db, user_id=current_user_id, user_plan=user_plan)

    try:
        pipeline = engine.clone_pipeline(
            pipeline_id=pipeline_id,
            name=payload.name,
            description=payload.description,
            workspace_id=payload.workspace_id,
        )
        return {
            "success": True,
            "data": {
                "id": str(pipeline.id),
                "name": pipeline.name,
                "status": pipeline.status,
                "version": pipeline.version,
                "parent_pipeline_id": pipeline.parent_pipeline_id,
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{pipeline_id}/run")
async def execute_pipeline(
    pipeline_id: str,
    payload: RunPipelineRequest,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Execute a pipeline with SSE streaming"""

    user_plan = "free"
    engine = PipelineEngine(db=db, user_id=current_user_id, user_plan=user_plan)

    async def event_generator():
        async for event in engine.execute_pipeline(
            pipeline_id=pipeline_id,
            input_dataset_id=payload.input_dataset_id,
            session_id=payload.session_id,
            runtime_parameters=payload.runtime_parameters,
            triggered_by=payload.triggered_by,
        ):
            yield event.to_sse()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/{pipeline_id}/runs")
async def get_pipeline_runs(
    pipeline_id: str,
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Get execution history for a pipeline"""

    user_plan = "free"
    engine = PipelineEngine(db=db, user_id=current_user_id, user_plan=user_plan)

    runs, total = engine.get_pipeline_runs(
        pipeline_id=pipeline_id,
        limit=limit,
        offset=offset,
    )

    return {
        "success": True,
        "data": {
            "total": total,
            "runs": [
                {
                    "id": str(r.id),
                    "status": r.status,
                    "triggered_by": r.triggered_by,
                    "started_at": r.started_at.isoformat() if r.started_at else None,
                    "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                    "metrics": r.metrics if r.metrics else {},
                }
                for r in runs
            ]
        }
    }


@router.get("/runs/{run_id}")
async def get_run_details(
    run_id: str,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Get detailed information about a pipeline run"""

    user_plan = "free"
    engine = PipelineEngine(db=db, user_id=current_user_id, user_plan=user_plan)

    run = engine.get_run_details(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    return {
        "success": True,
        "data": {
            "id": str(run.id),
            "pipeline_id": str(run.pipeline_id),
            "status": run.status,
            "input_dataset_id": str(run.input_dataset_id) if run.input_dataset_id else None,
            "output_dataset_id": str(run.output_dataset_id) if run.output_dataset_id else None,
            "step_results": run.step_results if run.step_results else {},
            "execution_log": run.execution_log if run.execution_log else [],
            "metrics": run.metrics if run.metrics else {},
            "error_message": run.error_message,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        }
    }


@router.get("/runs/{run_id}/artifact")
async def get_run_artifact(
    run_id: str,
    preview_limit: int = Query(100, ge=1, le=1000),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Get a standardized artifact package for a run"""

    user_plan = "free"
    engine = PipelineEngine(db=db, user_id=current_user_id, user_plan=user_plan)

    try:
        artifact = engine.get_run_artifact(run_id=run_id, preview_limit=preview_limit)
        return {
            "success": True,
            "data": artifact,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
