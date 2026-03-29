from __future__ import annotations

import csv
import logging
from io import BytesIO
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)


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
    def _sniff_delimiter(content: bytes) -> str:
        """Auto-detect CSV delimiter using csv.Sniffer on the first 8 KB."""
        try:
            sample = content[:8192].decode("utf-8", errors="replace")
            dialect = csv.Sniffer().sniff(sample, delimiters=",\t|;:")
            return dialect.delimiter
        except csv.Error:
            return ","

    @staticmethod
    def list_excel_sheets(content: bytes) -> list[str]:
        """Return the list of sheet names in an Excel workbook."""
        try:
            xl = pd.ExcelFile(BytesIO(content))
            return xl.sheet_names
        except Exception:
            return []

    @staticmethod
    def parse_file(
        content: bytes,
        filename: str,
        sheet_name: Optional[str | int] = None,
    ) -> pd.DataFrame:
        extension = filename.rsplit(".", 1)[-1].lower()
        FileParserService.detect_file_format(filename)
        buffer = BytesIO(content)

        if extension == "tsv":
            return pd.read_csv(buffer, sep="\t")

        if extension in {"csv", "txt"}:
            delimiter = FileParserService._sniff_delimiter(content)
            logger.debug("CSV delimiter sniffed as %r for %s", delimiter, filename)
            return pd.read_csv(BytesIO(content), sep=delimiter)

        if extension in {"xls", "xlsx"}:
            # sheet_name=None reads all sheets (returns dict); pick specified or first
            if sheet_name is not None:
                return pd.read_excel(BytesIO(content), sheet_name=sheet_name)
            # Default: read first sheet
            return pd.read_excel(BytesIO(content), sheet_name=0)

        if extension == "json":
            return pd.read_json(buffer)

        if extension == "parquet":
            try:
                return pd.read_parquet(buffer)
            except Exception as exc:
                raise ValueError("Parquet support requires pyarrow") from exc

        raise ValueError("Unsupported file type. Supported formats: CSV, Excel, JSON, Parquet")
