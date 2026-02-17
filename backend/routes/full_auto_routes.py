"""
Full Auto Routes
API endpoints for autonomous agent orchestration
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from controllers.full_auto_controller import FullAutoController
from security import get_current_subject


router = APIRouter(prefix='/api/auto', tags=['auto'])
controller = FullAutoController()


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


@router.post('/run')
async def start_auto_analysis(
    request: AutoRunRequest,
    subject: str = None
):
    """
    Start autonomous analysis with SSE streaming.
    Returns Server-Sent Events stream of analysis progress.
    """
    # Verify user is authenticated
    if not subject:
        raise HTTPException(status_code=401, detail='Unauthorized')

    try:
        # Create SSE stream from controller
        async def event_generator():
            async for event in controller.start_auto(
                user_id=subject,
                dataset_id=request.dataset_id,
                user_request=request.user_request
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


@router.get('/sessions')
async def get_user_sessions(
    subject: str = None
):
    """Get all analysis sessions for current user"""
    if not subject:
        raise HTTPException(status_code=401, detail='Unauthorized')

    try:
        sessions = await controller.get_sessions(subject)
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
    subject: str = None
):
    """Get details of a specific analysis session"""
    if not subject:
        raise HTTPException(status_code=401, detail='Unauthorized')

    try:
        session = await controller.get_session(subject, session_id)

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
    subject: str = None
):
    """Cancel a running analysis session"""
    if not subject:
        raise HTTPException(status_code=401, detail='Unauthorized')

    try:
        success = await controller.cancel_session(subject, session_id)

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
    subject: str = None
):
    """Save session to database for history"""
    if not subject:
        raise HTTPException(status_code=401, detail='Unauthorized')

    try:
        # Get in-memory session
        if session_id not in controller._sessions:
            raise HTTPException(status_code=404, detail='Session not found')

        session = controller._sessions[session_id]

        # Verify ownership
        if session['user_id'] != subject:
            raise HTTPException(status_code=403, detail='Forbidden')

        # Save to database
        saved_id = await controller.save_session(
            subject,
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
