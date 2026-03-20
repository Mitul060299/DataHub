"""
ExportService
Serialises a named DuckDB session table to CSV / Excel / Parquet,
uploads the result to object storage, and returns a signed download URL.
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime
from typing import Literal

import pyarrow as pa
import pyarrow.parquet as pq

from .duckdb_session import execute_in_session, get_connection
from .object_storage import StorageService
from ..db import SessionLocal
from ..models_db import DatasetMetaDB

ExportFormat = Literal["csv", "excel", "parquet"]


class ExportService:
    @staticmethod
    def export(
        session_id: str,
        duckdb_name: str,
        fmt: ExportFormat,
        dataset_id: str,
        user_id: str,
        display_name: str,
        db=None,
    ) -> str:
        """
        Query *duckdb_name* from the session DuckDB connection, serialise to
        *fmt*, upload to object storage, and return a signed download URL.
        """
        rows = execute_in_session(session_id, f"SELECT * FROM {duckdb_name}")
        if not rows:
            raise ValueError(f"Table '{duckdb_name}' is empty or does not exist in the session.")

        safe_name = display_name.replace(" ", "_").replace("/", "_")
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_stem = f"{safe_name}_{timestamp}"

        if fmt == "csv":
            buf = io.BytesIO()
            import csv as _csv
            wrapper = io.TextIOWrapper(buf, encoding="utf-8", newline="")
            writer = _csv.DictWriter(wrapper, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
            wrapper.flush()
            wrapper.detach()
            buf.seek(0)
            file_name = f"{file_stem}.csv"
            mime_type = "text/csv"
        elif fmt == "excel":
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment
            from openpyxl.utils import get_column_letter

            wb = openpyxl.Workbook()
            ws = wb.active
            safe_sheet = safe_name[:31].replace("/", "-").replace("\\", "-").replace("*", "").replace("?", "").replace("[", "").replace("]", "")
            ws.title = safe_sheet or "Sheet1"
            headers = list(rows[0].keys())
            date_cols = {h for h in headers if any(kw in h.lower() for kw in ("date", "_at", "_on"))}
            variance_cols = [h for h in headers if any(kw in h.lower() for kw in ("variance", "diff", "difference"))]

            header_fill = PatternFill("solid", fgColor="D9D9D9")
            header_font = Font(bold=True)
            for col_idx, h in enumerate(headers, start=1):
                cell = ws.cell(row=1, column=col_idx, value=h)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center")

            red_fill = PatternFill("solid", fgColor="FFCCCC")
            green_fill = PatternFill("solid", fgColor="CCFFCC")
            for row_idx, row in enumerate(rows, start=2):
                # Determine row highlight from variance cols
                row_fill = None
                if variance_cols:
                    for vc in variance_cols:
                        vc_val = row.get(vc)
                        try:
                            is_zero = float(vc_val) == 0.0 if vc_val not in (None, "") else True
                        except (TypeError, ValueError):
                            is_zero = vc_val in (None, "", "0", 0)
                        row_fill = green_fill if is_zero else red_fill
                for col_idx, h in enumerate(headers, start=1):
                    val = row.get(h)
                    cell = ws.cell(row=row_idx, column=col_idx, value=val)
                    if h in date_cols and val is not None:
                        cell.number_format = "DD/MM/YYYY"
                    if row_fill:
                        cell.fill = row_fill

            ws.freeze_panes = "A2"
            for col_idx, h in enumerate(headers, start=1):
                col_letter = get_column_letter(col_idx)
                max_len = max((len(str(r.get(h) or "")) for r in rows), default=0)
                ws.column_dimensions[col_letter].width = min(max(len(h), max_len) + 2, 40)

            buf = io.BytesIO()
            wb.save(buf)
            buf.seek(0)
            date_str = datetime.utcnow().strftime("%Y-%m-%d")
            file_name = f"{safe_name}_{date_str}.xlsx"
            mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif fmt == "parquet":
            keys = list(rows[0].keys())
            col_data: dict[str, list] = {k: [r.get(k) for r in rows] for k in keys}
            table = pa.table(col_data)
            buf = io.BytesIO()
            pq.write_table(table, buf)
            buf.seek(0)
            file_name = f"{file_stem}.parquet"
            mime_type = "application/octet-stream"
        else:
            raise ValueError(f"Unsupported export format: {fmt}")

        storage_path = StorageService.upload(
            user_id=user_id,
            dataset_id=dataset_id,
            buffer=buf.read(),
            file_name=file_name,
        )

        signed_url = StorageService.get_signed_url(storage_path, expires_in=3600 * 24)
        return signed_url

    @staticmethod
    def _row_count_from_session(session_id: str, duckdb_name: str) -> int:
        try:
            rows = execute_in_session(session_id, f"SELECT COUNT(*) AS n FROM {duckdb_name}")
            return int(rows[0]["n"]) if rows else 0
        except Exception:
            return 0
