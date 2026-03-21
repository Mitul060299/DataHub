"""
pipeline_template_service.py
=============================
Built-in curated pipeline templates that users can instantiate.

Each template has a list of pipeline steps in the same format as
PipelineV2DB.steps — the engine consumes them directly.

Templates are static (no DB table needed). New ones can be added here.
"""
from __future__ import annotations

from typing import Any

TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "clean-csv",
        "name": "CSV Cleaner",
        "description": "Remove duplicates, trim whitespace, drop null-heavy columns, and rename columns to snake_case.",
        "category": "Data Quality",
        "tags": ["csv", "cleaning", "quality"],
        "steps": [
            {
                "id": "step-1",
                "name": "Drop duplicates",
                "type": "transform",
                "config": {
                    "operation": "drop_duplicates",
                    "description": "Remove duplicate rows",
                },
            },
            {
                "id": "step-2",
                "name": "Trim whitespace",
                "type": "transform",
                "config": {
                    "operation": "trim_string_columns",
                    "description": "Strip leading/trailing whitespace from all string columns",
                },
            },
            {
                "id": "step-3",
                "name": "Drop null-heavy columns",
                "type": "transform",
                "config": {
                    "operation": "drop_null_columns",
                    "threshold": 0.5,
                    "description": "Drop columns with more than 50% null values",
                },
            },
            {
                "id": "step-4",
                "name": "Rename to snake_case",
                "type": "transform",
                "config": {
                    "operation": "rename_snake_case",
                    "description": "Convert column headers to lowercase snake_case",
                },
            },
        ],
    },
    {
        "id": "sales-summary",
        "name": "Sales Summary",
        "description": "Aggregate sales data: group by date + product, sum revenue, compute monthly totals.",
        "category": "Aggregation",
        "tags": ["sales", "aggregation", "reporting"],
        "steps": [
            {
                "id": "step-1",
                "name": "Parse dates",
                "type": "transform",
                "config": {
                    "operation": "parse_dates",
                    "description": "Auto-detect and parse date columns",
                },
            },
            {
                "id": "step-2",
                "name": "Group by date + product",
                "type": "sql",
                "config": {
                    "sql": (
                        "SELECT date_trunc('month', date_col) AS month,\n"
                        "       product,\n"
                        "       SUM(revenue) AS total_revenue,\n"
                        "       COUNT(*) AS order_count\n"
                        "FROM {dataset}\n"
                        "GROUP BY 1, 2\n"
                        "ORDER BY 1, 2"
                    ),
                    "description": "Monthly revenue by product",
                },
            },
        ],
    },
    {
        "id": "join-enrich",
        "name": "Dataset Joiner",
        "description": "Join two datasets on a shared key column and produce an enriched output.",
        "category": "Data Enrichment",
        "tags": ["join", "merge", "enrichment"],
        "steps": [
            {
                "id": "step-1",
                "name": "Join on key",
                "type": "sql",
                "config": {
                    "sql": (
                        "SELECT a.*, b.*\n"
                        "FROM {dataset} a\n"
                        "LEFT JOIN {extra_dataset_0} b ON a.id = b.id"
                    ),
                    "description": "Left join primary dataset with secondary on 'id' key",
                },
            },
        ],
    },
    {
        "id": "text-analytics",
        "name": "Text Analytics",
        "description": "Run sentiment analysis and keyword extraction on a text column.",
        "category": "AI / NLP",
        "tags": ["nlp", "sentiment", "text", "ai"],
        "steps": [
            {
                "id": "step-1",
                "name": "Sentiment analysis",
                "type": "ai_transform",
                "config": {
                    "operation": "sentiment",
                    "input_column": "text",
                    "output_column": "sentiment_score",
                    "description": "Score each row's text as positive/neutral/negative",
                },
            },
            {
                "id": "step-2",
                "name": "Keyword extraction",
                "type": "ai_transform",
                "config": {
                    "operation": "keywords",
                    "input_column": "text",
                    "output_column": "keywords",
                    "top_k": 5,
                    "description": "Extract top-5 keywords per row",
                },
            },
        ],
    },
    {
        "id": "anomaly-detection",
        "name": "Anomaly Detector",
        "description": "Flag statistical outliers in numeric columns using Z-score > 3.",
        "category": "AI / Analytics",
        "tags": ["anomaly", "outliers", "statistics", "ai"],
        "steps": [
            {
                "id": "step-1",
                "name": "Detect outliers",
                "type": "ai_transform",
                "config": {
                    "operation": "anomaly_detection",
                    "method": "zscore",
                    "threshold": 3.0,
                    "output_column": "is_anomaly",
                    "description": "Flag rows where any numeric column exceeds 3 standard deviations",
                },
            },
        ],
    },
    {
        "id": "time-series-forecast",
        "name": "Time-Series Forecast",
        "description": "Resample time-series data by day and project a 7-day rolling average.",
        "category": "Analytics",
        "tags": ["time-series", "forecast", "rolling"],
        "steps": [
            {
                "id": "step-1",
                "name": "Parse & resample",
                "type": "transform",
                "config": {
                    "operation": "resample_timeseries",
                    "freq": "D",
                    "agg": "sum",
                    "description": "Resample to daily frequency",
                },
            },
            {
                "id": "step-2",
                "name": "7-day rolling average",
                "type": "sql",
                "config": {
                    "sql": (
                        "SELECT date_col,\n"
                        "       value,\n"
                        "       AVG(value) OVER (ORDER BY date_col ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_7d\n"
                        "FROM {dataset}\n"
                        "ORDER BY date_col"
                    ),
                    "description": "Compute 7-day rolling average",
                },
            },
        ],
    },
]

_TEMPLATE_BY_ID: dict[str, dict] = {t["id"]: t for t in TEMPLATES}


def list_templates(category: str | None = None, tag: str | None = None) -> list[dict]:
    results = TEMPLATES
    if category:
        results = [t for t in results if t["category"].lower() == category.lower()]
    if tag:
        results = [t for t in results if tag.lower() in [x.lower() for x in t["tags"]]]
    return results


def get_template(template_id: str) -> dict | None:
    return _TEMPLATE_BY_ID.get(template_id)
