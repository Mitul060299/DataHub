"""
Full Auto Controller
Handles API logic for autonomous agent orchestration with SSE streaming
"""

import json
import asyncio
import uuid
from typing import AsyncGenerator, Optional, Any
from datetime import datetime

from fastapi import HTTPException
import pandas as pd
from sqlalchemy.orm import Session
from app.db import get_db
from app.models_db import DatasetMetaDB, DatasetChunkDB, DatasetDataDB

from app.services.full_auto_agent import FullAutoAgent, AgentEvent
from app.services.audit import audit_store
from app.models import AuditEntry
from app.services.automation_guardrails import (
    get_automation_guardrail_policy,
    allowed_automation_tools,
)


class FullAutoController:
    """Controller for Full Auto agent endpoints"""

    def __init__(self, db: Session = None):
        self.db = db
        self._sessions = {}  # in-memory session tracking
        self._event_queues = {}  # asyncio.Queue per session

    def _guardrail_block_payload(
        self,
        reason: str,
        message: str,
        policy: Any,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        retry_guidance = {
            "disabled": ["Ask an admin to enable automation guardrails policy"],
            "request_too_large": ["Shorten the request and retry", "Split the request into smaller steps"],
            "dataset_too_large": ["Filter or sample the dataset, then retry", "Ask an admin to increase size limits"],
            "dataset_too_large_runtime": ["Filter or sample the dataset, then retry", "Ask an admin to increase size limits"],
        }
        return {
            "allowed": False,
            "block_reason": reason,
            "message": message,
            "confirmation_required": True,
            "retryable": reason != "disabled",
            "retry_actions": retry_guidance.get(reason, ["Adjust inputs and retry"]),
            "policy": {
                "enabled": bool(policy.enabled),
                "max_rows": int(policy.max_rows),
                "max_columns": int(policy.max_columns),
                "max_request_chars": int(policy.max_request_chars),
                "max_steps": int(policy.max_steps),
                "allow_ml_training": bool(policy.allow_ml_training),
            },
            "details": details or {},
        }

    def _build_guardrail_sse_event(self, block: dict[str, Any]) -> dict[str, Any]:
        return {
            "type": "confirmation_needed",
            "content": block.get("message", "Blocked by automation guardrails"),
            "data": {
                "category": "automation_guardrail",
                **block,
            },
            "timestamp": datetime.utcnow().timestamp(),
        }

    def evaluate_guardrails(
        self,
        user_id: str,
        dataset_id: str,
        user_request: str,
    ) -> dict[str, Any]:
        policy = get_automation_guardrail_policy()
        request_text = (user_request or "").strip()

        if not policy.enabled:
            return self._guardrail_block_payload(
                reason="disabled",
                message="Automation is disabled by admin policy",
                policy=policy,
            )

        if len(request_text) > policy.max_request_chars:
            return self._guardrail_block_payload(
                reason="request_too_large",
                message=f"Request exceeds automation guardrail limit of {policy.max_request_chars} characters",
                policy=policy,
                details={"request_length": len(request_text)},
            )

        dataset_meta = self.db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first() if self.db else None
        if dataset_meta:
            dataset_rows = int(dataset_meta.row_count or 0)
            dataset_cols = len(dataset_meta.columns or [])
            if dataset_rows > policy.max_rows or dataset_cols > policy.max_columns:
                return self._guardrail_block_payload(
                    reason="dataset_too_large",
                    message=(
                        f"Dataset exceeds automation guardrails "
                        f"(rows <= {policy.max_rows}, columns <= {policy.max_columns})"
                    ),
                    policy=policy,
                    details={
                        "rows": dataset_rows,
                        "columns": dataset_cols,
                    },
                )

        return {
            "allowed": True,
            "message": "Automation precheck passed",
            "policy": {
                "enabled": bool(policy.enabled),
                "max_rows": int(policy.max_rows),
                "max_columns": int(policy.max_columns),
                "max_request_chars": int(policy.max_request_chars),
                "max_steps": int(policy.max_steps),
                "allow_ml_training": bool(policy.allow_ml_training),
            },
        }

    async def load_dataset(self, dataset_id: str, user_id: str) -> pd.DataFrame:
        """Load dataset from database by ID for analysis"""
        if not self.db:
            from app.db import get_db
            self.db = next(get_db())

        try:
            # Try loading from chunks first
            chunks = self.db.query(DatasetChunkDB).filter(
                DatasetChunkDB.dataset_id == dataset_id
            ).order_by(DatasetChunkDB.chunk_index.asc()).all()

            if chunks:
                rows = []
                for chunk in chunks:
                    rows.extend(chunk.rows or [])
                return pd.DataFrame(rows)

            # Fallback to dataset_data
            data = self.db.query(DatasetDataDB).filter(
                DatasetDataDB.id == dataset_id
            ).first()

            if data:
                return pd.DataFrame(data.rows or [])

            raise ValueError(f"Dataset {dataset_id} not found")

        except Exception as e:
            raise ValueError(f"Failed to load dataset: {str(e)}")

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
        policy = get_automation_guardrail_policy()

        try:
            precheck = self.evaluate_guardrails(user_id=user_id, dataset_id=dataset_id, user_request=user_request)
            if not precheck.get("allowed"):
                self._sessions[session_id]['status'] = 'blocked'
                audit_store.add(
                    AuditEntry(
                        action='automation.guardrail.block',
                        actor=user_id,
                        target=dataset_id,
                        metadata={
                            'reason': precheck.get('block_reason', 'unknown'),
                            **(precheck.get('details') or {}),
                            'max_request_chars': policy.max_request_chars,
                            'max_rows': policy.max_rows,
                            'max_columns': policy.max_columns,
                        },
                    )
                )
                event_dict = self._build_guardrail_sse_event(precheck)
                self._sessions[session_id]['events'].append(event_dict)
                yield self._sse_event(event_dict)
                return

            # Load dataset
            try:
                df = await self.load_dataset(dataset_id, user_id)
            except Exception as e:
                yield self._sse_event({
                    'type': 'error',
                    'content': f'Could not load dataset: {str(e)}',
                    'timestamp': datetime.utcnow().timestamp(),
                })
                self._sessions[session_id]['status'] = 'failed'
                return

            if len(df) > policy.max_rows or len(df.columns) > policy.max_columns:
                self._sessions[session_id]['status'] = 'blocked'
                block = self._guardrail_block_payload(
                    reason='dataset_too_large_runtime',
                    message=(
                        f'Dataset exceeds automation guardrails '
                        f'(rows <= {policy.max_rows}, columns <= {policy.max_columns})'
                    ),
                    policy=policy,
                    details={
                        'rows': len(df),
                        'columns': len(df.columns),
                    },
                )
                audit_store.add(
                    AuditEntry(
                        action='automation.guardrail.block',
                        actor=user_id,
                        target=dataset_id,
                        metadata={
                            'reason': block.get('block_reason', 'dataset_too_large_runtime'),
                            **(block.get('details') or {}),
                            'max_rows': policy.max_rows,
                            'max_columns': policy.max_columns,
                        },
                    )
                )
                event_dict = self._build_guardrail_sse_event(block)
                self._sessions[session_id]['events'].append(event_dict)
                yield self._sse_event(event_dict)
                return

            # Initialize agent
            agent = FullAutoAgent(
                user_id,
                dataset_id,
                df,
                max_iterations=policy.max_steps,
                allowed_tools=allowed_automation_tools(policy),
            )

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
        if not self.db:
            from app.db import get_db
            self.db = next(get_db())

        try:
            # For now, return in-memory sessions for the user
            user_sessions = [
                s for s in self._sessions.values()
                if s.get('user_id') == user_id
            ]
            return user_sessions
        except Exception as e:
            print(f"Error fetching sessions: {e}")
            return []

    async def get_session(self, user_id: str, session_id: str) -> Optional[dict]:
        """Get a specific session with all its events"""
        if session_id not in self._sessions:
            return None

        session = self._sessions[session_id]

        # Verify ownership
        if session.get('user_id') != user_id:
            return None

        return session

    async def save_session(self, user_id: str, dataset_id: str, events: list,
                          title: Optional[str] = None) -> str:
        """Save session to in-memory storage (database persistence optional)"""
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
                'created_at': datetime.utcnow().isoformat(),
            }

            # Store in memory (and optionally in DB)
            self._sessions[session_id] = session_data
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
