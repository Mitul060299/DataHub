from typing import Dict, Any, List
import pandas as pd


def infer_series_type(series: pd.Series) -> Dict[str, Any]:
    values = series.dropna()
    if values.empty:
        return {"inferred_type": "empty", "inference_confidence": 1.0}

    if pd.api.types.is_bool_dtype(values):
        return {"inferred_type": "boolean", "inference_confidence": 1.0}

    if pd.api.types.is_numeric_dtype(values):
        if pd.api.types.is_integer_dtype(values):
            return {"inferred_type": "integer", "inference_confidence": 0.95}
        return {"inferred_type": "float", "inference_confidence": 0.95}

    if pd.api.types.is_datetime64_any_dtype(values):
        return {"inferred_type": "datetime", "inference_confidence": 0.95}

    try:
        parsed = pd.to_datetime(values, errors="coerce", infer_datetime_format=True)
        ratio = parsed.notna().mean()
        if ratio >= 0.8:
            return {"inferred_type": "datetime", "inference_confidence": float(round(ratio, 2))}
    except Exception:
        pass

    normalized = values.astype(str).str.strip().str.lower()
    bool_set = {"true", "false", "yes", "no", "0", "1"}
    bool_ratio = normalized.isin(bool_set).mean()
    if bool_ratio >= 0.9:
        return {"inferred_type": "boolean", "inference_confidence": float(round(bool_ratio, 2))}

    unique_ratio = values.nunique(dropna=True) / max(1, len(values))
    if unique_ratio <= 0.2:
        return {"inferred_type": "categorical", "inference_confidence": float(round(1 - unique_ratio, 2))}

    return {"inferred_type": "text", "inference_confidence": 0.6}


def profile_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
    column_profiles: Dict[str, Dict[str, Any]] = {}
    issues: List[str] = []

    for column in df.columns:
        series = df[column]
        profile = {
            "dtype": str(series.dtype),
            "missing": int(series.isna().sum()),
            "unique": int(series.nunique(dropna=True)),
        }
        profile.update(infer_series_type(series))
        if pd.api.types.is_numeric_dtype(series):
            profile.update(
                {
                    "min": float(series.min(skipna=True)) if not series.dropna().empty else None,
                    "max": float(series.max(skipna=True)) if not series.dropna().empty else None,
                    "mean": float(series.mean(skipna=True)) if not series.dropna().empty else None,
                }
            )
        else:
            profile["top"] = series.mode(dropna=True).iloc[0] if not series.mode(dropna=True).empty else None

        if profile["missing"] > 0:
            issues.append(f"Column '{column}' has {profile['missing']} missing values")
        column_profiles[column] = profile

    return {"column_profiles": column_profiles, "issues": issues}
