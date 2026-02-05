from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from ..models import InsightSummary, InsightActionSummary, InsightAction
from ..services.insights import generate_insights, generate_insight_actions
from ..services.context_store import context_store
from .datasets import get_dataset, get_dataset_from_db
from ..db import get_db

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/{dataset_id}", response_model=InsightSummary)
def get_insights(
    dataset_id: str,
    workspace_id: str | None = None,
    db: Session = Depends(get_db),
) -> InsightSummary:
    try:
        df = get_dataset(dataset_id)
    except KeyError:
        try:
            df = get_dataset_from_db(dataset_id, db)
        except KeyError:
            raise HTTPException(status_code=404, detail="Dataset not found")

    context_text = context_store.get_context_text(workspace_id or "default")
    result = generate_insights(df, context_text=context_text)
    return InsightSummary(dataset_id=dataset_id, **result)


@router.get("/{dataset_id}/actions", response_model=InsightActionSummary)
def get_insight_actions(dataset_id: str, db: Session = Depends(get_db)) -> InsightActionSummary:
    try:
        df = get_dataset(dataset_id)
    except KeyError:
        try:
            df = get_dataset_from_db(dataset_id, db)
        except KeyError:
            raise HTTPException(status_code=404, detail="Dataset not found")

    actions = generate_insight_actions(df)
    return InsightActionSummary(
        dataset_id=dataset_id,
        actions=[InsightAction(**action) for action in actions],
    )
