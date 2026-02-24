"""
Full Auto Routes
API endpoints for autonomous agent orchestration
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.security import get_current_subject
from app.controllers.full_auto_controller import FullAutoController


router = APIRouter(prefix='/api/auto', tags=['auto'])


def get_controller(db: Session = Depends(get_db)) -> FullAutoController:
    """Get controller instance with database session"""
    return FullAutoController(db)


class AutoRunRequest(BaseModel):
    """Request to start autonomous analysis"""
    dataset_id: str
    user_request: str


class SessionResponse(BaseModel):
    """Response containing session details"""
    id: str
    title: str
    status: str
    created_at: str
    total_steps: int
    completed_steps: int


@router.get('/run')
async def start_auto_analysis(
    dataset_id: str,
    user_request: str,
    current_user_id: str = Depends(get_current_subject),
    controller: FullAutoController = Depends(get_controller)
):
    """
    Start autonomous analysis with SSE streaming.
    Returns Server-Sent Events stream of analysis progress.
    """
    try:
        # Create SSE stream from controller
        async def event_generator():
            async for event in controller.start_auto(
                user_id=current_user_id,
                dataset_id=dataset_id,
                user_request=user_request
            ):
                yield event

        return StreamingResponse(
            event_generator(),
            media_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive',
            }
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error in start_auto_analysis: {e}")
        raise HTTPException(status_code=500, detail='Internal server error')


@router.get('/guardrails/check')
async def check_auto_guardrails(
    dataset_id: str,
    user_request: str,
    current_user_id: str = Depends(get_current_subject),
    controller: FullAutoController = Depends(get_controller)
):
    """Run automation guardrail precheck and return confirmation/retry guidance."""
    try:
        return controller.evaluate_guardrails(
            user_id=current_user_id,
            dataset_id=dataset_id,
            user_request=user_request,
        )
    except Exception as e:
        print(f"Error in check_auto_guardrails: {e}")
        raise HTTPException(status_code=500, detail='Failed to evaluate guardrails')


@router.get('/sessions')
async def get_user_sessions(
    current_user_id: str = Depends(get_current_subject),
    controller: FullAutoController = Depends(get_controller)
):
    """Get all analysis sessions for current user"""
    try:
        sessions = await controller.get_sessions(current_user_id)
        return {
            'sessions': sessions,
            'count': len(sessions)
        }
    except Exception as e:
        print(f"Error fetching sessions: {e}")
        raise HTTPException(status_code=500, detail='Error fetching sessions')


@router.get('/sessions/{session_id}')
async def get_session_details(
    session_id: str,
    current_user_id: str = Depends(get_current_subject),
    controller: FullAutoController = Depends(get_controller)
):
    """Get details of a specific analysis session"""
    try:
        session = await controller.get_session(current_user_id, session_id)

        if not session:
            raise HTTPException(status_code=404, detail='Session not found')

        return session

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching session {session_id}: {e}")
        raise HTTPException(status_code=500, detail='Error fetching session')


@router.post('/sessions/{session_id}/cancel')
async def cancel_session(
    session_id: str,
    current_user_id: str = Depends(get_current_subject),
    controller: FullAutoController = Depends(get_controller)
):
    """Cancel a running analysis session"""
    try:
        success = await controller.cancel_session(current_user_id, session_id)

        if not success:
            raise HTTPException(status_code=404, detail='Session not found or already completed')

        return {'status': 'cancelled'}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error cancelling session: {e}")
        raise HTTPException(status_code=500, detail='Error cancelling session')


@router.post('/sessions/{session_id}/save')
async def save_session(
    session_id: str,
    current_user_id: str = Depends(get_current_subject),
    controller: FullAutoController = Depends(get_controller)
):
    """Save session to database for history"""
    try:
        # Get in-memory session
        if session_id not in controller._sessions:
            raise HTTPException(status_code=404, detail='Session not found')

        session = controller._sessions[session_id]

        # Verify ownership
        if session['user_id'] != current_user_id:
            raise HTTPException(status_code=403, detail='Forbidden')

        # Save to database
        saved_id = await controller.save_session(
            current_user_id,
            session['dataset_id'],
            session['events']
        )

        if not saved_id:
            raise HTTPException(status_code=500, detail='Failed to save session')

        return {'session_id': saved_id}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error saving session: {e}")
        raise HTTPException(status_code=500, detail='Error saving session')
