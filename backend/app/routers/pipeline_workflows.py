"""
Pipeline Workflows Router - Reusable workflow operations
Path: /api/pipelines/*
"""

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from app.db import get_db
from app.security import get_current_subject
from app.services.plan_guard import resolve_user_plan
from app.services.pipeline_engine import PipelineEngine
from app.services.rate_limiter import limiter
from app.services.audit import audit_store
from app.models import AuditEntry

router = APIRouter(prefix="/api/pipelines", tags=["pipeline-workflows"])


def _resolve_pipeline_engine(
    db: DBSession,
    current_user_id: str,
    authorization: str | None,
) -> PipelineEngine:
    user_plan = resolve_user_plan(db, authorization).lower()
    return PipelineEngine(db=db, user_id=current_user_id, user_plan=user_plan)


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
    extra_input_dataset_ids: Optional[List[str]] = None
    """Additional dataset IDs to register as named relations (by dataset name) in SQL steps."""


class ClonePipelineRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    workspace_id: Optional[str] = None


class CreateFromTemplateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    workspace_id: str = "default"


# ── Template endpoints ────────────────────────────────────────────────────────

@router.get("/templates")
async def list_pipeline_templates(
    category: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
):
    """Return available built-in pipeline templates."""
    from app.services.pipeline_template_service import list_templates
    templates = list_templates(category=category, tag=tag)
    # Lightweight response — omit full steps list for the listing
    return {
        "templates": [
            {
                "id": t["id"],
                "name": t["name"],
                "description": t["description"],
                "category": t["category"],
                "tags": t["tags"],
                "steps_count": len(t["steps"]),
            }
            for t in templates
        ]
    }


@router.get("/templates/{template_id}")
async def get_pipeline_template(
    template_id: str,
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
):
    """Return full template definition including steps."""
    from app.services.pipeline_template_service import get_template
    template = get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"template": template}


@router.post("/templates/{template_id}/instantiate")
async def instantiate_pipeline_template(
    template_id: str,
    payload: CreateFromTemplateRequest,
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Create a new pipeline pre-populated with a template's steps."""
    from app.services.pipeline_template_service import get_template
    template = get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)
    pipeline = engine.create_pipeline(
        name=payload.name or template["name"],
        steps=template["steps"],
        description=payload.description or template["description"],
        workspace_id=payload.workspace_id,
        execution_config={},
        is_public=False,
    )
    return {
        "success": True,
        "data": {
            "id": str(pipeline.id),
            "name": pipeline.name,
            "status": pipeline.status,
            "version": pipeline.version,
            "steps_count": len(pipeline.steps),
            "template_id": template_id,
        },
    }


@router.post("")
async def create_pipeline(
    payload: CreatePipelineRequest,
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Create a new pipeline"""

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)

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
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """List user's pipelines"""

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)

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
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Get pipeline details"""

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)

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
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Update pipeline"""

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)

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
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Publish pipeline for execution"""

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)

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
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Clone an existing pipeline to a new draft pipeline"""

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)

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
@limiter.limit("5/minute")
async def execute_pipeline(
    request: Request,
    pipeline_id: str,
    payload: RunPipelineRequest,
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Execute a pipeline with SSE streaming"""
    from app.services.usage_service import enforce_usage_limit, increment_usage as _inc_usage
    user_plan = resolve_user_plan(db, authorization)
    enforce_usage_limit(current_user_id, user_plan, "pipeline_runs", db)
    _inc_usage(current_user_id, "pipeline_runs", db)
    # Audit trail
    try:
        audit_store.add(AuditEntry(
            action="pipeline.run",
            actor=current_user_id,
            target=f"pipeline:{pipeline_id}",
            metadata={"input_dataset_id": payload.input_dataset_id, "triggered_by": payload.triggered_by},
        ))
    except Exception:
        pass

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)

    async def event_generator():
        async for event in engine.execute_pipeline(
            pipeline_id=pipeline_id,
            input_dataset_id=payload.input_dataset_id,
            session_id=payload.session_id,
            runtime_parameters=payload.runtime_parameters,
            triggered_by=payload.triggered_by,
            extra_input_dataset_ids=payload.extra_input_dataset_ids,
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
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Get execution history for a pipeline"""

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)

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
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Get detailed information about a pipeline run"""

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)

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
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Get a standardized artifact package for a run"""

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)

    try:
        artifact = engine.get_run_artifact(run_id=run_id, preview_limit=preview_limit)
        return {
            "success": True,
            "data": artifact,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
