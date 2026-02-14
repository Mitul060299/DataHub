from __future__ import annotations

from io import BytesIO
import pandas as pd


class FileParserService:
    @staticmethod
    def parse_file(content: bytes, filename: str) -> pd.DataFrame:
        extension = filename.rsplit(".", 1)[-1].lower()
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

        raise ValueError("Unsupported file type")
