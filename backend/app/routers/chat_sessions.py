"""
Chat Sessions Router - Handles all conversation endpoints
Path: /api/chat/*
"""

from typing import Optional, List
from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import desc

from app.db import get_db
from app.security import get_current_subject
from app.models_db import ChatSessionDB, TransformationStepDB, PipelineV2DB, ChatSessionSnapshotDB
from app.services.chat_engine import ChatEngine, EventType, ChatEvent
from app.services.ai_operating_controls import get_ai_operating_controls
from app.services.plan_guard import resolve_user_plan
from app.services.usage_service import enforce_usage_limit, increment_usage

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _resolve_chat_plan(db: DBSession, authorization: str | None) -> str:
    return resolve_user_plan(db, authorization).lower()


@router.post("/sessions")
async def create_chat_session(
    dataset_id: str,
    initial_request: Optional[str] = None,
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Initialize a new chat session for a dataset"""
    
    user_plan = _resolve_chat_plan(db, authorization)
    engine = ChatEngine(db=db, user_id=current_user_id, workspace_id="default", user_plan=user_plan)
    
    try:
        session = await engine.create_session(
            dataset_id=dataset_id,
            initial_request=initial_request
        )
        
        return {
            "success": True,
            "data": {
                "id": str(session.id),
                "title": session.title,
                "dataset_id": str(session.dataset_id),
                "status": session.status,
                "created_at": session.created_at.isoformat(),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/sessions")
async def list_chat_sessions(
    workspace_id: Optional[str] = Query(None),
    dataset_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """List user's chat sessions with optional filtering"""
    
    query = db.query(ChatSessionDB).filter(
        ChatSessionDB.user_id == current_user_id
    )
    
    if workspace_id:
        query = query.filter(ChatSessionDB.workspace_id == workspace_id)
    if dataset_id:
        query = query.filter(ChatSessionDB.dataset_id == dataset_id)
    if status:
        query = query.filter(ChatSessionDB.status == status)
    
    total = query.count()
    
    sessions = query.order_by(desc(ChatSessionDB.created_at)).limit(limit).offset(offset).all()
    
    return {
        "success": True,
        "data": {
            "total": total,
            "sessions": [
                {
                    "id": str(s.id),
                    "title": s.title,
                    "status": s.status,
                    "dataset_id": str(s.dataset_id),
                    "message_count": len(s.messages) if s.messages else 0,
                    "created_at": s.created_at.isoformat(),
                    "updated_at": s.updated_at.isoformat(),
                }
                for s in sessions
            ]
        }
    }


@router.get("/sessions/{session_id}")
async def get_chat_session(
    session_id: str,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Get full session details including conversation history"""
    
    session = db.query(ChatSessionDB).filter(
        ChatSessionDB.id == session_id,
        ChatSessionDB.user_id == current_user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    steps = db.query(TransformationStepDB).filter(
        TransformationStepDB.chat_session_id == session_id
    ).order_by(TransformationStepDB.step_number).all()
    
    return {
        "success": True,
        "data": {
            "id": str(session.id),
            "title": session.title,
            "description": session.description,
            "status": session.status,
            "dataset_id": str(session.dataset_id),
            "messages": session.messages if session.messages else [],
            "steps": [
                {
                    "id": str(step.id),
                    "step_number": step.step_number,
                    "action_type": step.action_type,
                    "description": step.description,
                    "parameters": step.parameters,
                    "input_rows": step.input_rows,
                    "output_rows": step.output_rows,
                    "execution_time_ms": step.execution_time_ms,
                    "status": step.status,
                }
                for step in steps
            ],
            "artifacts": session.artifacts if session.artifacts else {},
            "tags": session.tags if session.tags else [],
            "pinned": session.pinned,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
        }
    }


@router.patch("/sessions/{session_id}")
async def update_chat_session(
    session_id: str,
    title: Optional[str] = None,
    tags: Optional[List[str]] = None,
    pinned: Optional[bool] = None,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Update session metadata"""
    
    session = db.query(ChatSessionDB).filter(
        ChatSessionDB.id == session_id,
        ChatSessionDB.user_id == current_user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if title:
        session.title = title
    if tags is not None:
        session.tags = tags
    if pinned is not None:
        session.pinned = pinned
    
    session.updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "data": {"id": str(session.id), "updated": True}
    }


@router.delete("/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Archive/delete a chat session"""
    
    session = db.query(ChatSessionDB).filter(
        ChatSessionDB.id == session_id,
        ChatSessionDB.user_id == current_user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.status = 'archived'
    session.updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "data": {"deleted": True}
    }


class SessionHistoryPayload(BaseModel):
    dataset_id: str
    messages: List[dict]


@router.put("/sessions/{session_id}/history")
async def upsert_session_history(
    session_id: str,
    payload: SessionHistoryPayload,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Upsert conversation history for a session (create if new, update messages if existing)"""
    session = db.query(ChatSessionDB).filter(
        ChatSessionDB.id == session_id,
        ChatSessionDB.user_id == current_user_id,
    ).first()
    if not session:
        # Look up the dataset's actual workspace_id instead of hard-coding "default",
        # which would violate a FK constraint if no workspace with that id exists.
        from app.models_db import DatasetMetaDB as _DatasetMetaDB
        ds_meta = db.query(_DatasetMetaDB).filter(
            _DatasetMetaDB.id == payload.dataset_id
        ).first()
        workspace_id = (ds_meta.workspace_id if ds_meta and ds_meta.workspace_id else None) or "default"
        session = ChatSessionDB(
            id=session_id,
            user_id=current_user_id,
            workspace_id=workspace_id,
            dataset_id=payload.dataset_id,
            title="AI Chat",
            status="active",
            messages=payload.messages,
        )
        db.add(session)
    else:
        session.messages = payload.messages
        session.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True}


@router.post("/sessions/{session_id}/messages")
async def send_message_to_session(
    session_id: str,
    content: str,
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """
    Send message to session and get streaming response
    Returns Server-Sent Events stream
    """
    
    session = db.query(ChatSessionDB).filter(
        ChatSessionDB.id == session_id,
        ChatSessionDB.user_id == current_user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    user_plan = _resolve_chat_plan(db, authorization)

    # Enforce and count the AI chat call
    enforce_usage_limit(current_user_id, user_plan, "api_calls", db)
    increment_usage(current_user_id, "api_calls", db)

    engine = ChatEngine(
        db=db,
        user_id=current_user_id,
        workspace_id=session.workspace_id,
        user_plan=user_plan
    )
    ai_controls = get_ai_operating_controls()
    
    async def event_generator():
        """Generate SSE events for streaming response"""
        event_count = 0
        async for event in engine.process_message(
            session_id=session_id,
            user_message=content,
            dataset_id=str(session.dataset_id)
        ):
            if event_count >= ai_controls.max_stream_events:
                capped_event = ChatEvent(
                    type=EventType.DONE,
                    content="Stream event cap reached",
                    data={"max_stream_events": ai_controls.max_stream_events},
                )
                yield capped_event.to_sse()
                break
            event_count += 1
            yield event.to_sse()
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


@router.post("/sessions/{session_id}/save-as-pipeline")
async def save_session_as_pipeline(
    session_id: str,
    name: str,
    description: Optional[str] = None,
    make_public: bool = False,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """
    Save chat session as a reproducible pipeline
    Captures all steps for reuse on similar datasets
    """
    
    session = db.query(ChatSessionDB).filter(
        ChatSessionDB.id == session_id,
        ChatSessionDB.user_id == current_user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    steps = db.query(TransformationStepDB).filter(
        TransformationStepDB.chat_session_id == session_id
    ).order_by(TransformationStepDB.step_number).all()
    
    pipeline_steps = [
        {
            "id": str(step.id),
            "step_number": step.step_number,
            "action_type": step.action_type,
            "description": step.description,
            "parameters": step.parameters,
        }
        for step in steps
    ]
    
    pipeline = PipelineV2DB(
        id=str(uuid.uuid4()),
        user_id=current_user_id,
        workspace_id=session.workspace_id,
        name=name,
        description=description,
        type='manual',
        status='saved',
        steps=pipeline_steps,
        execution_config={},
        version=1,
        is_public=make_public,
    )
    
    db.add(pipeline)
    db.commit()
    
    session.pipeline_id = pipeline.id
    db.commit()
    
    return {
        "success": True,
        "data": {
            "id": str(pipeline.id),
            "name": pipeline.name,
            "version": pipeline.version,
            "status": pipeline.status,
            "steps_count": len(pipeline_steps),
        }
    }


@router.post("/sessions/{session_id}/create-checkpoint")
async def create_session_checkpoint(
    session_id: str,
    checkpoint_type: str = "manual",
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Create a snapshot of current session state for rollback"""
    
    session = db.query(ChatSessionDB).filter(
        ChatSessionDB.id == session_id,
        ChatSessionDB.user_id == current_user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    version = db.query(ChatSessionSnapshotDB).filter(
        ChatSessionSnapshotDB.session_id == session_id
    ).count() + 1
    
    snapshot = ChatSessionSnapshotDB(
        id=str(uuid.uuid4()),
        session_id=session_id,
        version=version,
        snapshot_type=checkpoint_type,
        messages_count=len(session.messages) if session.messages else 0,
        dataset_state={'messages': session.messages if session.messages else []},
    )
    
    db.add(snapshot)
    db.commit()
    
    return {
        "success": True,
        "data": {
            "id": str(snapshot.id),
            "version": snapshot.version,
            "created_at": snapshot.created_at.isoformat(),
        }
    }


@router.post("/sessions/{session_id}/rollback/{snapshot_version}")
async def rollback_to_checkpoint(
    session_id: str,
    snapshot_version: int,
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Restore session to a previous checkpoint"""
    
    session = db.query(ChatSessionDB).filter(
        ChatSessionDB.id == session_id,
        ChatSessionDB.user_id == current_user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    snapshot = db.query(ChatSessionSnapshotDB).filter(
        ChatSessionSnapshotDB.session_id == session_id,
        ChatSessionSnapshotDB.version == snapshot_version
    ).first()
    
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    
    session.messages = snapshot.dataset_state.get('messages', []) if snapshot.dataset_state else []
    session.updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "data": {
            "restored": True,
            "version": snapshot_version,
        }
    }


@router.post("/sessions/{session_id}/update-data")
async def update_session_data(
    session_id: str,
    new_dataset_id: str,
    new_dataset_name: str,
    authorization: str | None = Header(default=None),
    current_user_id: str = Depends(get_current_subject),
    db: DBSession = Depends(get_db),
):
    """Update the dataset for an active session while preserving chat history"""
    
    session = db.query(ChatSessionDB).filter(
        ChatSessionDB.id == session_id,
        ChatSessionDB.user_id == current_user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    user_plan = _resolve_chat_plan(db, authorization)
    engine = ChatEngine(db=db, user_id=current_user_id, workspace_id="default", user_plan=user_plan)
    
    try:
        result = engine.handle_data_update(
            session_id=session_id,
            new_dataset_id=new_dataset_id,
            new_dataset_name=new_dataset_name
        )
        
        return {
            "success": True,
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
