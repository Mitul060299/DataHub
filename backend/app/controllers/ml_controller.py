"""ML Controller - API endpoints for ML/DL/AutoML"""

from fastapi import HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List
from app.db import get_db
from pydantic import BaseModel
from datetime import datetime
import uuid
import asyncio
import pandas as pd
import json

from app.services.ml_service import MLService, CLASSIFICATION_MODELS, REGRESSION_MODELS, CLUSTERING_MODELS
from app.services.automl_service import AutoMLService
from app.services.dl_service import DLService


# ── Request schemas ───────────────────────────────────────────────

class StartTrainingRequest(BaseModel):
    dataset_id: str
    experiment_name: str
    experiment_type: str   # classification|regression|clustering|forecasting|automl
    target_column: Optional[str] = None
    feature_columns: Optional[List[str]] = None
    model_name: Optional[str] = None      # specific model or None for AutoML
    hyperparams: Optional[dict] = None
    test_size: float = 0.2
    cv_folds: int = 5
    use_deep_learning: bool = False
    dl_epochs: int = 50
    date_column: Optional[str] = None     # for forecasting
    forecast_periods: int = 30
    n_clusters: int = 3                   # for clustering


class AutoMLChatRequest(BaseModel):
    dataset_id: str
    message: str
    conversation_history: Optional[List[dict]] = []


class PredictRequest(BaseModel):
    experiment_id: str
    input_data: dict


# ── In-memory job store (replace with Redis for production) ───────
_jobs: dict = {}   # experiment_id → {status, progress, message}
_experiments: dict = {}  # experiment_id → experiment data


