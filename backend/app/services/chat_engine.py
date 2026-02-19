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
    
    def __init__(self, db: DBSession, user_id: str, workspace_id: str, user_plan: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = workspace_id
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
            workspace_id=self.workspace_id,
            dataset_id=dataset_id,
            title=self._auto_title(initial_request),
            status='active',
            messages=[],
            execution_context={
                'llm_provider': settings.llm_provider,
                'llm_model': settings.groq_model,
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
            
            max_steps = self._get_max_steps_for_tier()
            
            yield ChatEvent(
                type=EventType.PLAN,
                content=f"I'll help you with this request",
                data={'steps': []}
            )
            
            yield ChatEvent(
                type=EventType.DONE,
                content="Ready to process your request",
                data={'steps_executed': 0}
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
