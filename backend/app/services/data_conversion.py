from __future__ import annotations

from typing import Any

import pandas as pd

from ..config import settings


class DataConversionService:
    @staticmethod
    def dataframe_to_parquet(df: pd.DataFrame, original_size: int) -> tuple[bytes, dict[str, Any], int, dict[str, Any], float]:
        schema = DataConversionService._infer_schema(df)
        stats = DataConversionService._generate_stats(df, schema)

        parquet_bytes = df.to_parquet(
            index=False,
            compression="zstd",
            compression_level=settings.compression_level,
        )

        compressed_size = len(parquet_bytes)
        compression_ratio = 0.0
        if original_size > 0:
            compression_ratio = ((original_size - compressed_size) / original_size) * 100

        return parquet_bytes, schema, int(df.shape[0]), stats, compression_ratio

    @staticmethod
    def _infer_schema(df: pd.DataFrame) -> dict[str, Any]:
        schema: dict[str, Any] = {}
        for column in df.columns:
            series = df[column]
            dtype = series.dtype
            if pd.api.types.is_bool_dtype(dtype):
                inferred = "boolean"
            elif pd.api.types.is_integer_dtype(dtype):
                inferred = "int64"
            elif pd.api.types.is_float_dtype(dtype):
                inferred = "double"
            elif pd.api.types.is_datetime64_any_dtype(dtype):
                inferred = "timestamp"
            else:
                inferred = "string"

            schema[str(column)] = {
                "type": inferred,
                "nullable": bool(series.isna().any()),
            }
        return schema

    @staticmethod
    def _generate_stats(df: pd.DataFrame, schema: dict[str, Any]) -> dict[str, Any]:
        stats: dict[str, Any] = {
            "totalRows": int(df.shape[0]),
            "columns": {},
        }

        for column in df.columns:
            series = df[column]
            values = series.dropna()
            null_count = int(series.isna().sum())
            null_percentage = 0.0
            if len(series) > 0:
                null_percentage = round((null_count / len(series)) * 100, 2)

            col_stats: dict[str, Any] = {
                "nullCount": null_count,
                "nullPercentage": null_percentage,
                "uniqueCount": int(values.nunique(dropna=True)),
                "dataType": schema[str(column)]["type"],
            }

            if schema[str(column)]["type"] in {"int64", "double"}:
                numeric = pd.to_numeric(values, errors="coerce").dropna()
                if not numeric.empty:
                    col_stats["min"] = float(numeric.min())
                    col_stats["max"] = float(numeric.max())
                    col_stats["mean"] = float(round(numeric.mean(), 2))
                    col_stats["median"] = float(round(numeric.median(), 2))
            if schema[str(column)]["type"] == "string":
                lengths = values.astype(str).map(len)
                if not lengths.empty:
                    col_stats["avgLength"] = float(round(lengths.mean(), 2))
                    col_stats["maxLength"] = int(lengths.max())

            stats["columns"][str(column)] = col_stats

        return stats
