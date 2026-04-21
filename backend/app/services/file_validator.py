"""
file_validator.py
=================
Validates uploaded files before they enter the pipeline.
All 7 checks run in order; first failure short-circuits.

Returns a ValidationResult dataclass — never raises.
Call validate_upload(file_bytes, filename) synchronously.
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_MB = 50
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".json", ".parquet"}

# Known magic-byte signatures keyed by file extension.
# For text-based formats (csv/json) we check for binary content instead.
_MAGIC_SIGNATURES: dict[str, list[bytes]] = {
    ".xlsx": [b"PK\x03\x04", b"PK\x05\x06"],  # ZIP-based OOXML
    ".xls":  [b"PK\x03\x04", b"\xD0\xCF\x11\xE0"],  # ZIP or OLE compound doc
    ".parquet": [b"PAR1"],
}


@dataclass
class ColumnInfo:
    name: str
    type: str


@dataclass
class ValidationResult:
    valid: bool
    row_count: int = 0
    column_count: int = 0
    columns: list[ColumnInfo] = field(default_factory=list)
    encoding_converted: bool = False
    file_size_mb: float = 0.0
    warnings: list[str] = field(default_factory=list)
    error: Optional[str] = None
    converted_bytes: Optional[bytes] = None  # Set when encoding was converted


def validate_upload(file_bytes: bytes, filename: str) -> ValidationResult:
    """Run all 7 validation checks and return a ValidationResult."""
    import os

    ext = os.path.splitext(filename or "")[-1].lower()
    size_mb = round(len(file_bytes) / (1024 * 1024), 2)
    result = ValidationResult(valid=False, file_size_mb=size_mb)

    # ── 1. File type ──────────────────────────────────────────────────────────
    # NOTE: File size is NOT checked here — it is a plan-tier concern enforced
    # by the upload route after resolving the user's plan limits.
    if ext not in ALLOWED_EXTENSIONS:
        display_ext = ext or "(no extension)"
        result.error = (
            f"File type {display_ext} is not supported. "
            "Upload a CSV, Excel, JSON or Parquet file."
        )
        return result

    # ── 2b. Magic-bytes / content-type verification ───────────────────────────
    # A renamed binary file (e.g. malware.exe → data.csv) has wrong magic bytes.
    # TODO: integrate ClamAV scanning here for full AV coverage.
    _magic_error = _check_magic_bytes(file_bytes, ext)
    if _magic_error:
        result.error = _magic_error
        return result

    # ── 5. Excel password protection (before read attempt) ───────────────────
    if ext in {".xlsx", ".xls"}:
        if _is_excel_password_protected(file_bytes, ext):
            result.error = (
                "This Excel file is password protected. "
                "Remove the password and re-upload."
            )
            return result

    # ── 6. Encoding detection + auto-convert (CSV only) ──────────────────────
    if ext == ".csv":
        file_bytes, converted = _ensure_utf8(file_bytes)
        if converted:
            result.encoding_converted = True
            result.converted_bytes = file_bytes
            result.warnings.append("File was automatically converted from non-UTF-8 encoding to UTF-8.")
        # ── 6b. Formula injection check (CSV Injection / Formula Injection) ───
        # Cells starting with =, +, -, @ can execute as formulas in Excel/Sheets
        # when the file is opened after being downloaded. Strip the prefix.
        file_bytes, formula_warning = _strip_formula_injection(file_bytes)
        if formula_warning:
            result.warnings.append(formula_warning)
            result.converted_bytes = file_bytes

    # ── 3. File is readable (attempt DuckDB open) ─────────────────────────────
    try:
        import duckdb  # lazy import
        con = duckdb.connect(database=":memory:")
        df_result = _read_with_duckdb(con, file_bytes, ext)
    except Exception as exc:
        logger.debug("File validation read error: %s", exc)
        result.error = (
            "This file could not be read. It may be corrupted or in an unsupported format."
        )
        return result

    # ── 4. Not empty ──────────────────────────────────────────────────────────
    if df_result is None or df_result.get("row_count", 0) == 0 or df_result.get("column_count", 0) == 0:
        result.error = "This file appears to be empty."
        return result

    # ── 7. Schema inference quality ───────────────────────────────────────────
    columns = df_result.get("columns", [])
    unknown_count = sum(1 for c in columns if c.type.lower() in ("varchar", "text", "blob"))
    if columns and unknown_count / len(columns) > 0.5:
        result.warnings.append(
            "This file has an unusual structure — most columns could not be typed. "
            "Try saving as a standard CSV and re-uploading."
        )

    result.valid = True
    result.row_count = df_result["row_count"]
    result.column_count = df_result["column_count"]
    result.columns = columns
    return result


# ── helpers ───────────────────────────────────────────────────────────────────

def _check_magic_bytes(file_bytes: bytes, ext: str) -> Optional[str]:
    """Return an error string if file contents don't match the declared extension.

    Checks leading magic bytes for binary formats; for text formats verifies
    that the first 512 bytes don't contain null bytes (binary file indicator).
    Returns None when the check passes.
    """
    header = file_bytes[:8]

    # Binary format: match known magic signatures
    if ext in _MAGIC_SIGNATURES:
        expected = _MAGIC_SIGNATURES[ext]
        if not any(header.startswith(sig) for sig in expected):
            return (
                f"File type mismatch: the content does not match the "
                f"{ext!r} extension. The file may be renamed or corrupted."
            )

    # Text format: reject files containing null bytes (sign of binary/malicious content)
    if ext in {".csv", ".json", ".txt", ".tsv"}:
        if b"\x00" in file_bytes[:512]:
            return (
                "File appears to contain binary content rather than text. "
                "Please upload a valid CSV or JSON file."
            )

    return None


def _read_with_duckdb(con, file_bytes: bytes, ext: str) -> Optional[dict]:
    """Read file bytes via DuckDB and return row/column metadata."""
    import tempfile
    import os

    suffix_map = {".csv": ".csv", ".xlsx": ".xlsx", ".xls": ".xlsx",
                  ".json": ".json", ".parquet": ".parquet"}
    suffix = suffix_map.get(ext, ext)

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        if ext == ".parquet":
            rel = con.execute(f"SELECT * FROM read_parquet('{tmp_path}') LIMIT 0")
        elif ext in {".xlsx", ".xls"}:
            # DuckDB doesn't natively read xlsx; use openpyxl → csv → duckdb
            return _read_excel_via_pandas(file_bytes)
        elif ext == ".json":
            rel = con.execute(f"SELECT * FROM read_json_auto('{tmp_path}') LIMIT 0")
        else:
            rel = con.execute(f"SELECT * FROM read_csv_auto('{tmp_path}') LIMIT 0")

        desc = rel.description or []
        col_names = [d[0] for d in desc]
        col_types = [str(d[1]) for d in desc]

        # Count rows separately to avoid loading full data
        if ext == ".parquet":
            row_count = con.execute(f"SELECT COUNT(*) FROM read_parquet('{tmp_path}')").fetchone()[0]
        elif ext == ".json":
            row_count = con.execute(f"SELECT COUNT(*) FROM read_json_auto('{tmp_path}')").fetchone()[0]
        else:
            row_count = con.execute(f"SELECT COUNT(*) FROM read_csv_auto('{tmp_path}')").fetchone()[0]

        return {
            "row_count": row_count,
            "column_count": len(col_names),
            "columns": [ColumnInfo(name=n, type=t) for n, t in zip(col_names, col_types)],
        }
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def _read_excel_via_pandas(file_bytes: bytes) -> Optional[dict]:
    """Read Excel file using openpyxl/pandas and return metadata."""
    try:
        import pandas as pd
        df = pd.read_excel(io.BytesIO(file_bytes), nrows=None)
        columns = [
            ColumnInfo(name=str(c), type=str(df[c].dtype))
            for c in df.columns
        ]
        return {
            "row_count": len(df),
            "column_count": len(df.columns),
            "columns": columns,
        }
    except Exception:
        return None


def _is_excel_password_protected(file_bytes: bytes, ext: str) -> bool:
    """Check if an Excel file is password protected."""
    try:
        import msoffcrypto  # type: ignore[import-untyped]
        f = io.BytesIO(file_bytes)
        office_file = msoffcrypto.OfficeFile(f)
        return office_file.is_encrypted()
    except ImportError:
        # msoffcrypto not installed — fall back to openpyxl error detection
        try:
            import openpyxl
            openpyxl.load_workbook(io.BytesIO(file_bytes))
            return False
        except Exception as exc:
            return "encrypted" in str(exc).lower() or "password" in str(exc).lower()
    except Exception:
        return False


def _ensure_utf8(file_bytes: bytes) -> tuple[bytes, bool]:
    """Detect encoding; if not UTF-8, re-encode to UTF-8. Returns (bytes, converted)."""
    try:
        import chardet
        detected = chardet.detect(file_bytes)
        encoding = (detected.get("encoding") or "utf-8").lower().replace("-", "")
        if encoding in ("utf8", "ascii"):
            return file_bytes, False
        # Try to decode and re-encode
        text = file_bytes.decode(detected["encoding"], errors="replace")
        return text.encode("utf-8"), True
    except Exception:
        return file_bytes, False


# ── CSV formula injection / CSV-injection sanitisation ───────────────────────
# Cells beginning with =, +, -, @ are interpreted as formulas by spreadsheet
# apps (Excel, Google Sheets, LibreOffice) when the file is opened.  This is
# a common vector for data-exfiltration attacks against users who download and
# open exported CSVs.  We prefix such cells with a tab character (\t) which
# causes spreadsheets to treat the value as text while preserving readability.

import csv as _csv_mod
import io as _io_mod

_FORMULA_PREFIXES = ('=', '+', '-', '@', '\r', '\t')


def _strip_formula_injection(file_bytes: bytes) -> tuple[bytes, Optional[str]]:
    """Sanitise CSV formula injection.  Returns (sanitised_bytes, warning_or_None)."""
    try:
        text = file_bytes.decode("utf-8", errors="replace")
        reader = _csv_mod.reader(_io_mod.StringIO(text))
        out_buf = _io_mod.StringIO()
        writer = _csv_mod.writer(out_buf)
        found = 0
        for row in reader:
            sanitised_row = []
            for cell in row:
                if cell and cell[0] in _FORMULA_PREFIXES:
                    sanitised_row.append("\t" + cell)
                    found += 1
                else:
                    sanitised_row.append(cell)
            writer.writerow(sanitised_row)
        if found:
            return out_buf.getvalue().encode("utf-8"), (
                f"{found} cell(s) contained formula characters (=, +, -, @) and were sanitised "
                "to prevent formula injection when opened in spreadsheet applications."
            )
        return file_bytes, None
    except Exception:
        # Never block an upload because of sanitisation failure — just skip
        return file_bytes, None
