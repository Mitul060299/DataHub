from typing import List
import pandas as pd
from .llm import generate_insight_narrative
from .context_store import context_store


def generate_insights(df: pd.DataFrame, context_text: str | None = None) -> dict:
    highlights: List[str] = []
    anomalies: List[str] = []
    recommendations: List[str] = []
    explanations: List[str] = []

    if df.empty:
        return {
            "highlights": ["Dataset is empty"],
            "anomalies": [],
            "recommendations": ["Upload a dataset with rows"],
            "explanations": ["No rows means no statistics or patterns can be computed."],
        }

    duplicate_rows = int(df.duplicated().sum())
    if duplicate_rows > 0:
        anomalies.append(f"Dataset has {duplicate_rows} duplicate rows")
        recommendations.append("Consider de-duplicating rows to improve data quality")
        explanations.append("Duplicate rows can skew aggregates and ML models.")

    for column in df.columns:
        series = df[column]
        missing = int(series.isna().sum())
        if missing > 0:
            anomalies.append(f"{column} has {missing} missing values")
            recommendations.append(f"Consider imputing or dropping missing values in {column}")
            explanations.append(f"Missing values in {column} can bias averages and downstream models.")

        if pd.api.types.is_numeric_dtype(series):
            clean_series = series.dropna()
            if not clean_series.empty:
                mean_val = float(clean_series.mean())
                std_val = float(clean_series.std()) if float(clean_series.std()) != 0 else 0.0
                highlights.append(f"{column} average: {mean_val:.2f}")
                if std_val > 0:
                    z_scores = (clean_series - mean_val).abs() / std_val
                    outliers = int((z_scores > 3).sum())
                    if outliers > 0:
                        anomalies.append(f"{column} has {outliers} potential outliers (|z| > 3)")
                        recommendations.append(f"Review outliers in {column} for data quality issues")
                        explanations.append(f"Outliers in {column} may indicate errors or rare events.")
            if clean_series.nunique() <= 1:
                anomalies.append(f"{column} has near-zero variance")
                recommendations.append(f"Consider dropping or enriching {column} to add signal")
                explanations.append(f"Low variance in {column} may reduce predictive power.")
        else:
            unique_values = int(series.astype(str).nunique())
            if unique_values > max(50, int(len(series) * 0.8)):
                anomalies.append(f"{column} has high cardinality ({unique_values} unique values)")
                recommendations.append(f"Consider grouping or normalizing {column} to reduce cardinality")
                explanations.append(f"High-cardinality {column} can cause sparse categories and overfitting.")

    if not highlights:
        highlights.append("No numeric columns detected for summary stats")

    if not recommendations:
        recommendations.append("Consider adding business rules for validation")
        explanations.append("Rules encode domain expectations and prevent invalid values.")

    total_checks = max(len(df.columns), 1)
    anomaly_score = min(len(anomalies), total_checks)
    quality_score = max(0, 100 - int((anomaly_score / total_checks) * 60))
    highlights.append(f"Data quality score: {quality_score}/100")

    narrative = generate_insight_narrative(
        highlights,
        anomalies,
        recommendations,
        context_text if context_text is not None else context_store.get_context_text("default"),
    )

    return {
        "highlights": highlights,
        "anomalies": anomalies,
        "recommendations": recommendations,
        "explanations": explanations,
        "narrative": narrative,
    }


def generate_insight_actions(df: pd.DataFrame) -> list[dict]:
    actions: list[dict] = []

    duplicate_rows = int(df.duplicated().sum())
    if duplicate_rows > 0:
        actions.append(
            {
                "name": "drop_duplicates",
                "params": {"keep": "first"},
                "reason": f"Remove {duplicate_rows} duplicate rows",
            }
        )

    for column in df.columns:
        series = df[column]
        missing = int(series.isna().sum())
        if missing > 0:
            if pd.api.types.is_numeric_dtype(series):
                fill_value = float(series.dropna().median()) if not series.dropna().empty else 0
            else:
                fill_value = "unknown"
            actions.append(
                {
                    "name": "fill_missing",
                    "params": {"columns": [column], "value": fill_value},
                    "reason": f"Fill {missing} missing values in {column}",
                }
            )

    return actions
