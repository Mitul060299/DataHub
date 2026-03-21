from fastapi import APIRouter, HTTPException, Depends, Header, Request
from sqlalchemy.orm import Session
import uuid
from ..models import AgentSuggestion, ChatRequest, ChatResponse, AgentFeedbackIn, AgentFeedbackOut
from ..services.llm import suggest_steps_llm, chat_with_dataset
from ..services.context_store import context_store
from .datasets import get_dataset, get_dataset_from_db
from ..db import get_db
from ..models_db import AgentFeedbackDB
from ..security import get_current_role, require_role
from ..services.rate_limiter import limiter

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/suggest/{dataset_id}", response_model=AgentSuggestion)
def suggest(
    dataset_id: str,
    workspace_id: str | None = None,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AgentSuggestion:
    role = get_current_role(authorization)
    require_role("viewer", role)
    try:
        df = get_dataset(dataset_id)
    except KeyError:
        try:
            df = get_dataset_from_db(dataset_id, db)
        except KeyError:
            raise HTTPException(status_code=404, detail="Dataset not found")

    context_text = context_store.get_context_text(workspace_id or "default")
    steps, notes = suggest_steps_llm(df, context_text)
    notes.append("Suggested steps are auto-generated; review before applying.")
    return AgentSuggestion(dataset_id=dataset_id, recommended_steps=steps, notes=notes)


@router.post("/chat/{dataset_id}", response_model=ChatResponse)
@limiter.limit("10/minute")
def chat(
    request: Request,
    dataset_id: str,
    payload: ChatRequest,
    workspace_id: str | None = None,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ChatResponse:
    role = get_current_role(authorization)
    require_role("viewer", role)
    try:
        df = get_dataset(dataset_id)
    except KeyError:
        try:
            df = get_dataset_from_db(dataset_id, db)
        except KeyError:
            raise HTTPException(status_code=404, detail="Dataset not found")

    context_text = context_store.get_context_text(workspace_id or "default")
    reply, notes = chat_with_dataset(
        df,
        context_text,
        payload.message,
        [item.model_dump() for item in payload.history],
    )
    return ChatResponse(dataset_id=dataset_id, reply=reply, notes=notes)


@router.post("/feedback", response_model=AgentFeedbackOut)
def submit_feedback(
    payload: AgentFeedbackIn,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AgentFeedbackOut:
    role = get_current_role(authorization)
    require_role("viewer", role)
    feedback_id = str(uuid.uuid4())
    feedback = AgentFeedbackDB(
        id=feedback_id,
        dataset_id=payload.dataset_id,
        rating=payload.rating,
        source=payload.source,
        notes=payload.notes,
        metadata_=payload.metadata,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return AgentFeedbackOut(
        feedback_id=feedback_id,
        dataset_id=payload.dataset_id,
        rating=payload.rating,
        source=payload.source,
        notes=payload.notes,
        created_at=str(feedback.created_at),
    )
