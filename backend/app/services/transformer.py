from typing import List
import pandas as pd
from ..models import TransformationStep


def apply_steps(df: pd.DataFrame, steps: List[TransformationStep]) -> pd.DataFrame:
    result = df.copy()

    for step in steps:
        name = step.name
        params = step.params

        if name == "drop_missing":
            columns = params.get("columns")
            result = result.dropna(subset=columns) if columns else result.dropna()
        elif name == "fill_missing":
            value = params.get("value", 0)
            columns = params.get("columns")
            if columns:
                result[columns] = result[columns].fillna(value)
            else:
                result = result.fillna(value)
        elif name == "rename_columns":
            mapping = params.get("mapping", {})
            result = result.rename(columns=mapping)
        elif name == "cast_type":
            column = params.get("column")
            dtype = params.get("dtype")
            if column and dtype:
                result[column] = result[column].astype(dtype, errors="ignore")
        elif name == "filter_rows":
            column = params.get("column")
            op = params.get("op")
            value = params.get("value")
            if column and op is not None:
                if op == ">":
                    result = result[result[column] > value]
                elif op == ">=":
                    result = result[result[column] >= value]
                elif op == "<":
                    result = result[result[column] < value]
                elif op == "<=":
                    result = result[result[column] <= value]
                elif op == "==":
                    result = result[result[column] == value]
        elif name == "pivot":
            index = params.get("index")
            columns = params.get("columns")
            values = params.get("values")
            aggfunc = params.get("aggfunc", "mean")
            if index and columns and values:
                result = result.pivot_table(index=index, columns=columns, values=values, aggfunc=aggfunc).reset_index()
        elif name == "join":
            other = params.get("other")
            on = params.get("on")
            how = params.get("how", "left")
            if isinstance(other, list) and on:
                other_df = pd.DataFrame(other)
                result = result.merge(other_df, on=on, how=how)
        elif name == "add_column_formula":
            new_column = params.get("new_column")
            expression = params.get("expression")
            if new_column and expression:
                result[new_column] = result.eval(expression)
        elif name == "drop_duplicates":
            keep = params.get("keep", "first")
            result = result.drop_duplicates(keep=keep)
        else:
            continue

    return result
