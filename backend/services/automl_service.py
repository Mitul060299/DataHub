"""
AutoML Service
- OpenAI agent interprets user requirement
- Automatically selects model, features, hyperparameters
- Runs multiple trials and picks best
"""

import json
import asyncio
from typing import Dict, List, Any, Optional
from services.ml_service import MLService, CLASSIFICATION_MODELS, REGRESSION_MODELS
import pandas as pd

try:
    from openai import AsyncOpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

import os


class AutoMLService:

    @staticmethod
    async def understand_request(
        user_message: str,
        dataset_schema: Dict,
        dataset_stats: Dict,
        conversation_history: List[Dict] = None
    ) -> Dict[str, Any]:
        """
        Use GPT-4 with function calling to understand what the user
        wants and produce a full ML experiment configuration.
        """
        if not OPENAI_AVAILABLE:
            # Fallback: basic heuristic classification
            return AutoMLService._heuristic_classify(user_message, dataset_schema, dataset_stats)

        try:
            client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        except Exception:
            return AutoMLService._heuristic_classify(user_message, dataset_schema, dataset_stats)

        tools = [
            {
                "type": "function",
                "function": {
                    "name": "configure_ml_experiment",
                    "description": "Configure a complete ML experiment based on user request",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "experiment_type": {
                                "type": "string",
                                "enum": ["classification", "regression", "clustering",
                                         "forecasting", "anomaly_detection"],
                                "description": "Type of ML task"
                            },
                            "target_column": {
                                "type": "string",
                                "description": "Column to predict (null for clustering)"
                            },
                            "feature_columns": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of feature columns to use"
                            },
                            "models_to_try": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of model names to train and compare"
                            },
                            "reasoning": {
                                "type": "string",
                                "description": "Explanation of why these choices were made"
                            },
                            "response_to_user": {
                                "type": "string",
                                "description": "Natural language response to show user"
                            },
                            "hyperparams": {
                                "type": "object",
                                "description": "Optional hyperparameter overrides"
                            },
                            "date_column": {
                                "type": "string",
                                "description": "Date column for forecasting (if applicable)"
                            },
                            "forecast_periods": {
                                "type": "integer",
                                "description": "Number of periods to forecast (if applicable)"
                            }
                        },
                        "required": ["experiment_type", "feature_columns",
                                     "models_to_try", "reasoning", "response_to_user"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "ask_clarification",
                    "description": "Ask user for more information before configuring",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "question": {"type": "string"}
                        },
                        "required": ["question"]
                    }
                }
            }
        ]

        system_prompt = f"""You are an expert ML engineer and data scientist AI assistant.
Your job is to understand what the user wants to build and configure the optimal ML experiment.

Dataset Schema:
{json.dumps(dataset_schema, indent=2)}

Dataset Stats:
{json.dumps(dataset_stats, indent=2)}

Rules:
1. Infer the task type from the user's description
   - "predict", "will it", "classify" → classification
   - "forecast", "future", "next month" → forecasting  
   - "estimate", "how much", "revenue" → regression
   - "group", "segment", "cluster" → clustering

2. Automatically select good feature columns:
   - Exclude ID columns, timestamps (unless forecasting), high-cardinality strings
   - Include numeric columns, encoded categoricals

3. Recommend 2-4 models to compare (including at least one fast baseline)

4. Always explain your reasoning clearly to the user

5. For forecasting: identify date column and target metric

6. Be conversational and helpful - this is chat interface"""

        messages = [
            {"role": "system", "content": system_prompt},
            *(conversation_history or []),
            {"role": "user", "content": user_message}
        ]

        try:
            response = await client.chat.completions.create(
                model="gpt-4",
                messages=messages,
                tools=tools,
                tool_choice="auto",
                temperature=0.2
            )

            msg = response.choices[0].message

            if msg.tool_calls:
                tool_call = msg.tool_calls[0]
                args = json.loads(tool_call.function.arguments)
                return {
                    "action": tool_call.function.name,
                    "config": args,
                    "text": args.get("response_to_user", "")
                }

            return {
                "action": "chat",
                "config": None,
                "text": msg.content or ""
            }
        except Exception as e:
            return AutoMLService._heuristic_classify(user_message, dataset_schema, dataset_stats)

    @staticmethod
    def _heuristic_classify(
        user_message: str,
        dataset_schema: Dict,
        dataset_stats: Dict
    ) -> Dict[str, Any]:
        """Fallback heuristic classification when OpenAI not available"""
        msg_lower = user_message.lower()
        
        # Infer task type
        if any(word in msg_lower for word in ['predict', 'classify', 'category', 'class', 'will it']):
            task_type = 'classification'
            models = ['random_forest', 'gradient_boosting', 'logistic_regression']
            response = "I'll build a classification model to predict the target category."
        elif any(word in msg_lower for word in ['forecast', 'future', 'next', 'trend']):
            task_type = 'forecasting'
            models = ['prophet', 'arima']
            response = "I'll build a forecasting model using time series analysis."
        elif any(word in msg_lower for word in ['estimate', 'predict value', 'revenue', 'amount']):
            task_type = 'regression'
            models = ['random_forest', 'gradient_boosting', 'linear_regression']
            response = "I'll build a regression model to estimate numeric values."
        elif any(word in msg_lower for word in ['cluster', 'segment', 'group']):
            task_type = 'clustering'
            models = ['kmeans', 'hierarchical']
            response = "I'll build a clustering model to segment your data."
        else:
            task_type = 'classification'
            models = ['random_forest', 'gradient_boosting']
            response = "I'll build an ML model. Please clarify what you want to predict."

        # Get columns from schema
        columns = dataset_schema.get('columns', [])
        if isinstance(columns, dict):
            columns = list(columns.keys())
        
        # Filter feature columns (exclude obvious IDs and timestamps)
        feature_cols = [
            col for col in columns
            if not any(x in col.lower() for x in ['id', 'timestamp', 'date'])
        ][:10]  # Limit to 10 features

        return {
            "action": "configure_ml_experiment",
            "config": {
                "experiment_type": task_type,
                "target_column": columns[0] if columns else None,
                "feature_columns": feature_cols or columns,
                "models_to_try": models,
                "reasoning": "Automated configuration based on your request",
                "response_to_user": response,
                "hyperparams": {},
                "date_column": None,
                "forecast_periods": 30
            },
            "text": response
        }

    # ──────────────────────────────────────────
    # RUN AUTOML: train multiple models & compare
    # ──────────────────────────────────────────
    @staticmethod
    async def run_automl(
        df: pd.DataFrame,
        experiment_id: str,
        config: Dict[str, Any],
        progress_callback=None
    ) -> Dict[str, Any]:
        """
        Run AutoML: train all suggested models, compare, return best.
        """
        experiment_type = config["experiment_type"]
        models_to_try = config.get("models_to_try", ["random_forest"])
        feature_cols = config["feature_columns"]
        target_col = config.get("target_column")

        all_results = []
        total_models = len(models_to_try)

        for i, model_name in enumerate(models_to_try):
            base_progress = int((i / total_models) * 80)

            async def prog(pct, msg):
                if progress_callback:
                    await progress_callback(
                        base_progress + int(pct * 0.8 / total_models),
                        f"[{model_name}] {msg}"
                    )

            try:
                if experiment_type == "classification":
                    result = await MLService.train_classification(
                        df, experiment_id,
                        target_col, feature_cols,
                        model_name=model_name,
                        progress_callback=prog
                    )
                    score = result["metrics"].get("f1_weighted", 0)
                    result["model_name"] = model_name
                    result["primary_metric"] = "f1_weighted"
                    result["primary_score"] = score

                elif experiment_type == "regression":
                    result = await MLService.train_regression(
                        df, experiment_id,
                        target_col, feature_cols,
                        model_name=model_name,
                        progress_callback=prog
                    )
                    score = result["metrics"].get("r2", 0)
                    result["model_name"] = model_name
                    result["primary_metric"] = "r2"
                    result["primary_score"] = score

                elif experiment_type == "clustering":
                    result = await MLService.train_clustering(
                        df, experiment_id,
                        feature_cols,
                        model_name=model_name,
                        progress_callback=prog
                    )
                    score = result["metrics"].get("silhouette_score", 0)
                    result["model_name"] = model_name
                    result["primary_metric"] = "silhouette"
                    result["primary_score"] = score

                all_results.append(result)

            except Exception as e:
                all_results.append({
                    "model_name": model_name,
                    "error": str(e),
                    "primary_score": -999
                })

        # Sort by score
        valid = [r for r in all_results if "error" not in r]
        valid.sort(key=lambda r: r.get("primary_score", 0), reverse=True)

        if not valid:
            raise ValueError("All models failed to train")

        best = valid[0]

        if progress_callback:
            await progress_callback(100, f"Best model: {best['model_name']}")

        return {
            "best_model": best["model_name"],
            "best_result": best,
            "all_results": all_results,
            "comparison": [
                {
                    "model": r.get("model_name"),
                    "score": r.get("primary_score"),
                    "metrics": r.get("metrics", {}),
                    "error": r.get("error")
                }
                for r in all_results
            ]
        }
