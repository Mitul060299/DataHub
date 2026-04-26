from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session
from ..models import InsightSummary, InsightActionSummary, InsightAction
from ..services.insights import generate_insights, generate_insight_actions
from ..services.context_store import context_store
from .datasets import get_dataset, get_dataset_from_db
from ..db import get_db
from ..security import get_current_role, get_current_user_id, require_role

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/{dataset_id}", response_model=InsightSummary)
def get_insights(
    dataset_id: str,
    workspace_id: str | None = None,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> InsightSummary:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization) or "anonymous"
    try:
        df = get_dataset(dataset_id)
    except KeyError:
        try:
            df = get_dataset_from_db(dataset_id, db, user_id=user_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Dataset not found")

    context_text = context_store.get_context_text(workspace_id or "default")
    result = generate_insights(df, context_text=context_text)
    return InsightSummary(dataset_id=dataset_id, **result)


@router.get("/{dataset_id}/actions", response_model=InsightActionSummary)
def get_insight_actions(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> InsightActionSummary:
    role = get_current_role(authorization)
    require_role("viewer", role)
    user_id = get_current_user_id(authorization) or "anonymous"
    try:
        df = get_dataset(dataset_id)
    except KeyError:
        try:
            df = get_dataset_from_db(dataset_id, db, user_id=user_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Dataset not found")

    actions = generate_insight_actions(df)
    return InsightActionSummary(
        dataset_id=dataset_id,
        actions=[InsightAction(**action) for action in actions],
    )
