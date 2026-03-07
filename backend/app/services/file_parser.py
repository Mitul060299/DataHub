from __future__ import annotations

from io import BytesIO
import pandas as pd


class FileParserService:
    @staticmethod
    def detect_file_format(filename: str) -> str:
        extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if extension in {"csv", "txt", "tsv"}:
            return "csv"
        if extension in {"xls", "xlsx"}:
            return "excel"
        if extension == "json":
            return "json"
        if extension == "parquet":
            return "parquet"
        raise ValueError("Unsupported file type. Supported formats: CSV, Excel, JSON, Parquet")

    @staticmethod
    def parse_file(content: bytes, filename: str) -> pd.DataFrame:
        extension = filename.rsplit(".", 1)[-1].lower()
        FileParserService.detect_file_format(filename)
        buffer = BytesIO(content)

        if extension in {"csv", "txt"}:
            return pd.read_csv(buffer)
        if extension == "tsv":
            return pd.read_csv(buffer, sep="\t")
        if extension in {"xls", "xlsx"}:
            return pd.read_excel(buffer)
        if extension == "json":
            return pd.read_json(buffer)
        if extension == "parquet":
            try:
                return pd.read_parquet(buffer)
            except Exception as exc:
                raise ValueError("Parquet support requires pyarrow") from exc

        raise ValueError("Unsupported file type. Supported formats: CSV, Excel, JSON, Parquet")
