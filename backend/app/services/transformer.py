from typing import List, Optional
import pandas as pd
from ..models import TransformationStep


def apply_steps(
    df: pd.DataFrame,
    steps: List[TransformationStep],
    db=None,  # optional sqlalchemy Session – required for join/union by dataset_id
) -> pd.DataFrame:
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
            other_dataset_id = params.get("dataset_id")
            other_inline = params.get("other")
            on = params.get("on")
            how = params.get("how", "left")
            other_df: Optional[pd.DataFrame] = None

            if other_dataset_id and db is not None:
                # Load the other dataset from storage by ID
                from ..routers.datasets import get_dataset_from_db  # local import to avoid circular
                try:
                    other_df = get_dataset_from_db(str(other_dataset_id), db)
                except KeyError:
                    raise ValueError(f"Join dataset '{other_dataset_id}' not found")
            elif isinstance(other_inline, list):
                other_df = pd.DataFrame(other_inline)

            if other_df is not None and on:
                result = result.merge(other_df, on=on, how=how)
        elif name == "union":
            # Stack another dataset vertically, keeping all columns (outer) or common only (inner)
            other_dataset_id = params.get("dataset_id")
            other_inline = params.get("other")
            distinct = bool(params.get("distinct", False))
            join_type = "outer" if params.get("keep_all_columns", True) else "inner"
            other_df = None

            if other_dataset_id and db is not None:
                from ..routers.datasets import get_dataset_from_db
                try:
                    other_df = get_dataset_from_db(str(other_dataset_id), db)
                except KeyError:
                    raise ValueError(f"Union dataset '{other_dataset_id}' not found")
            elif isinstance(other_inline, list):
                other_df = pd.DataFrame(other_inline)

            if other_df is not None:
                result = pd.concat([result, other_df], ignore_index=True, join=join_type)
                if distinct:
                    result = result.drop_duplicates()
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
