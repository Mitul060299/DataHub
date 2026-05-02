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
from app.services.plan_guard import resolve_user_plan, resolve_user_plan_by_id
from app.services.pipeline_engine import PipelineEngine
from app.services.rate_limiter import limiter
from app.services.audit import audit_store
from app.models import AuditEntry
from app.models_db import PipelineV2DB
from app.services.project_access import list_visible_owner_user_ids

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


class CreateFromTemplateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class SharePipelineRequest(BaseModel):
    tags: Optional[List[str]] = None
    description: Optional[str] = None


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
        workspace_id="default",
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
        workspace_id="default",
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
    status: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """List user's pipelines"""

    engine = _resolve_pipeline_engine(db, current_user_id, authorization)

    visible = {current_user_id}
    visible.update(list_visible_owner_user_ids(current_user_id, db))
    visible = list(visible)
    pipelines, total = engine.list_pipelines(
        status=status,
        limit=limit,
        offset=offset,
        visible_user_ids=visible,
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
                    "is_public": bool(p.is_public),
                    "created_at": p.created_at.isoformat(),
                    "updated_at": p.updated_at.isoformat(),
                }
                for p in pipelines
            ]
        }
    }


@router.get("/marketplace")
async def list_marketplace_pipelines(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: DBSession = Depends(get_db),
):
    """List built-in templates + community-published pipelines for the Marketplace."""
    from app.services.pipeline_template_service import list_templates

    # ── Built-in templates ────────────────────────────────────────────────────
    built_in = list_templates(category=category)
    if search:
        q = search.lower()
        built_in = [
            t for t in built_in
            if q in t["name"].lower()
            or q in t["description"].lower()
            or any(q in tag for tag in t["tags"])
        ]
    templates_out = [
        {
            "source": "official",
            "id": t["id"],
            "name": t["name"],
            "description": t["description"],
            "category": t["category"],
            "tags": t["tags"],
            "steps_count": len(t["steps"]),
            "author": "DataHub",
            "clones": 0,
        }
        for t in built_in
    ]

    # ── Community pipelines (is_public=True) ─────────────────────────────────
    from app.models_db import User as UserDB

    query = db.query(PipelineV2DB).filter(PipelineV2DB.is_public.is_(True))
    if category:
        query = query.filter(PipelineV2DB.tags.contains([category]))
    if search:
        q_like = f"%{search}%"
        from sqlalchemy import or_
        query = query.filter(
            or_(
                PipelineV2DB.name.ilike(q_like),
                PipelineV2DB.description.ilike(q_like),
            )
        )
    total_community = query.count()
    community_rows = query.order_by(PipelineV2DB.updated_at.desc()).limit(limit).offset(offset).all()

    # Build a user_id → display name lookup
    user_ids = list({str(p.user_id) for p in community_rows})
    users = db.query(UserDB.id, UserDB.username).filter(UserDB.id.in_(user_ids)).all() if user_ids else []
    user_map = {str(u.id): (u.username or "Anonymous") for u in users}

    community_out = [
        {
            "source": "community",
            "id": str(p.id),
            "name": p.name,
            "description": p.description or "",
            "category": (p.tags[0] if p.tags else "General"),
            "tags": p.tags or [],
            "steps_count": len(p.steps or []),
            "author": user_map.get(str(p.user_id), "Anonymous"),
            "clones": 0,
        }
        for p in community_rows
    ]

    return {
        "success": True,
        "data": {
            "templates": templates_out,
            "community": community_out,
            "total_community": total_community,
        },
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


@router.post("/{pipeline_id}/share")
async def share_pipeline_to_marketplace(
    pipeline_id: str,
    payload: SharePipelineRequest,
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Publish a pipeline to the public Marketplace (sets is_public=True)."""
    from datetime import datetime

    pipeline = (
        db.query(PipelineV2DB)
        .filter(PipelineV2DB.id == pipeline_id, PipelineV2DB.user_id == current_user_id)
        .first()
    )
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    pipeline.is_public = True
    pipeline.status = "published"
    if payload.description is not None:
        pipeline.description = payload.description
    if payload.tags is not None:
        pipeline.tags = payload.tags
    pipeline.updated_at = datetime.utcnow()
    db.commit()

    return {
        "success": True,
        "data": {
            "id": str(pipeline.id),
            "name": pipeline.name,
            "is_public": True,
        },
    }


@router.delete("/{pipeline_id}/share")
async def unshare_pipeline_from_marketplace(
    pipeline_id: str,
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Remove a pipeline from the public Marketplace (sets is_public=False)."""
    from datetime import datetime

    pipeline = (
        db.query(PipelineV2DB)
        .filter(PipelineV2DB.id == pipeline_id, PipelineV2DB.user_id == current_user_id)
        .first()
    )
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    pipeline.is_public = False
    pipeline.updated_at = datetime.utcnow()
    db.commit()

    return {"success": True, "data": {"id": str(pipeline.id), "is_public": False}}


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
            workspace_id="default",
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
    billing_user_id = current_user_id
    billing_plan = resolve_user_plan_by_id(current_user_id, db)
    enforce_usage_limit(billing_user_id, billing_plan, "pipeline_runs", db)
    _inc_usage(billing_user_id, "pipeline_runs", db)
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

    # Fetch pipeline name for post-run notification (best-effort)
    _pipeline_name = pipeline_id
    try:
        _pl = engine.get_pipeline(pipeline_id)
        if _pl:
            _pipeline_name = getattr(_pl, "name", pipeline_id)
    except Exception:
        pass

    async def event_generator():
        final_status = "completed"
        try:
            async for event in engine.execute_pipeline(
                pipeline_id=pipeline_id,
                input_dataset_id=payload.input_dataset_id,
                session_id=payload.session_id,
                runtime_parameters=payload.runtime_parameters,
                triggered_by=payload.triggered_by,
                extra_input_dataset_ids=payload.extra_input_dataset_ids,
            ):
                data = event.to_sse()
                if "error" in data.lower():
                    final_status = "failed"
                yield data
        except Exception:
            final_status = "failed"
            raise
        finally:
            # Send pipeline complete email (fire-and-forget)
            try:
                from app.services.email_service import send_pipeline_complete
                from app.models_db import User as UserDB
                from app.db import SessionLocal
                _db2 = SessionLocal()
                try:
                    u = _db2.query(UserDB).filter(UserDB.id == current_user_id).first()
                    to_email = (u.username if u else None) or current_user_id
                finally:
                    _db2.close()
                send_pipeline_complete(
                    to=to_email,
                    pipeline_name=_pipeline_name,
                    pipeline_id=pipeline_id,
                    status=final_status,
                )
            except Exception:
                pass

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


# ── Natural-Language Pipeline Editing ─────────────────────────────────────────

class NLEditRequest(BaseModel):
    prompt: str = Field(..., min_length=4, max_length=1000,
                        description="Plain-English instruction to modify the pipeline")
    dataset_id: str | None = Field(
        default=None,
        description="Optional dataset ID — used to inject column schema and sample rows into the LLM prompt",
    )


@router.post("/{pipeline_id}/nl-edit")
@limiter.limit("15/minute")
async def nl_edit_pipeline_endpoint(
    request: Request,
    pipeline_id: str,
    payload: NLEditRequest,
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
) -> dict:
    """Apply a plain-English edit instruction to the pipeline steps via LLM.

    The pipeline steps are updated in-place and the pipeline version is bumped.
    Returns the updated pipeline object together with a change summary.

    When `dataset_id` is supplied in the request body the LLM is given the full
    column schema and up to 3 sample rows so it can use exact column names.
    If the first LLM call fails the endpoint retries once with the error message
    included so the LLM can self-correct.
    """
    from app.services.nl_pipeline_service import nl_edit_pipeline
    from app.services.duckdb_service import DuckDBService
    from app.models_db import DatasetMetaDB
    from datetime import datetime

    pipeline = (
        db.query(PipelineV2DB)
        .filter(PipelineV2DB.id == pipeline_id, PipelineV2DB.user_id == current_user_id)
        .first()
    )
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    current_steps: list = list(pipeline.steps or [])

    # ── Fetch dataset schema & sample rows for LLM context ────────────────────
    dataset_schema: dict | None = None
    sample_rows: list | None = None
    if payload.dataset_id:
        try:
            ds = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == payload.dataset_id).first()
            if ds:
                raw_schema = ds.schema_json or {}
                # Normalise schema to {col_name: dtype_string}
                if isinstance(raw_schema, dict):
                    dataset_schema = {
                        col: (
                            str(meta.get("type", "unknown"))
                            if isinstance(meta, dict)
                            else str(meta)
                        )
                        for col, meta in raw_schema.items()
                    }
                # Fetch 3 sample rows from DuckDB
                if ds.storage_path:
                    try:
                        sample_rows = DuckDBService.query_parquet(
                            ds.storage_path,
                            "SELECT * FROM dataset LIMIT 3",
                            dataset_id=ds.id,
                        )
                    except Exception:
                        sample_rows = None
        except Exception:
            pass  # Schema is optional — don't fail the whole request

    # ── First LLM attempt ─────────────────────────────────────────────────────
    result = nl_edit_pipeline(
        current_steps,
        payload.prompt,
        dataset_schema=dataset_schema,
        sample_rows=sample_rows,
    )

    # ── Auto-retry on error (once) with self-correction context ───────────────
    if result.get("steps") is None:
        prior_error = result.get("error", "LLM returned no steps.")
        result = nl_edit_pipeline(
            current_steps,
            payload.prompt,
            dataset_schema=dataset_schema,
            sample_rows=sample_rows,
            prior_error=prior_error,
        )

    if result.get("steps") is None:
        raise HTTPException(
            status_code=422,
            detail=result.get("error", "LLM did not return updated steps"),
        )

    new_steps = result["steps"]
    change_summary = result.get("change_summary", "Pipeline updated.")

    # Persist the new steps and bump version
    pipeline.steps = new_steps
    pipeline.version = (pipeline.version or 1) + 1
    pipeline.updated_at = datetime.utcnow()
    db.commit()

    # Audit
    try:
        audit_store.add(AuditEntry(
            action="pipeline.nl_edit",
            actor=current_user_id,
            target=f"pipeline:{pipeline_id}",
            metadata={"prompt": payload.prompt[:120], "change_summary": change_summary},
        ))
    except Exception:
        pass

    return {
        "pipeline_id": pipeline_id,
        "name": pipeline.name,
        "version": pipeline.version,
        "steps": new_steps,
        "change_summary": change_summary,
    }
