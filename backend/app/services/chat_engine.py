"""
Chat Engine - Orchestrates multi-step data manipulation through natural language
Handles: Session management, message processing, transformation execution, reproducibility
"""

import json
import uuid
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any, AsyncGenerator, List
from dataclasses import dataclass, field, asdict
from enum import Enum

from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func, and_

from app.models_db import (
    ChatSessionDB,
    TransformationStepDB,
    PipelineV2DB,
    ChatSessionSnapshotDB,
)
from app.config import settings
from app.services.llm_provider import get_default_model
from app.services.ai_operating_controls import get_ai_operating_controls, classify_intent
from app.services.agent_graph import AgentGraphService
from app.services.data_transformation_service import DataTransformationService


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class EventType(str, Enum):
    MESSAGE = "message"
    THINKING = "thinking"
    PLAN = "plan"
    STEP_START = "step_start"
    STEP_RESULT = "step_result"
    PREVIEW = "preview"
    CONFIRMATION_NEEDED = "confirmation_needed"
    TRANSFORMATION = "transformation"
    ARTIFACT = "artifact"
    INSIGHT = "insight"
    ERROR = "error"
    DONE = "done"


@dataclass
class ChatMessage:
    """Represents a single message in the conversation"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = field(default_factory=lambda: datetime.utcnow().timestamp())
    role: MessageRole = MessageRole.USER
    content: str = ""
    type: str = "text"
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp,
            'role': self.role.value,
            'content': self.content,
            'type': self.type,
            'metadata': self.metadata,
        }


@dataclass
class ChatEvent:
    """Represents a streaming event sent to frontend"""
    type: EventType
    content: str
    data: Optional[Dict[str, Any]] = None
    timestamp: float = field(default_factory=lambda: datetime.utcnow().timestamp())
    
    def to_sse(self) -> str:
        """Convert to Server-Sent Event format"""
        event_dict = {
            'type': self.type.value,
            'content': self.content,
            'data': self.data or {},
            'timestamp': self.timestamp
        }
        return f"data: {json.dumps(event_dict)}\n\n"


class ChatEngine:
    """Core chat orchestration engine"""
    
    def __init__(self, db: DBSession, user_id: str, user_plan: str):
        self.db = db
        self.user_id = user_id
        self.user_plan = user_plan
        self.rate_limiter = self._init_rate_limiter()
    
    def _init_rate_limiter(self):
        """Initialize rate limiter based on user plan"""
        limits = {
            'free': 50,
            'professional': 500,
            'team': None,
            'business': None,
            'enterprise': None,
        }
        return limits.get(self.user_plan, 50)
    
    async def check_rate_limit(self, month: int, year: int):
        """Check if user exceeded message quota for the month"""
        if self.rate_limiter is None:
            return
        
        result = self.db.query(func.count(ChatSessionDB.id)).filter(
            and_(
                ChatSessionDB.user_id == self.user_id,
                func.extract('month', ChatSessionDB.created_at) == month,
                func.extract('year', ChatSessionDB.created_at) == year,
            )
        ).scalar()
        
        if result >= self.rate_limiter:
            raise Exception(f"Monthly limit exceeded: {self.rate_limiter}")
    
    async def create_session(
        self,
        dataset_id: str,
        initial_request: Optional[str] = None
    ) -> ChatSessionDB:
        """Initialize a new chat session"""
        
        session = ChatSessionDB(
            id=str(uuid.uuid4()),
            user_id=self.user_id,
            dataset_id=dataset_id,
            title=self._auto_title(initial_request),
            status='active',
            messages=[],
            execution_context={
                'llm_provider': settings.llm_provider,
                'llm_model': get_default_model(),
                'user_plan': self.user_plan,
                'user_id': str(self.user_id),
            }
        )
        
        self.db.add(session)
        self.db.commit()
        return session
    
    def _auto_title(self, request: Optional[str]) -> str:
        """Generate title from initial request"""
        if not request:
            return f"Analysis {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        
        return request[:50] + "..." if len(request) > 50 else request
    
    async def process_message(
        self,
        session_id: str,
        user_message: str,
        dataset_id: str,
    ) -> AsyncGenerator[ChatEvent, None]:
        """
        Main entry point: Process user message and orchestrate transformations
        Yields streaming events to frontend
        """
        
        session = self.db.query(ChatSessionDB).filter_by(id=session_id).first()
        if not session:
            yield ChatEvent(type=EventType.ERROR, content="Session not found")
            return

        ai_controls = get_ai_operating_controls()
        if len((user_message or "").strip()) > ai_controls.max_message_chars:
            yield ChatEvent(
                type=EventType.ERROR,
                content=f"Message exceeds max length ({ai_controls.max_message_chars} chars)",
            )
            return

        detected_intent = classify_intent(user_message)
        if detected_intent not in set(ai_controls.allowed_intents or ["general"]):
            yield ChatEvent(
                type=EventType.CONFIRMATION_NEEDED,
                content=f"Intent '{detected_intent}' is currently restricted by policy",
                data={"intent": detected_intent, "allowed_intents": ai_controls.allowed_intents},
            )
            return

        if ai_controls.enable_durable_memory:
            self.create_checkpoint(session_id)
        
        user_msg = ChatMessage(
            role=MessageRole.USER,
            content=user_message,
            type="text"
        )
        session.messages.append(user_msg.to_dict())
        self.db.commit()
        
        yield ChatEvent(
            type=EventType.MESSAGE,
            content=f"User: {user_message}"
        )
        
        try:
            yield ChatEvent(
                type=EventType.THINKING,
                content="Analyzing your request..."
            )

            conversation_history: list[dict[str, Any]] = []
            for item in session.messages[-12:]:
                role = item.get("role")
                content = item.get("content")
                if role in {"user", "assistant"} and content:
                    conversation_history.append({"role": role, "content": content})

            agent_result = AgentGraphService.process_command(
                dataset_id=dataset_id,
                user_message=user_message,
                conversation_history=conversation_history,
                db=self.db,
            )

            plan_steps = agent_result.get("plan") if isinstance(agent_result.get("plan"), list) else []
            transformation = agent_result.get("transformation") if isinstance(agent_result.get("transformation"), dict) else None
            needs_confirmation = bool(agent_result.get("needsConfirmation", False))
            artifact = agent_result.get("artifact") if isinstance(agent_result.get("artifact"), dict) else None
            response_text = str(agent_result.get("response") or "")

            yield ChatEvent(
                type=EventType.PLAN,
                content="Execution plan ready",
                data={"steps": plan_steps}
            )

            steps_executed = 0

            if transformation:
                yield ChatEvent(
                    type=EventType.TRANSFORMATION,
                    content=transformation.get("description") or "Transformation prepared",
                    data=transformation,
                )

                if needs_confirmation:
                    yield ChatEvent(
                        type=EventType.CONFIRMATION_NEEDED,
                        content="Please confirm before applying this transformation.",
                        data={"transformation": transformation},
                    )
                elif transformation.get("sql"):
                    yield ChatEvent(
                        type=EventType.STEP_START,
                        content="Applying transformation...",
                        data={"operation": transformation.get("operation")},
                    )
                    execution_result = DataTransformationService.execute_transformation(
                        dataset_id=dataset_id,
                        user_id=self.user_id,
                        transformation=transformation,
                        db=self.db,
                    )
                    steps_executed += 1
                    yield ChatEvent(
                        type=EventType.STEP_RESULT,
                        content="Transformation execution finished",
                        data=execution_result,
                    )

            if artifact:
                yield ChatEvent(
                    type=EventType.ARTIFACT,
                    content=artifact.get("title") or "Artifact generated",
                    data=artifact,
                )

            assistant_msg = ChatMessage(
                role=MessageRole.ASSISTANT,
                content=response_text,
                type="text",
                metadata={
                    "plan": plan_steps,
                    "needs_confirmation": needs_confirmation,
                    "transformation": transformation,
                    "artifact": artifact,
                },
            )
            session.messages.append(assistant_msg.to_dict())

            yield ChatEvent(
                type=EventType.MESSAGE,
                content=response_text or "Done.",
            )

            yield ChatEvent(
                type=EventType.DONE,
                content="Request processed",
                data={
                    "steps_executed": steps_executed,
                    "confirmation_required": needs_confirmation,
                }
            )
            
            session.status = 'completed'
            session.completed_at = datetime.utcnow()
            self.db.commit()
            
        except Exception as e:
            yield ChatEvent(
                type=EventType.ERROR,
                content=f"Error: {str(e)}"
            )
            session.status = 'failed'
            self.db.commit()
    
    def _get_max_steps_for_tier(self) -> int:
        """Max steps per request by tier"""
        tiers_steps = {
            'free': 1,
            'professional': 3,
            'team': 999,
            'business': 999,
            'enterprise': 999,
        }
        return tiers_steps.get(self.user_plan, 1)
    
    def handle_data_update(self, session_id: str, new_dataset_id: str, new_dataset_name: str) -> Dict[str, Any]:
        """
        Handle data update gracefully - update dataset while preserving chat history
        
        Args:
            session_id: Current session ID
            new_dataset_id: ID of the new dataset
            new_dataset_name: Name of the new dataset
            
        Returns:
            Dict with update status and metadata
        """
        session = self.db.query(ChatSessionDB).filter_by(id=session_id).first()
        
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        # Store previous dataset info for context
        old_dataset_id = session.dataset_id
        old_dataset_name = session.execution_context.get('previous_dataset_names', [])
        
        # Update session with new dataset
        session.dataset_id = new_dataset_id
        
        # Update execution context
        session.execution_context = {
            **session.execution_context,
            'current_dataset_id': new_dataset_id,
            'current_dataset_name': new_dataset_name,
            'previous_dataset_ids': session.execution_context.get('previous_dataset_ids', []) + [old_dataset_id],
            'previous_dataset_names': old_dataset_name + [new_dataset_name] if isinstance(old_dataset_name, list) else [new_dataset_name],
            'data_update_timestamp': datetime.utcnow().isoformat(),
        }
        
        # Create checkpoint before data update
        self.create_checkpoint(session_id)
        
        # Add system message to preserve history context
        system_message = ChatMessage(
            role=MessageRole.SYSTEM,
            content=f"Data updated: switched from '{old_dataset_id}' to '{new_dataset_name}'. Previous analysis history is preserved above.",
            timestamp=datetime.utcnow().isoformat(),
        )
        
        session.messages.append(asdict(system_message))
        self.db.commit()
        
        return {
            'status': 'success',
            'message': f'Data updated to {new_dataset_name}',
            'previous_dataset': old_dataset_id,
            'new_dataset': new_dataset_id,
            'history_preserved': True,
        }
    
    def create_checkpoint(self, session_id: str):
        """Create a snapshot for rollback capability"""
        session = self.db.query(ChatSessionDB).filter_by(id=session_id).first()
        
        version = self.db.query(ChatSessionSnapshotDB).filter_by(
            session_id=session_id
        ).count() + 1
        
        snapshot = ChatSessionSnapshotDB(
            id=str(uuid.uuid4()),
            session_id=session_id,
            version=version,
            snapshot_type='auto',
            messages_count=len(session.messages),
            dataset_state={'messages': session.messages},
        )
        
        self.db.add(snapshot)
        self.db.commit()
        return snapshot
