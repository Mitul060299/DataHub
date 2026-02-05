from typing import Dict, Any
import pandas as pd


def generate_summary(df: pd.DataFrame, column: str, bins: int = 10, top_n: int = 10) -> Dict[str, Any]:
    if column not in df.columns:
        raise KeyError("Column not found")

    series = df[column].dropna()
    if series.empty:
        return {"kind": "empty", "series": []}

    if pd.api.types.is_numeric_dtype(series):
        bins = max(3, min(50, int(bins)))
        bucketed = pd.cut(series, bins=bins)
        counts = bucketed.value_counts().sort_index()
        summary = [
            {"label": str(interval), "value": int(count)}
            for interval, count in counts.items()
        ]
        return {"kind": "histogram", "series": summary}

    top_n = max(3, min(50, int(top_n)))
    counts = series.astype(str).value_counts().head(top_n)
    summary = [
        {"label": str(label), "value": int(count)}
        for label, count in counts.items()
    ]
    return {"kind": "categorical", "series": summary}
