"""
ML Service - Traditional ML & Deep Learning
Supports: Classification, Regression, Clustering, Forecasting, Anomaly Detection
Big data optimized: chunked loading, streaming predictions
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import json
import io
import asyncio

# Traditional ML
from sklearn.ensemble import (
    RandomForestClassifier, RandomForestRegressor,
    GradientBoostingClassifier, GradientBoostingRegressor,
    ExtraTreesClassifier, ExtraTreesRegressor
)
from sklearn.linear_model import (
    LogisticRegression, LinearRegression, Ridge, Lasso, ElasticNet
)
from sklearn.svm import SVC, SVR
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.preprocessing import (
    StandardScaler, MinMaxScaler, LabelEncoder, OneHotEncoder
)
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import (
    accuracy_score, f1_score, precision_score, recall_score, roc_auc_score,
    mean_squared_error, mean_absolute_error, r2_score,
    silhouette_score, davies_bouldin_score,
    confusion_matrix, classification_report
)
from sklearn.feature_selection import SelectKBest, f_classif, f_regression
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

# XGBoost / LightGBM (install separately)
try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False

try:
    import lightgbm as lgb
    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False

# Time series
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX
try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False

# Services
from app.db import get_db
from app.models_db import User
from sqlalchemy.orm import Session

import joblib
import pickle
import os
import uuid


# ─────────────────────────────────────────────────────────────────
# MODEL REGISTRY
# All supported models with default hyperparameters
# ─────────────────────────────────────────────────────────────────
CLASSIFICATION_MODELS = {
    'random_forest': {
        'class': RandomForestClassifier,
        'default_params': {'n_estimators': 100, 'max_depth': None, 'random_state': 42},
        'description': 'Ensemble of decision trees - great general purpose'
    },
    'gradient_boosting': {
        'class': GradientBoostingClassifier,
        'default_params': {'n_estimators': 100, 'learning_rate': 0.1, 'max_depth': 3},
        'description': 'Sequential boosting - high accuracy'
    },
    'logistic_regression': {
        'class': LogisticRegression,
        'default_params': {'max_iter': 1000, 'random_state': 42},
        'description': 'Linear model - fast and interpretable'
    },
    'svm': {
        'class': SVC,
        'default_params': {'kernel': 'rbf', 'probability': True, 'random_state': 42},
        'description': 'Support Vector Machine - good for small datasets'
    },
    'knn': {
        'class': KNeighborsClassifier,
        'default_params': {'n_neighbors': 5},
        'description': 'K-Nearest Neighbors - simple, interpretable'
    },
    'decision_tree': {
        'class': DecisionTreeClassifier,
        'default_params': {'max_depth': 10, 'random_state': 42},
        'description': 'Decision tree - most interpretable'
    },
    'extra_trees': {
        'class': ExtraTreesClassifier,
        'default_params': {'n_estimators': 100, 'random_state': 42},
        'description': 'Extra randomized trees - fast training'
    },
}

if XGBOOST_AVAILABLE:
    CLASSIFICATION_MODELS['xgboost'] = {
        'class': xgb.XGBClassifier,
        'default_params': {'n_estimators': 100, 'learning_rate': 0.1, 'use_label_encoder': False, 'eval_metric': 'logloss'},
        'description': 'XGBoost - competition-grade accuracy'
    }

if LIGHTGBM_AVAILABLE:
    CLASSIFICATION_MODELS['lightgbm'] = {
        'class': lgb.LGBMClassifier,
        'default_params': {'n_estimators': 100, 'learning_rate': 0.1, 'verbose': -1},
        'description': 'LightGBM - fast, accurate, handles large data'
    }

REGRESSION_MODELS = {
    'random_forest': {
        'class': RandomForestRegressor,
        'default_params': {'n_estimators': 100, 'random_state': 42},
        'description': 'Random Forest Regressor'
    },
    'gradient_boosting': {
        'class': GradientBoostingRegressor,
        'default_params': {'n_estimators': 100, 'learning_rate': 0.1},
        'description': 'Gradient Boosting Regressor'
    },
    'linear_regression': {
        'class': LinearRegression,
        'default_params': {},
        'description': 'Linear Regression - fast, interpretable'
    },
    'ridge': {
        'class': Ridge,
        'default_params': {'alpha': 1.0},
        'description': 'Ridge regression with L2 regularization'
    },
    'lasso': {
        'class': Lasso,
        'default_params': {'alpha': 1.0},
        'description': 'Lasso regression with feature selection'
    },
    'svr': {
        'class': SVR,
        'default_params': {'kernel': 'rbf'},
        'description': 'Support Vector Regression'
    },
}

if XGBOOST_AVAILABLE:
    REGRESSION_MODELS['xgboost'] = {
        'class': xgb.XGBRegressor,
        'default_params': {'n_estimators': 100, 'learning_rate': 0.1},
        'description': 'XGBoost Regressor'
    }

CLUSTERING_MODELS = {
    'kmeans': {
        'class': KMeans,
        'default_params': {'n_clusters': 3, 'random_state': 42, 'n_init': 10},
        'description': 'K-Means - fast, good for spherical clusters'
    },
    'dbscan': {
        'class': DBSCAN,
        'default_params': {'eps': 0.5, 'min_samples': 5},
        'description': 'DBSCAN - finds arbitrary shapes, handles noise'
    },
    'hierarchical': {
        'class': AgglomerativeClustering,
        'default_params': {'n_clusters': 3, 'linkage': 'ward'},
        'description': 'Hierarchical clustering - dendrogram view'
    },
}


# ─────────────────────────────────────────────────────────────────
# ML SERVICE CLASS
# ─────────────────────────────────────────────────────────────────
class MLService:

    # ──────────────────────────────────────────
    # DATA LOADING (big-data safe)
    # ──────────────────────────────────────────
    @staticmethod
    async def load_dataset(
        df: pd.DataFrame,
        max_rows: int = 500_000,
        sample_for_large: bool = True
    ) -> pd.DataFrame:
        """
        Load dataset from DataFrame.
        For datasets > max_rows, samples intelligently.
        """
        if len(df) > max_rows and sample_for_large:
            return df.sample(n=min(max_rows, len(df)), random_state=42)
        return df

    # ──────────────────────────────────────────
    # PREPROCESSING PIPELINE
    # ──────────────────────────────────────────
    @staticmethod
    def preprocess(
        df: pd.DataFrame,
        target_col: str,
        feature_cols: List[str],
        task_type: str
    ) -> Tuple[np.ndarray, np.ndarray, dict]:
        """
        Full preprocessing pipeline:
        - Handle missing values
        - Encode categoricals
        - Scale numerics
        - Return X, y, and preprocessing metadata
        """
        meta = {'encoders': {}, 'scaler': None, 'feature_names': feature_cols}

        X_df = df[feature_cols].copy()
        y = df[target_col].copy()

        # ── Encode target for classification ──
        if task_type == 'classification':
            le = LabelEncoder()
            y = le.fit_transform(y.astype(str))
            meta['label_encoder'] = le
            meta['classes'] = list(le.classes_)

        # ── Separate numeric and categorical ──
        numeric_cols = X_df.select_dtypes(include=[np.number]).columns.tolist()
        cat_cols = X_df.select_dtypes(exclude=[np.number]).columns.tolist()

        # ── Handle missing values ──
        if numeric_cols:
            X_df[numeric_cols] = X_df[numeric_cols].fillna(X_df[numeric_cols].median())
        if cat_cols:
            X_df[cat_cols] = X_df[cat_cols].fillna(X_df[cat_cols].mode().iloc[0] if len(X_df[cat_cols].mode()) > 0 else 'unknown')

        # ── Encode categoricals ──
        for col in cat_cols:
            le = LabelEncoder()
            X_df[col] = le.fit_transform(X_df[col].astype(str))
            meta['encoders'][col] = le

        # ── Scale features ──
        scaler = StandardScaler()
        X = scaler.fit_transform(X_df)
        meta['scaler'] = scaler

        return X, y.values, meta

    # ──────────────────────────────────────────
    # TRAIN CLASSIFICATION MODEL
    # ──────────────────────────────────────────
    @staticmethod
    async def train_classification(
        df: pd.DataFrame,
        experiment_id: str,
        target_col: str,
        feature_cols: List[str],
        model_name: str = 'random_forest',
        hyperparams: Optional[Dict] = None,
        test_size: float = 0.2,
        cv_folds: int = 5,
        progress_callback = None
    ) -> Dict[str, Any]:

        # Load data
        if progress_callback: await progress_callback(5, "Loading dataset...")
        df = await MLService.load_dataset(df)

        # Preprocess
        if progress_callback: await progress_callback(15, "Preprocessing data...")
        X, y, meta = MLService.preprocess(df, target_col, feature_cols, 'classification')

        # Train/test split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        # Get model
        model_config = CLASSIFICATION_MODELS.get(model_name)
        if not model_config:
            raise ValueError(f"Unknown model: {model_name}")

        params = {**model_config['default_params'], **(hyperparams or {})}
        model = model_config['class'](**params)

        # Train
        if progress_callback: await progress_callback(30, f"Training {model_name}...")
        model.fit(X_train, y_train)

        # Evaluate
        if progress_callback: await progress_callback(70, "Evaluating model...")
        y_pred = model.predict(X_test)
        y_prob = model.predict_proba(X_test) if hasattr(model, 'predict_proba') else None

        # Cross-validation
        cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42)
        cv_scores = cross_val_score(model, X, y, cv=cv, scoring='f1_weighted')

        # Metrics
        classes = meta.get('classes', [])
        n_classes = len(classes)

        metrics = {
            'accuracy': round(float(accuracy_score(y_test, y_pred)), 4),
            'f1_weighted': round(float(f1_score(y_test, y_pred, average='weighted')), 4),
            'precision': round(float(precision_score(y_test, y_pred, average='weighted', zero_division=0)), 4),
            'recall': round(float(recall_score(y_test, y_pred, average='weighted', zero_division=0)), 4),
            'cv_score_mean': round(float(cv_scores.mean()), 4),
            'cv_score_std': round(float(cv_scores.std()), 4),
            'train_size': len(X_train),
            'test_size': len(X_test),
            'n_classes': n_classes,
            'classes': classes,
        }

        if y_prob is not None and n_classes == 2:
            metrics['roc_auc'] = round(float(roc_auc_score(y_test, y_prob[:, 1])), 4)

        # Confusion matrix
        cm = confusion_matrix(y_test, y_pred).tolist()

        # Feature importance
        feature_importance = {}
        if hasattr(model, 'feature_importances_'):
            importances = model.feature_importances_
            feature_importance = {
                col: round(float(imp), 4)
                for col, imp in zip(feature_cols, importances)
            }
            # Sort by importance descending
            feature_importance = dict(
                sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
            )

        if progress_callback: await progress_callback(90, "Saving model...")

        # Save model
        model_path = MLService._save_model(model, meta, experiment_id)

        if progress_callback: await progress_callback(100, "Complete!")

        return {
            'model': model,
            'meta': meta,
            'metrics': metrics,
            'confusion_matrix': cm,
            'feature_importance': feature_importance,
            'model_path': model_path,
            'classification_report': classification_report(
                y_test, y_pred, output_dict=True
            )
        }

    # ──────────────────────────────────────────
    # TRAIN REGRESSION MODEL
    # ──────────────────────────────────────────
    @staticmethod
    async def train_regression(
        df: pd.DataFrame,
        experiment_id: str,
        target_col: str,
        feature_cols: List[str],
        model_name: str = 'random_forest',
        hyperparams: Optional[Dict] = None,
        test_size: float = 0.2,
        cv_folds: int = 5,
        progress_callback = None
    ) -> Dict[str, Any]:

        if progress_callback: await progress_callback(5, "Loading dataset...")
        df = await MLService.load_dataset(df)

        if progress_callback: await progress_callback(15, "Preprocessing...")
        X, y, meta = MLService.preprocess(df, target_col, feature_cols, 'regression')

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42
        )

        model_config = REGRESSION_MODELS.get(model_name)
        if not model_config:
            raise ValueError(f"Unknown model: {model_name}")

        params = {**model_config['default_params'], **(hyperparams or {})}
        model = model_config['class'](**params)

        if progress_callback: await progress_callback(30, f"Training {model_name}...")
        model.fit(X_train, y_train)

        if progress_callback: await progress_callback(70, "Evaluating...")
        y_pred = model.predict(X_test)

        cv_scores = cross_val_score(model, X, y, cv=cv_folds, scoring='r2')

        metrics = {
            'rmse': round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 4),
            'mae': round(float(mean_absolute_error(y_test, y_pred)), 4),
            'r2': round(float(r2_score(y_test, y_pred)), 4),
            'mape': round(float(np.mean(np.abs((y_test - y_pred) / (np.abs(y_test) + 1e-10))) * 100), 4),
            'cv_r2_mean': round(float(cv_scores.mean()), 4),
            'cv_r2_std': round(float(cv_scores.std()), 4),
            'train_size': len(X_train),
            'test_size': len(X_test),
        }

        feature_importance = {}
        if hasattr(model, 'feature_importances_'):
            importances = model.feature_importances_
            feature_importance = dict(
                sorted(
                    {col: round(float(imp), 4) for col, imp in zip(feature_cols, importances)}.items(),
                    key=lambda x: x[1], reverse=True
                )
            )

        model_path = MLService._save_model(model, meta, experiment_id)
        if progress_callback: await progress_callback(100, "Complete!")

        return {
            'model': model,
            'meta': meta,
            'metrics': metrics,
            'feature_importance': feature_importance,
            'model_path': model_path,
            'actual_vs_predicted': [
                {'actual': float(a), 'predicted': float(p)}
                for a, p in zip(y_test[:200], y_pred[:200])  # limit for UI
            ]
        }

    # ──────────────────────────────────────────
    # CLUSTERING
    # ──────────────────────────────────────────
    @staticmethod
    async def train_clustering(
        df: pd.DataFrame,
        experiment_id: str,
        feature_cols: List[str],
        model_name: str = 'kmeans',
        hyperparams: Optional[Dict] = None,
        progress_callback = None
    ) -> Dict[str, Any]:

        if progress_callback: await progress_callback(5, "Loading dataset...")
        df = await MLService.load_dataset(df)
        X_df = df[feature_cols].copy()

        # Fill missing, scale
        X_df = X_df.fillna(X_df.median(numeric_only=True))
        numeric_cols = X_df.select_dtypes(include=[np.number]).columns.tolist()
        for col in X_df.select_dtypes(exclude=[np.number]).columns:
            X_df[col] = LabelEncoder().fit_transform(X_df[col].astype(str))

        scaler = StandardScaler()
        X = scaler.fit_transform(X_df)

        model_config = CLUSTERING_MODELS.get(model_name)
        params = {**model_config['default_params'], **(hyperparams or {})}
        model = model_config['class'](**params)

        if progress_callback: await progress_callback(40, f"Clustering with {model_name}...")
        labels = model.fit_predict(X)

        # Metrics
        metrics = {'n_clusters': len(set(labels)) - (1 if -1 in labels else 0)}
        if metrics['n_clusters'] > 1:
            metrics['silhouette_score'] = round(float(silhouette_score(X, labels)), 4)
            metrics['davies_bouldin_score'] = round(float(davies_bouldin_score(X, labels)), 4)

        # Cluster distribution
        unique, counts = np.unique(labels, return_counts=True)
        metrics['cluster_distribution'] = {
            f'Cluster {int(k)}': int(v) for k, v in zip(unique, counts)
        }

        # Add cluster labels to original data
        df['cluster'] = labels
        cluster_summary = df.groupby('cluster')[feature_cols].mean().round(3)

        if progress_callback: await progress_callback(100, "Complete!")

        return {
            'metrics': metrics,
            'labels': labels.tolist(),
            'cluster_summary': cluster_summary.to_dict(),
            'cluster_data': [
                {**{col: float(row[col]) if isinstance(row[col], (int, float, np.number)) else str(row[col]) for col in feature_cols},
                 'cluster': int(row['cluster'])}
                for _, row in df[feature_cols + ['cluster']].head(1000).iterrows()
            ]
        }

    # ──────────────────────────────────────────
    # TIME SERIES FORECASTING
    # ──────────────────────────────────────────
    @staticmethod
    async def train_forecasting(
        df: pd.DataFrame,
        experiment_id: str,
        date_column: str,
        target_col: str,
        forecast_periods: int = 30,
        model_name: str = 'prophet',
        progress_callback = None
    ) -> Dict[str, Any]:

        if progress_callback: await progress_callback(5, "Loading dataset...")
        df = await MLService.load_dataset(df)

        df[date_column] = pd.to_datetime(df[date_column])
        df = df.sort_values(date_column)
        df = df.dropna(subset=[target_col])

        if model_name == 'prophet' and PROPHET_AVAILABLE:
            if progress_callback: await progress_callback(20, "Training Prophet...")
            prophet_df = df[[date_column, target_col]].rename(
                columns={date_column: 'ds', target_col: 'y'}
            )
            model = Prophet(
                yearly_seasonality=True,
                weekly_seasonality=True,
                daily_seasonality=False,
                changepoint_prior_scale=0.05,
                interval_width=0.95
            )
            with open(os.devnull, 'w') as devnull:
                model.fit(prophet_df)
            future = model.make_future_dataframe(periods=forecast_periods)
            forecast = model.predict(future)

            forecast_result = forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].tail(forecast_periods)

            # Training metrics (in-sample)
            in_sample = model.predict(prophet_df)
            y_true = prophet_df['y'].values
            y_pred = in_sample['yhat'].values
            metrics = {
                'rmse': round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 4),
                'mae': round(float(mean_absolute_error(y_true, y_pred)), 4),
                'r2': round(float(r2_score(y_true, y_pred)), 4),
                'forecast_periods': forecast_periods,
            }

            if progress_callback: await progress_callback(100, "Forecast complete!")
            return {
                'metrics': metrics,
                'historical': [
                    {'date': str(row['ds'].date()), 'actual': float(row['y'])}
                    for _, row in prophet_df.iterrows()
                ],
                'forecast': [
                    {
                        'date': str(row['ds'].date()),
                        'forecast': round(float(row['yhat']), 4),
                        'lower': round(float(row['yhat_lower']), 4),
                        'upper': round(float(row['yhat_upper']), 4),
                    }
                    for _, row in forecast_result.iterrows()
                ],
                'components': {
                    'trend': forecast[['ds', 'trend']].tail(forecast_periods).to_dict('records'),
                }
            }

        elif model_name == 'arima':
            if progress_callback: await progress_callback(20, "Training ARIMA...")
            ts = df.set_index(date_column)[target_col]
            model = ARIMA(ts, order=(2, 1, 2))
            fitted = model.fit()
            forecast = fitted.forecast(steps=forecast_periods)
            conf_int = fitted.get_forecast(steps=forecast_periods).conf_int()

            y_pred = fitted.fittedvalues
            metrics = {
                'rmse': round(float(np.sqrt(mean_squared_error(ts.values[1:], y_pred.values[1:]))), 4),
                'mae': round(float(mean_absolute_error(ts.values[1:], y_pred.values[1:])), 4),
                'aic': round(float(fitted.aic), 4),
                'bic': round(float(fitted.bic), 4),
            }

            if progress_callback: await progress_callback(100, "Forecast complete!")
            return {
                'metrics': metrics,
                'historical': [
                    {'date': str(idx.date()) if hasattr(idx, 'date') else str(idx), 'actual': float(val)}
                    for idx, val in ts.items()
                ],
                'forecast': [
                    {
                        'date': f"Period_{i+1}",
                        'forecast': round(float(v), 4),
                        'lower': round(float(conf_int.iloc[i, 0]), 4),
                        'upper': round(float(conf_int.iloc[i, 1]), 4),
                    }
                    for i, v in enumerate(forecast)
                ]
            }

        else:
            raise ValueError(f"Unknown forecasting model: {model_name}")

    # ──────────────────────────────────────────
    # PREDICT WITH SAVED MODEL
    # ──────────────────────────────────────────
    @staticmethod
    def predict(
        model_path: str,
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Load saved model and make prediction on new data"""
        data = MLService._load_model(model_path)
        model = data['model']
        meta = data['meta']
        scaler = meta.get('scaler')
        encoders = meta.get('encoders', {})
        feature_cols = meta.get('feature_names', [])

        # Prepare input
        row = pd.DataFrame([input_data])
        for col, enc in encoders.items():
            if col in row.columns:
                row[col] = enc.transform(row[col].astype(str))

        X = row[feature_cols].values
        if scaler:
            X = scaler.transform(X)

        pred = model.predict(X)[0]

        # Decode label if classification
        le = meta.get('label_encoder')
        if le:
            pred_label = le.inverse_transform([int(pred)])[0]
        else:
            pred_label = pred

        result = {'prediction': pred_label}

        if hasattr(model, 'predict_proba'):
            proba = model.predict_proba(X)[0]
            classes = meta.get('classes', [])
            result['probabilities'] = {
                cls: round(float(p), 4) for cls, p in zip(classes, proba)
            }
            result['confidence'] = round(float(max(proba)), 4)

        return result

    # ──────────────────────────────────────────
    # HELPERS
    # ──────────────────────────────────────────
    @staticmethod
    def _save_model(model, meta: dict, experiment_id: str) -> str:
        path = f"/tmp/model_{experiment_id}.pkl"
        joblib.dump({'model': model, 'meta': meta}, path)
        return path

    @staticmethod
    def _load_model(path: str) -> dict:
        return joblib.load(path)
