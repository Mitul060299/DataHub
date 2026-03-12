from __future__ import annotations

import re
from typing import Iterable


_READ_PATH_PATTERN = re.compile(
    r"""
    \b(?:
        read_parquet|parquet_scan|
        read_csv|read_csv_auto|csv_scan|
        read_json|read_json_auto|json_scan|
        read_ndjson|read_ndjson_auto|
        read_blob
    )\s*\(\s*
    (?P<quote>['\"])
    (?P<path>.*?)
    (?P=quote)
    """,
    flags=re.IGNORECASE | re.DOTALL | re.VERBOSE,
)

_READ_CALL_PATTERN = re.compile(
    r"""
    \b(?:
        read_parquet|parquet_scan|
        read_csv|read_csv_auto|csv_scan|
        read_json|read_json_auto|json_scan|
        read_ndjson|read_ndjson_auto|
        read_blob
    )\s*\(
    """,
    flags=re.IGNORECASE | re.DOTALL | re.VERBOSE,
)

_COPY_STATEMENT_PATTERN = re.compile(r"(?:^|;)\s*copy\b", flags=re.IGNORECASE | re.DOTALL)
_ATTACH_STATEMENT_PATTERN = re.compile(r"(?:^|;)\s*attach\b", flags=re.IGNORECASE | re.DOTALL)


class DuckDBPathGuardError(ValueError):
    pass


def _normalize_paths(paths: Iterable[str] | None) -> set[str]:
    normalized: set[str] = set()
    for path in paths or []:
        candidate = str(path or "").strip()
        if candidate:
            normalized.add(candidate)
    return normalized


def _normalize_prefixes(prefixes: Iterable[str] | None) -> tuple[str, ...]:
    normalized: list[str] = []
    for prefix in prefixes or []:
        candidate = str(prefix or "").strip().strip("/")
        if candidate:
            normalized.append(candidate)
    return tuple(normalized)


def _unescape_sql_string(value: str) -> str:
    return (value or "").replace("''", "'").replace('""', '"')


def _matches_prefix(candidate_path: str, prefix: str) -> bool:
    path = candidate_path.strip().strip("/")
    return path == prefix or path.startswith(f"{prefix}/")


def _is_allowed_path(path: str, allowed_paths: set[str], allowed_prefixes: tuple[str, ...]) -> bool:
    candidate = _unescape_sql_string(path)
    if candidate in allowed_paths:
        return True
    return any(_matches_prefix(candidate, prefix) for prefix in allowed_prefixes)


def extract_duckdb_paths(sql: str) -> list[str]:
    if not (sql or "").strip():
        return []

    return [match.group("path") for match in _READ_PATH_PATTERN.finditer(sql)]


def guard_duckdb_sql_paths(
    sql: str,
    *,
    allowed_paths: Iterable[str] | None = None,
    allowed_prefixes: Iterable[str] | None = None,
) -> str:
    if not (sql or "").strip():
        return sql

    if _COPY_STATEMENT_PATTERN.search(sql) or _ATTACH_STATEMENT_PATTERN.search(sql):
        raise DuckDBPathGuardError("DuckDB path guard blocked COPY/ATTACH statements")

    normalized_allowed_paths = _normalize_paths(allowed_paths)
    normalized_allowed_prefixes = _normalize_prefixes(allowed_prefixes)

    read_calls = list(_READ_CALL_PATTERN.finditer(sql))
    read_paths = extract_duckdb_paths(sql)
    if len(read_calls) != len(read_paths):
        raise DuckDBPathGuardError("DuckDB path guard requires literal quoted paths for read_* calls")

    for referenced_path in read_paths:
        if _is_allowed_path(referenced_path, normalized_allowed_paths, normalized_allowed_prefixes):
            continue
        raise DuckDBPathGuardError("DuckDB path guard blocked access to an unapproved path")

    return sql
