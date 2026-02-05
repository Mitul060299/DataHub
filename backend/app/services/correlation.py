from typing import List
import pandas as pd


def compute_correlations(df: pd.DataFrame, top_n: int = 10) -> List[dict]:
    numeric_df = df.select_dtypes(include="number")
    if numeric_df.shape[1] < 2:
        return []
    corr = numeric_df.corr().fillna(0)
    pairs = []
    cols = list(corr.columns)
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            value = float(corr.iloc[i, j])
            pairs.append({"column_a": cols[i], "column_b": cols[j], "value": value})
    pairs.sort(key=lambda item: abs(item["value"]), reverse=True)
    return pairs[:top_n]
