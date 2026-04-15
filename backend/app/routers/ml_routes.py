"""ML Routes - FastAPI endpoints for ML/DL/AutoML"""

from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.security import get_current_subject
from app.controllers.ml_controller import (
    MLController,
    StartTrainingRequest,
    AutoMLChatRequest,
    PredictRequest
)
from app.models_db import DatasetMetaDB
import pandas as pd
from io import StringIO

router = APIRouter(prefix="/api/ml", tags=["ml"])


@router.get("/experiments")
async def get_experiments(
    dataset_id: str = None,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_subject)
):
    """Get all ML experiments for the current user"""
    return await MLController.get_experiments(dataset_id, user_id=current_user_id)


@router.get("/experiments/{experiment_id}")
async def get_experiment(
    experiment_id: str,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_subject)
):
    """Get experiment details"""
    return await MLController.get_experiment(experiment_id)


@router.get("/experiments/{experiment_id}/status")
async def get_job_status(
    experiment_id: str,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_subject)
):
    """Get training job status"""
    return await MLController.get_job_status(experiment_id)


@router.post("/experiments/train")
async def start_training(
    request: StartTrainingRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_subject)
):
    """Start ML training"""
    # Load dataset
    dataset = db.query(DatasetMetaDB).filter(
        DatasetMetaDB.id == request.dataset_id,
        DatasetMetaDB.user_id == current_user_id
    ).first()
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    # Load data (simplified - in production, use DuckDB/Parquet)
    try:
        # For now, use sample data or load from storage path
        # In production: df = await DuckDBService.query_parquet(dataset.storage_path)
        df = pd.DataFrame()  # placeholder
    except Exception as e:
        raise HTTPException(400, f"Failed to load dataset: {str(e)}")

    return await MLController.start_training(
        request, df, current_user_id, background_tasks, db
    )


@router.post("/experiments/predict")
async def predict(
    request: PredictRequest,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_subject)
):
    """Make prediction with trained model"""
    return await MLController.predict(request, request.experiment_id)


@router.post("/automl/chat")
async def automl_chat(
    request: AutoMLChatRequest,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_subject)
):
    """AutoML chat interface"""
    # Load dataset
    dataset = db.query(DatasetMetaDB).filter(
        DatasetMetaDB.id == request.dataset_id,
        DatasetMetaDB.user_id == current_user_id
    ).first()
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    # Load data
    try:
        df = pd.DataFrame()  # placeholder
    except Exception as e:
        raise HTTPException(400, f"Failed to load dataset: {str(e)}")

    return await MLController.automl_chat(request, request.dataset_id, df)


@router.get("/models/{experiment_type}")
async def get_available_models(
    experiment_type: str,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_subject)
):
    """Get available models for experiment type"""
    return await MLController.get_available_models(experiment_type)
