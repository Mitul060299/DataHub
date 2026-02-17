"""
Full Auto Controller
Handles API logic for autonomous agent orchestration with SSE streaming
"""

import json
import asyncio
import uuid
from typing import AsyncGenerator, Optional
from datetime import datetime

from fastapi import HTTPException
import pandas as pd

from services.data_service import DataService
from services.db_service import DatabaseService
from services.full_auto_agent import FullAutoAgent, AgentEvent


class FullAutoController:
    """Controller for Full Auto agent endpoints"""

    def __init__(self):
        self.data_service = DataService()
        self.db_service = DatabaseService()
        self._sessions = {}  # in-memory session tracking
        self._event_queues = {}  # asyncio.Queue per session

    async def start_auto(self, user_id: str, dataset_id: str, user_request: str) -> AsyncGenerator[str, None]:
        """
        Start autonomous analysis and stream events via SSE.
        Opens Server-Sent Events connection and yields events as they occur.
        """
        session_id = str(uuid.uuid4())
        event_queue = asyncio.Queue()

        self._sessions[session_id] = {
            'user_id': user_id,
            'dataset_id': dataset_id,
            'user_request': user_request,
            'status': 'running',
            'created_at': datetime.utcnow().isoformat(),
            'events': [],
        }
        self._event_queues[session_id] = event_queue

        try:
            # Load dataset
            try:
                df = await self.data_service.get_dataset_for_analysis(user_id, dataset_id)
            except Exception as e:
                yield self._sse_event({
                    'type': 'error',
                    'content': f'Could not load dataset: {str(e)}',
                    'timestamp': datetime.utcnow().timestamp(),
                })
                self._sessions[session_id]['status'] = 'failed'
                return

            # Initialize agent
            agent = FullAutoAgent(user_id, dataset_id, df)

            # Stream events
            async for event in agent.run(user_request):
                # Convert event to SSE format
                event_dict = {
                    'type': event.type,
                    'content': event.content,
                    'data': event.data or {},
                    'timestamp': event.timestamp,
                }

                # Store in session
                self._sessions[session_id]['events'].append(event_dict)

                # Yield SSE format
                yield f"data: {json.dumps(event_dict)}\n\n"

                # Add to queue for other consumers
                await event_queue.put(event_dict)

                # Small delay to allow frontend to process
                await asyncio.sleep(0.01)

            # Mark as complete
            self._sessions[session_id]['status'] = 'completed'
            done_event = {
                'type': 'done',
                'content': 'Analysis completed successfully',
                'timestamp': datetime.utcnow().timestamp(),
            }
            self._sessions[session_id]['events'].append(done_event)
            yield f"data: {json.dumps(done_event)}\n\n"

        except Exception as e:
            # Error occurred
            self._sessions[session_id]['status'] = 'failed'
            error_event = {
                'type': 'error',
                'content': f'Analysis failed: {str(e)}',
                'timestamp': datetime.utcnow().timestamp(),
            }
            self._sessions[session_id]['events'].append(error_event)
            yield f"data: {json.dumps(error_event)}\n\n"

        finally:
            # Cleanup
            if session_id in self._event_queues:
                del self._event_queues[session_id]

    async def get_sessions(self, user_id: str) -> list:
        """Get all sessions for a user from database"""
        try:
            sessions = await self.db_service.query(
                'auto_sessions',
                filters={'user_id': user_id},
                order_by=[('created_at', 'desc')],
                limit=50
            )
            return sessions
        except Exception as e:
            print(f"Error fetching sessions: {e}")
            return []

    async def get_session(self, user_id: str, session_id: str) -> Optional[dict]:
        """Get a specific session with all its events"""
        try:
            session = await self.db_service.query_one(
                'auto_sessions',
                filters={'id': session_id, 'user_id': user_id}
            )

            if not session:
                return None

            # Convert JSONB fields
            session['conversation'] = session.get('conversation', [])
            session['execution_plan'] = session.get('execution_plan', {})
            session['artifacts'] = session.get('artifacts', {})

            return session
        except Exception as e:
            print(f"Error fetching session: {e}")
            return None

    async def save_session(self, user_id: str, dataset_id: str, events: list,
                          title: Optional[str] = None) -> str:
        """Save session to database"""
        try:
            session_id = str(uuid.uuid4())

            # Auto-generate title from first message
            if not title and events:
                for event in events:
                    if event['type'] == 'message' and 'request' not in event.get('content', '').lower():
                        title = event['content'][:100]
                        break
            if not title:
                title = f"Analysis {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"

            # Count steps
            step_events = [e for e in events if e['type'] in ['step_start', 'step_result']]
            completed_steps = [e for e in events if e['type'] == 'step_result']

            session_data = {
                'id': session_id,
                'user_id': user_id,
                'dataset_id': dataset_id,
                'title': title,
                'status': 'completed',
                'conversation': events,
                'total_steps': len(step_events),
                'completed_steps': len(completed_steps),
                'current_step': len(completed_steps),
                'artifacts': self._extract_artifacts(events),
            }

            await self.db_service.insert('auto_sessions', session_data)
            return session_id

        except Exception as e:
            print(f"Error saving session: {e}")
            return None

    def _extract_artifacts(self, events: list) -> dict:
        """Extract artifacts from events for storage"""
        artifacts = {
            'charts': [],
            'insights': [],
            'statistics': {},
        }

        for event in events:
            if event['type'] == 'chart':
                artifacts['charts'].append(event['data'])
            elif event['type'] == 'insight':
                artifacts['insights'].append(event['content'])
            elif event['type'] == 'step_result' and 'statistics' in str(event.get('data', {})).lower():
                artifacts['statistics'] = event.get('data', {})

        return artifacts

    @staticmethod
    def _sse_event(event_dict: dict) -> str:
        """Format event as SSE"""
        return f"data: {json.dumps(event_dict)}\n\n"

    async def cancel_session(self, user_id: str, session_id: str) -> bool:
        """Cancel a running session"""
        if session_id in self._sessions:
            if self._sessions[session_id]['user_id'] == user_id:
                self._sessions[session_id]['status'] = 'cancelled'
                return True
        return False
