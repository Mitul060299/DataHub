from typing import List
import pandas as pd
from ..models import TransformationStep


def suggest_steps(df: pd.DataFrame) -> List[TransformationStep]:
    suggestions: List[TransformationStep] = []

    duplicate_rows = int(df.duplicated().sum())
    if duplicate_rows > 0:
        suggestions.append(
            TransformationStep(
                name="drop_duplicates",
                params={"keep": "first"},
            )
        )

    for column in df.columns:
        missing = int(df[column].isna().sum())
        if missing > 0:
            suggestions.append(
                TransformationStep(
                    name="fill_missing",
                    params={"columns": [column], "value": 0},
                )
            )

        series = df[column]
        if series.dtype == object:
            sample = series.dropna().astype(str)
            if not sample.empty:
                numeric = pd.to_numeric(sample, errors="coerce")
                numeric_ratio = numeric.notna().mean()
                if numeric_ratio >= 0.9:
                    suggestions.append(
                        TransformationStep(
                            name="cast_type",
                            params={"column": column, "dtype": "float"},
                        )
                    )
                    continue
                parsed_dates = pd.to_datetime(sample, errors="coerce", infer_datetime_format=True)
                date_ratio = parsed_dates.notna().mean()
                if date_ratio >= 0.9:
                    suggestions.append(
                        TransformationStep(
                            name="cast_type",
                            params={"column": column, "dtype": "datetime64[ns]"},
                        )
                    )

    return suggestions
