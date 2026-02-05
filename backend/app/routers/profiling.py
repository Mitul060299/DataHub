from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from ..models import ProfileSummary, ChartSummary, ChartSeriesPoint, CorrelationSummary, CorrelationPair
from ..services.profiler import profile_dataframe
from ..services.summary import generate_summary
from ..services.correlation import compute_correlations
from ..services.cache import profile_cache
from .datasets import get_dataset, get_dataset_from_db
from ..db import get_db

router = APIRouter(prefix="/profiling", tags=["profiling"])


@router.get("/{dataset_id}", response_model=ProfileSummary)
def profile_dataset(dataset_id: str, columns: str | None = None, db: Session = Depends(get_db)) -> ProfileSummary:
    cache_key = f"profile:{dataset_id}:{columns or 'all'}"
    cached = profile_cache.get(cache_key)
    if cached:
        return ProfileSummary(dataset_id=dataset_id, **cached)
    try:
        df = get_dataset(dataset_id)
    except KeyError:
        try:
            df = get_dataset_from_db(dataset_id, db)
        except KeyError:
            raise HTTPException(status_code=404, detail="Dataset not found")

    if columns:
        col_list = [col.strip() for col in columns.split(",") if col.strip()]
        df = df[col_list]

    result = profile_dataframe(df)
    profile_cache.set(cache_key, result)
    return ProfileSummary(dataset_id=dataset_id, **result)


@router.get("/{dataset_id}/summary", response_model=ChartSummary)
def profile_summary(
    dataset_id: str,
    column: str,
    bins: int = 10,
    top_n: int = 10,
    db: Session = Depends(get_db),
) -> ChartSummary:
    cache_key = f"summary:{dataset_id}:{column}"
    cached = profile_cache.get(cache_key)
    if cached:
        return ChartSummary(
            dataset_id=dataset_id,
            column=column,
            kind=cached["kind"],
            series=[ChartSeriesPoint(**item) for item in cached["series"]],
        )
    try:
        df = get_dataset(dataset_id)
    except KeyError:
        try:
            df = get_dataset_from_db(dataset_id, db)
        except KeyError:
            raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        summary = generate_summary(df, column, bins=bins, top_n=top_n)
    except KeyError:
        raise HTTPException(status_code=404, detail="Column not found")

    profile_cache.set(cache_key, summary)

    return ChartSummary(
        dataset_id=dataset_id,
        column=column,
        kind=summary["kind"],
        series=[ChartSeriesPoint(**item) for item in summary["series"]],
    )


@router.get("/{dataset_id}/correlations", response_model=CorrelationSummary)
def profile_correlations(dataset_id: str, db: Session = Depends(get_db)) -> CorrelationSummary:
    cache_key = f"corr:{dataset_id}"
    cached = profile_cache.get(cache_key)
    if cached:
        return CorrelationSummary(
            dataset_id=dataset_id,
            pairs=[CorrelationPair(**item) for item in cached],
        )
    try:
        df = get_dataset(dataset_id)
    except KeyError:
        try:
            df = get_dataset_from_db(dataset_id, db)
        except KeyError:
            raise HTTPException(status_code=404, detail="Dataset not found")

    pairs = compute_correlations(df)
    profile_cache.set(cache_key, pairs)
    return CorrelationSummary(
        dataset_id=dataset_id,
        pairs=[CorrelationPair(**item) for item in pairs],
    )