class MLController:

    @staticmethod
    async def initialize_experiment(
        dataset_id: str,
        experiment_name: str,
        experiment_type: str,
        db: Session = None
    ) -> str:
        """Create experiment record and return ID"""
        exp_id = str(uuid.uuid4())
        _experiments[exp_id] = {
            "id": exp_id,
            "dataset_id": dataset_id,
            "name": experiment_name,
            "experiment_type": experiment_type,
            "status": "pending",
            "progress": 0,
            "created_at": datetime.utcnow().isoformat(),
            "metrics": None,
            "best_model": None,
            "feature_importance": None,
            "confusion_matrix": None,
        }
        _jobs[exp_id] = {"status": "pending", "progress": 0, "message": "Queued"}
        return exp_id

    @staticmethod
    async def start_training(
        request: StartTrainingRequest,
        df: pd.DataFrame,
        current_user_id: str,
        background_tasks: BackgroundTasks,
        db: Session = None
    ):
        """Start training in background"""
        exp_id = await MLController.initialize_experiment(
            request.dataset_id,
            request.experiment_name,
            request.experiment_type,
            db
        )

        # Run in background
        background_tasks.add_task(
            MLController._run_training,
            exp_id, request, df, current_user_id
        )

        return {"experiment_id": exp_id, "status": "started"}

    @staticmethod
    async def _run_training(
        exp_id: str,
        request: StartTrainingRequest,
        df: pd.DataFrame,
        user_id: str
    ):
        """Execute training"""
        start_time = datetime.utcnow()

        async def update_progress(pct: int, msg: str):
            _jobs[exp_id] = {"status": "training", "progress": pct, "message": msg}
            _experiments[exp_id]["progress"] = pct
            _experiments[exp_id]["status"] = "training"

        try:
            _experiments[exp_id]["status"] = "training"
            _experiments[exp_id]["started_at"] = start_time.isoformat()

            result = {}

            if request.experiment_type == "automl":
                config = {
                    "experiment_type": request.experiment_type or "classification",
                    "target_column": request.target_column,
                    "feature_columns": request.feature_columns or list(df.columns),
                }
                result = await AutoMLService.run_automl(
                    df, exp_id, config, progress_callback=update_progress
                )

            elif request.experiment_type == "classification":
                if request.use_deep_learning:
                    result = await DLService.train_neural_classifier(
                        df, exp_id,
                        request.target_column, request.feature_columns,
                        epochs=request.dl_epochs
                    )
                else:
                    result = await MLService.train_classification(
                        df, exp_id,
                        request.target_column, request.feature_columns,
                        model_name=request.model_name or "random_forest",
                        hyperparams=request.hyperparams,
                        test_size=request.test_size,
                        cv_folds=request.cv_folds
                    )

            elif request.experiment_type == "regression":
                result = await MLService.train_regression(
                    df, exp_id,
                    request.target_column, request.feature_columns,
                    model_name=request.model_name or "random_forest",
                    hyperparams=request.hyperparams,
                    test_size=request.test_size
                )

            elif request.experiment_type == "clustering":
                result = await MLService.train_clustering(
                    df, exp_id,
                    request.feature_columns,
                    model_name=request.model_name or "kmeans",
                    hyperparams=request.hyperparams
                )

            elif request.experiment_type == "forecasting":
                if request.use_deep_learning:
                    result = await DLService.train_lstm_forecaster(
                        df, exp_id,
                        request.date_column, request.target_column,
                        forecast_periods=request.forecast_periods,
                        epochs=request.dl_epochs
                    )
                else:
                    result = await MLService.train_forecasting(
                        df, exp_id,
                        request.date_column, request.target_column,
                        forecast_periods=request.forecast_periods,
                        model_name=request.model_name or "prophet"
                    )

            # Save results
            duration = (datetime.utcnow() - start_time).total_seconds()
            _experiments[exp_id]["status"] = "completed"
            _experiments[exp_id]["progress"] = 100
            _experiments[exp_id]["metrics"] = result.get("metrics")
            _experiments[exp_id]["best_model"] = result.get("model_name") or request.model_name
            _experiments[exp_id]["completed_at"] = datetime.utcnow().isoformat()
            _experiments[exp_id]["training_duration_seconds"] = duration

            _jobs[exp_id] = {
                "status": "completed",
                "progress": 100,
                "message": "Training complete!",
                "result": {
                    "metrics": result.get("metrics"),
                    "best_model": _experiments[exp_id]["best_model"],
                }
            }

        except Exception as e:
            _experiments[exp_id]["status"] = "failed"
            _jobs[exp_id] = {
                "status": "failed",
                "progress": 0,
                "message": str(e),
                "error": str(e)
            }

    @staticmethod
    async def get_experiment(experiment_id: str):
        """Get experiment details"""
        exp = _experiments.get(experiment_id)
        if not exp:
            raise HTTPException(404, "Experiment not found")
        return exp

    @staticmethod
    async def get_experiments(dataset_id: Optional[str] = None):
        """List experiments"""
        exps = list(_experiments.values())
        if dataset_id:
            exps = [e for e in exps if e.get("dataset_id") == dataset_id]
        return {"experiments": exps}

    @staticmethod
    async def get_job_status(experiment_id: str):
        """Get training job status"""
        job = _jobs.get(experiment_id, {"status": "not_found", "progress": 0})
        return job

    @staticmethod
    async def automl_chat(
        request: AutoMLChatRequest,
        dataset_id: str,
        df: pd.DataFrame,
    ):
        """AutoML chat interface"""
        # Get schema and stats from dataframe
        schema = {
            "columns": list(df.columns),
            "types": {col: str(df[col].dtype) for col in df.columns},
            "sample": df.head(5).to_dict()
        }
        
        stats = {
            "shape": list(df.shape),
            "missing": (df.isnull().sum()).to_dict(),
        }

        # Return simple response
        return {
            'schema': schema,
            'stats': stats,
            'message': 'Dataset analyzed'
        }

    @staticmethod
    async def predict(
        request: PredictRequest,
        experiment_id: str,
    ):
        """Make prediction with trained model"""
        exp = _experiments.get(experiment_id)
        if not exp or not exp.get("model_path"):
            raise HTTPException(404, "Trained model not found")

        try:
            result = MLService.predict(exp["model_path"], request.input_data)
            return result
        except Exception as e:
            raise HTTPException(400, f"Prediction failed: {str(e)}")

    @staticmethod
    async def get_available_models(experiment_type: str):
        """Get available models for experiment type"""
        if experiment_type == "classification":
            return {"models": [
                {"name": k, "description": v["description"]}
                for k, v in CLASSIFICATION_MODELS.items()
            ]}
        elif experiment_type == "regression":
            return {"models": [
                {"name": k, "description": v["description"]}
                for k, v in REGRESSION_MODELS.items()
            ]}
        elif experiment_type == "clustering":
            return {"models": [
                {"name": k, "description": v["description"]}
                for k, v in CLUSTERING_MODELS.items()
            ]}
        elif experiment_type == "forecasting":
            return {"models": [
                {"name": "prophet", "description": "Facebook Prophet - handles seasonality automatically"},
                {"name": "arima", "description": "ARIMA - statistical time series model"},
                {"name": "lstm", "description": "LSTM Neural Network - deep learning forecasting"},
            ]}
        return {"models": []}
