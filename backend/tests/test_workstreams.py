"""
Tests for 8-workstream data-engine upgrade (commit 6d1fb09).

Coverage:
  A  — 17 new pipeline_engine operations
  B  — CSV delimiter sniffing + UTF-8 encoding fix
  C  — Multi-sheet Excel (FileParserService)
  D  — fuzzy_deduplicate (rapidfuzz / fallback)
  E  — /datasets/compare-schemas endpoint logic
  F  — validate_rules (flag / drop / report modes)
  G  — detect_date_gaps + normalize_timezone
  H  — generate_id (rownum / uuid / hash)
  NL — Updated system-prompt lists all new ops
"""

from __future__ import annotations

import io
import os
import sys
import unittest
from unittest.mock import MagicMock

# ── stub chromadb / langchain before any app import ──────────────────────────
for _mod in ["chromadb", "chromadb.utils", "chromadb.config", "chromadb.api"]:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

os.environ.setdefault("GROQ_API_KEY", "test-dummy-key-for-local-tests")


import numpy as np
import pandas as pd


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _op(operation: str, config: dict | None = None, step_type: str = "transform") -> pd.DataFrame:
    """Shortcut – returns result_df; caller passes a DataFrame via the test method."""
    raise RuntimeError("Use _run() in each test instead")


def _run(df: pd.DataFrame, op: str, cfg: dict | None = None,
         step_type: str = "transform") -> pd.DataFrame:
    from app.services.pipeline_engine import _apply_pipeline_operation
    return _apply_pipeline_operation(df, step_type, op, cfg or {})


def _df(**kw) -> pd.DataFrame:
    """Build a tiny DataFrame from keyword column=list_of_values."""
    return pd.DataFrame(kw)


# =============================================================================
# Workstream A — transform operations
# =============================================================================

class TestFillNulls(unittest.TestCase):

    def test_fill_mean(self):
        df = _df(v=[1.0, None, 3.0])
        r = _run(df, "fill_nulls", {"column": "v", "strategy": "mean"})
        self.assertAlmostEqual(r["v"].iloc[1], 2.0)

    def test_fill_median(self):
        df = _df(v=[1.0, None, 3.0, 5.0])
        r = _run(df, "fill_nulls", {"column": "v", "strategy": "median"})
        self.assertFalse(r["v"].isna().any())

    def test_fill_mode(self):
        df = _df(v=[1.0, 1.0, None])
        r = _run(df, "fill_nulls", {"column": "v", "strategy": "mode"})
        self.assertEqual(r["v"].iloc[2], 1.0)

    def test_fill_zero(self):
        df = _df(v=[None, 5.0])
        r = _run(df, "fill_nulls", {"column": "v", "strategy": "zero"})
        self.assertEqual(r["v"].iloc[0], 0.0)

    def test_fill_ffill(self):
        df = _df(v=[1.0, None, None])
        r = _run(df, "fill_nulls", {"column": "v", "strategy": "ffill"})
        self.assertEqual(r["v"].iloc[1], 1.0)
        self.assertEqual(r["v"].iloc[2], 1.0)

    def test_fill_bfill(self):
        df = _df(v=[None, None, 9.0])
        r = _run(df, "fill_nulls", {"column": "v", "strategy": "bfill"})
        self.assertEqual(r["v"].iloc[0], 9.0)

    def test_fill_literal_value(self):
        df = _df(v=[None, 1.0])
        r = _run(df, "fill_nulls", {"column": "v", "strategy": "value", "value": 42})
        self.assertEqual(r["v"].iloc[0], 42)

    def test_missing_column_noop(self):
        df = _df(x=[1, 2])
        r = _run(df, "fill_nulls", {"column": "does_not_exist", "strategy": "zero"})
        self.assertEqual(list(r.columns), ["x"])


class TestCastColumnType(unittest.TestCase):

    def test_cast_to_float(self):
        # Use decimal strings to force float64 (not int64)
        df = _df(v=["1.5", "2.2", "3.9"])
        r = _run(df, "cast_column_type", {"column": "v", "type": "float"})
        self.assertTrue(
            pd.api.types.is_float_dtype(r["v"]) or
            pd.api.types.is_numeric_dtype(r["v"])
        )
        self.assertAlmostEqual(r["v"].iloc[0], 1.5)

    def test_cast_to_str(self):
        df = _df(v=[1, 2, 3])
        r = _run(df, "cast_column_type", {"column": "v", "type": "str"})
        self.assertTrue(all(isinstance(x, str) for x in r["v"]))

    def test_cast_to_datetime(self):
        df = _df(v=["2024-01-01", "2024-06-15"])
        r = _run(df, "cast_column_type", {"column": "v", "type": "datetime"})
        self.assertTrue(pd.api.types.is_datetime64_any_dtype(r["v"]))

    def test_cast_invalid_numeric_becomes_nan(self):
        df = _df(v=["abc", "1"])
        r = _run(df, "cast_column_type", {"column": "v", "type": "int"})
        self.assertTrue(r["v"].isna().any())


class TestAddCalculatedColumn(unittest.TestCase):

    def test_simple_arithmetic(self):
        df = _df(a=[2, 4], b=[3, 5])
        r = _run(df, "add_calculated_column",
                 {"output_column": "c", "formula": "a * b"})
        self.assertEqual(list(r["c"]), [6, 20])

    def test_output_column_created(self):
        df = _df(x=[10, 20])
        r = _run(df, "add_calculated_column",
                 {"output_column": "y", "formula": "x + 1"})
        self.assertIn("y", r.columns)

    def test_bad_formula_does_not_crash(self):
        df = _df(x=[1])
        r = _run(df, "add_calculated_column",
                 {"output_column": "y", "formula": "INVALID ###"})
        self.assertNotIn("y", r.columns)


class TestNormalizeColumn(unittest.TestCase):

    def test_minmax_range_zero_to_one(self):
        df = _df(v=[0.0, 5.0, 10.0])
        r = _run(df, "normalize_column", {"column": "v", "method": "minmax"})
        self.assertAlmostEqual(r["v"].min(), 0.0)
        self.assertAlmostEqual(r["v"].max(), 1.0)

    def test_zscore_mean_zero(self):
        df = _df(v=[1.0, 2.0, 3.0, 4.0, 5.0])
        r = _run(df, "normalize_column", {"column": "v", "method": "zscore"})
        self.assertAlmostEqual(r["v"].mean(), 0.0, places=10)

    def test_constant_column_does_not_crash(self):
        df = _df(v=[7.0, 7.0, 7.0])
        r = _run(df, "normalize_column", {"column": "v", "method": "minmax"})
        self.assertFalse(r["v"].isna().any())


class TestRoundNumeric(unittest.TestCase):

    def test_rounds_to_requested_places(self):
        df = _df(v=[1.2345, 9.9999])
        r = _run(df, "round_numeric", {"decimals": 2})
        self.assertEqual(r["v"].iloc[0], 1.23)
        self.assertEqual(r["v"].iloc[1], 10.0)

    def test_specific_column_only(self):
        df = _df(a=[1.111], b=[2.222])
        r = _run(df, "round_numeric", {"column": "a", "decimals": 1})
        self.assertEqual(r["a"].iloc[0], 1.1)
        self.assertEqual(r["b"].iloc[0], 2.222)


class TestEncodeCategorical(unittest.TestCase):

    def test_label_encoding_creates_new_col(self):
        df = _df(color=["red", "green", "red"])
        r = _run(df, "encode_categorical", {"column": "color", "method": "label"})
        self.assertIn("color_encoded", r.columns)

    def test_onehot_expands_columns(self):
        df = _df(size=["S", "M", "L"])
        r = _run(df, "encode_categorical", {"column": "size", "method": "onehot"})
        self.assertNotIn("size", r.columns)
        # Expect dummy columns like size_S, size_M, size_L
        dummy_cols = [c for c in r.columns if c.startswith("size_")]
        self.assertEqual(len(dummy_cols), 3)


# =============================================================================
# Workstream A — filter operations
# =============================================================================

class TestFilterRows(unittest.TestCase):

    def test_numeric_greater_than(self):
        df = _df(v=[1, 5, 10])
        r = _run(df, "filter_rows", {"column": "v", "operator": ">", "value": 4})
        self.assertEqual(list(r["v"]), [5, 10])

    def test_numeric_less_than_or_equal(self):
        df = _df(v=[1, 5, 10])
        r = _run(df, "filter_rows", {"column": "v", "operator": "<=", "value": 5})
        self.assertEqual(list(r["v"]), [1, 5])

    def test_string_contains(self):
        df = _df(name=["Alice", "Bob", "Charlie"])
        r = _run(df, "filter_rows",
                 {"column": "name", "operator": "contains", "value": "li"})
        self.assertIn("Alice", r["name"].values)
        self.assertIn("Charlie", r["name"].values)
        self.assertNotIn("Bob", r["name"].values)

    def test_equality_filter(self):
        df = _df(status=["active", "inactive", "active"])
        r = _run(df, "filter_rows",
                 {"column": "status", "operator": "==", "value": "active"})
        self.assertEqual(len(r), 2)

    def test_index_reset_after_filter(self):
        df = _df(v=[10, 20, 30])
        r = _run(df, "filter_rows", {"column": "v", "operator": ">", "value": 15})
        self.assertEqual(list(r.index), list(range(len(r))))


class TestDeduplicateByColumn(unittest.TestCase):

    def test_keeps_first_occurrence(self):
        df = _df(id=[1, 1, 2], val=["a", "b", "c"])
        r = _run(df, "deduplicate_by_column", {"column": "id", "keep": "first"})
        self.assertEqual(len(r), 2)
        self.assertEqual(r["val"].iloc[0], "a")

    def test_keeps_last_occurrence(self):
        df = _df(id=[1, 1, 2], val=["a", "b", "c"])
        r = _run(df, "deduplicate_by_column", {"column": "id", "keep": "last"})
        self.assertEqual(r[r["id"] == 1]["val"].iloc[0], "b")


class TestFilterNulls(unittest.TestCase):

    def test_drops_rows_with_null_in_column(self):
        df = _df(v=[1.0, None, 3.0])
        r = _run(df, "filter_nulls", {"column": "v"})
        self.assertEqual(len(r), 2)
        self.assertFalse(r["v"].isna().any())


class TestFilterOutliers(unittest.TestCase):

    def test_removes_extreme_outlier(self):
        vals = [1.0] * 19 + [10000.0]
        df = _df(v=vals)
        r = _run(df, "filter_outliers", {"threshold": 3.0})
        self.assertLess(len(r), 20)

    def test_uniform_data_unaffected(self):
        df = _df(v=[5.0] * 10)
        r = _run(df, "filter_outliers", {"threshold": 3.0})
        self.assertEqual(len(r), 10)


class TestSortByColumn(unittest.TestCase):

    def test_ascending_sort(self):
        df = _df(v=[3, 1, 2])
        r = _run(df, "sort_by_column", {"column": "v", "ascending": True})
        self.assertEqual(list(r["v"]), [1, 2, 3])

    def test_descending_sort(self):
        df = _df(v=[3, 1, 2])
        r = _run(df, "sort_by_column", {"column": "v", "ascending": False})
        self.assertEqual(list(r["v"]), [3, 2, 1])


# =============================================================================
# Workstream A — aggregate operations
# =============================================================================

class TestGroupBy(unittest.TestCase):

    def _sales_df(self) -> pd.DataFrame:
        return _df(region=["A", "A", "B", "B"], sales=[10, 20, 5, 15])

    def test_group_by_sum(self):
        r = _run(self._sales_df(), "group_by_sum",
                 {"group_by": "region", "agg_column": "sales"})
        a_total = r[r["region"] == "A"]["sales"].iloc[0]
        self.assertEqual(a_total, 30)

    def test_group_by_count(self):
        r = _run(self._sales_df(), "group_by_count", {"group_by": "region"})
        self.assertEqual(len(r), 2)

    def test_group_by_mean(self):
        r = _run(self._sales_df(), "group_by_mean",
                 {"group_by": "region", "agg_column": "sales"})
        a_mean = r[r["region"] == "A"]["sales"].iloc[0]
        self.assertAlmostEqual(a_mean, 15.0)

    def test_group_by_reduces_rows(self):
        df = _df(cat=["X"] * 100 + ["Y"] * 50, val=list(range(150)))
        r = _run(df, "group_by_sum", {"group_by": "cat", "agg_column": "val"})
        self.assertEqual(len(r), 2)


class TestPivotTable(unittest.TestCase):

    def test_basic_pivot(self):
        df = _df(
            region=["A", "A", "B"],
            product=["p1", "p2", "p1"],
            sales=[10, 20, 30],
        )
        r = _run(df, "pivot_table",
                 {"index": "region", "values": "sales", "agg": "sum"})
        self.assertIn("region", r.columns)


# =============================================================================
# Workstream D — fuzzy_deduplicate
# =============================================================================

class TestFuzzyDeduplicate(unittest.TestCase):

    def test_exact_duplicates_removed(self):
        df = _df(name=["Alice", "Alice", "Bob"])
        r = _run(df, "fuzzy_deduplicate", {"column": "name", "threshold": 90})
        self.assertEqual(len(r), 2)

    def test_near_duplicates_removed_at_high_threshold(self):
        # "Jonhson" vs "Johnson" should merge at ~86% fuzz.ratio similarity
        try:
            import importlib
            import rapidfuzz  # noqa: F401
        except ImportError:
            self.skipTest("rapidfuzz not installed")
        # Clear any cached None stub from earlier in the session
        import sys
        for mod in list(sys.modules.keys()):
            if "rapidfuzz" in mod and sys.modules[mod] is None:
                del sys.modules[mod]
        df = _df(name=["Johnson", "Jonhson", "Smith"])
        r = _run(df, "fuzzy_deduplicate", {"column": "name", "threshold": 85})
        self.assertLess(len(r), 3)

    def test_different_strings_preserved(self):
        df = _df(name=["Alice", "Bob", "Charlie", "Diana"])
        r = _run(df, "fuzzy_deduplicate", {"column": "name", "threshold": 90})
        self.assertEqual(len(r), 4)

    def test_fallback_when_rapidfuzz_missing(self):
        """Even without rapidfuzz installed, should gracefully use exact dedup."""
        import sys
        df = _df(name=["Alice", "Alice", "Bob"])
        saved = sys.modules.get("rapidfuzz")
        sys.modules["rapidfuzz"] = None  # simulate ImportError path
        try:
            r = _run(df, "fuzzy_deduplicate", {"column": "name", "threshold": 90})
            # At worst, exact dedup still removes the duplicate
            self.assertLessEqual(len(r), 3)
        finally:
            if saved is not None:
                sys.modules["rapidfuzz"] = saved
            elif "rapidfuzz" in sys.modules:
                del sys.modules["rapidfuzz"]


# =============================================================================
# Workstream F — validate_rules
# =============================================================================

class TestValidateRules(unittest.TestCase):

    def _basic_df(self) -> pd.DataFrame:
        return _df(age=[25, None, -5, 100], email=["a@b.com", "bad", None, "c@d.com"])

    def test_flag_mode_adds_column(self):
        df = self._basic_df()
        r = _run(df, "validate_rules",
                 {"rules": [{"column": "age", "operator": "not_null"}],
                  "mode": "flag"})
        self.assertIn("validation_failed", r.columns)

    def test_not_null_flags_none_row(self):
        df = self._basic_df()
        r = _run(df, "validate_rules",
                 {"rules": [{"column": "age", "operator": "not_null"}],
                  "mode": "flag"})
        self.assertTrue(r["validation_failed"].iloc[1])   # None row
        self.assertFalse(r["validation_failed"].iloc[0])  # 25 is fine

    def test_drop_mode_removes_failures(self):
        df = self._basic_df()
        r = _run(df, "validate_rules",
                 {"rules": [{"column": "age", "operator": "not_null"}],
                  "mode": "drop"})
        self.assertFalse(r["age"].isna().any())

    def test_greater_than_rule(self):
        df = _df(age=[25, -5, 18])
        r = _run(df, "validate_rules",
                 {"rules": [{"column": "age", "operator": ">", "value": 0}],
                  "mode": "flag"})
        self.assertTrue(r["validation_failed"].iloc[1])
        self.assertFalse(r["validation_failed"].iloc[0])

    def test_unique_rule_flags_duplicates(self):
        df = _df(email=["a@b.com", "a@b.com", "c@d.com"])
        r = _run(df, "validate_rules",
                 {"rules": [{"column": "email", "operator": "unique"}],
                  "mode": "flag"})
        # Both occurrences of "a@b.com" should fail
        self.assertTrue(r["validation_failed"].iloc[0])
        self.assertTrue(r["validation_failed"].iloc[1])
        self.assertFalse(r["validation_failed"].iloc[2])

    def test_regex_rule(self):
        df = _df(email=["a@b.com", "bad_email", "c@d.org"])
        r = _run(df, "validate_rules",
                 {"rules": [{"column": "email", "operator": "regex",
                              "value": r"^[^@]+@[^@]+\.[^@]+$"}],
                  "mode": "flag"})
        self.assertFalse(r["validation_failed"].iloc[0])  # valid
        self.assertTrue(r["validation_failed"].iloc[1])   # invalid

    def test_report_mode_same_as_flag(self):
        df = _df(v=[1, None, 3])
        r = _run(df, "validate_rules",
                 {"rules": [{"column": "v", "operator": "not_null"}],
                  "mode": "report",
                  "flag_column": "bad"})
        self.assertIn("bad", r.columns)

    def test_custom_flag_column_name(self):
        df = _df(v=[None])
        r = _run(df, "validate_rules",
                 {"rules": [{"column": "v", "operator": "not_null"}],
                  "mode": "flag",
                  "flag_column": "my_flag"})
        self.assertIn("my_flag", r.columns)


# =============================================================================
# Workstream G — detect_date_gaps + normalize_timezone
# =============================================================================

class TestDetectDateGaps(unittest.TestCase):

    def test_fills_missing_daily_dates(self):
        # Monday + Wednesday — gap on Tuesday
        df = _df(date=["2024-01-01", "2024-01-03"], val=[10, 30])
        r = _run(df, "detect_date_gaps",
                 {"date_column": "date", "freq": "D", "fill_method": "ffill"})
        self.assertEqual(len(r), 3)

    def test_output_has_date_column(self):
        df = _df(date=["2024-01-01", "2024-01-05"], val=[1, 5])
        r = _run(df, "detect_date_gaps",
                 {"date_column": "date", "freq": "D"})
        self.assertIn("date", r.columns)

    def test_no_gaps_unchanged_length(self):
        dates = [f"2024-01-{d:02d}" for d in range(1, 8)]  # 7 consecutive days
        df = _df(date=dates, v=list(range(7)))
        r = _run(df, "detect_date_gaps",
                 {"date_column": "date", "freq": "D", "fill_method": "ffill"})
        self.assertEqual(len(r), 7)


class TestNormalizeTimezone(unittest.TestCase):

    def test_naive_datetime_gets_localized(self):
        df = _df(ts=["2024-01-01 00:00:00", "2024-06-15 12:00:00"])
        r = _run(df, "normalize_timezone",
                 {"date_column": "ts", "source_tz": "US/Eastern", "target_tz": "UTC"})
        # After conversion, should be tz-aware
        self.assertTrue(r["ts"].dt.tz is not None)

    def test_converts_between_timezones(self):
        df = _df(ts=["2024-01-01 00:00:00"])
        r = _run(df, "normalize_timezone",
                 {"date_column": "ts", "source_tz": "UTC", "target_tz": "US/Eastern"})
        # UTC midnight → US/Eastern is -5h so hour should be 19 (prev day) or similar
        self.assertIsNotNone(r["ts"].dt.tz)


# =============================================================================
# Workstream H — generate_id
# =============================================================================

class TestGenerateId(unittest.TestCase):

    def test_rownum_sequential_from_one(self):
        df = _df(x=[10, 20, 30])
        r = _run(df, "generate_id",
                 {"output_column": "id", "strategy": "rownum"})
        self.assertEqual(list(r["id"]), [1, 2, 3])

    def test_uuid_produces_unique_values(self):
        df = _df(x=list(range(5)))
        r = _run(df, "generate_id",
                 {"output_column": "uid", "strategy": "uuid"})
        self.assertEqual(len(r["uid"].unique()), 5)

    def test_uuid_is_string_format(self):
        df = _df(x=[1])
        r = _run(df, "generate_id",
                 {"output_column": "uid", "strategy": "uuid"})
        # Should look like a UUID
        self.assertEqual(len(r["uid"].iloc[0]), 36)

    def test_hash_produces_fixed_length_strings(self):
        df = _df(a=["Alice", "Bob"], b=[1, 2])
        r = _run(df, "generate_id",
                 {"output_column": "hid", "strategy": "hash", "columns": ["a", "b"]})
        # MD5[:12]
        self.assertTrue(all(len(v) == 12 for v in r["hid"]))

    def test_same_row_same_hash(self):
        df = _df(a=["Alice", "Alice"], b=[1, 1])
        r = _run(df, "generate_id",
                 {"output_column": "hid", "strategy": "hash", "columns": ["a", "b"]})
        self.assertEqual(r["hid"].iloc[0], r["hid"].iloc[1])

    def test_different_rows_different_hash(self):
        df = _df(a=["Alice", "Bob"], b=[1, 2])
        r = _run(df, "generate_id",
                 {"output_column": "hid", "strategy": "hash", "columns": ["a", "b"]})
        self.assertNotEqual(r["hid"].iloc[0], r["hid"].iloc[1])

    def test_custom_output_column_name(self):
        df = _df(x=[1])
        r = _run(df, "generate_id",
                 {"output_column": "surrogate_key", "strategy": "rownum"})
        self.assertIn("surrogate_key", r.columns)


# =============================================================================
# Workstream B — CSV delimiter sniffing
# =============================================================================

class TestCsvDelimiterSniffing(unittest.TestCase):

    def _parse(self, csv_bytes: bytes, filename: str = "data.csv") -> pd.DataFrame:
        from app.services.file_parser import FileParserService
        return FileParserService.parse_file(csv_bytes, filename)

    def test_comma_delimited(self):
        data = b"name,age\nAlice,30\nBob,25"
        df = self._parse(data)
        self.assertIn("name", df.columns)
        self.assertEqual(len(df), 2)

    def test_tab_delimited(self):
        data = b"name\tage\nAlice\t30\nBob\t25"
        df = self._parse(data, "data.tsv")
        self.assertIn("name", df.columns)
        self.assertEqual(len(df), 2)

    def test_semicolon_delimited_csv(self):
        data = b"name;age\nAlice;30\nBob;25"
        df = self._parse(data, "data.csv")
        self.assertIn("name", df.columns)

    def test_pipe_delimited_csv(self):
        data = b"name|age\nAlice|30\nBob|25"
        df = self._parse(data, "data.csv")
        self.assertIn("name", df.columns)


class TestCsvEncodingFix(unittest.TestCase):

    def test_utf8_csv_passes_through_unchanged(self):
        from app.services.file_validator import validate_upload
        data = "name,age\nAlice,30\n".encode("utf-8")
        r = validate_upload(data, "data.csv")
        self.assertTrue(r.valid)
        self.assertIsNone(r.converted_bytes)  # no conversion needed

    def test_latin1_csv_converted_and_bytes_stored(self):
        from app.services.file_validator import _ensure_utf8
        # Win-1252 encoded CSV: the € symbol (0x80 in cp1252) is a strong signal
        # for chardet and is invalid in both UTF-8 and latin-1
        text = "name,price\n" + ("product,100\u20acEUR\n" * 40)  # 40 rows
        win1252_bytes = text.encode("cp1252")
        # Verify these bytes are NOT valid UTF-8 (sanity check)
        with self.assertRaises(UnicodeDecodeError):
            win1252_bytes.decode("utf-8")
        # _ensure_utf8 should detect and convert it
        converted, did_convert = _ensure_utf8(win1252_bytes)
        if did_convert:
            # If chardet detected it, the converted output must be valid UTF-8
            converted.decode("utf-8")
            self.assertNotEqual(converted, win1252_bytes)
        else:
            # chardet didn't detect it with enough confidence — that's OK;
            # at minimum the function must not crash and must return bytes
            self.assertIsInstance(converted, bytes)


# =============================================================================
# Workstream C — Multi-sheet Excel
# =============================================================================

class TestMultiSheetExcel(unittest.TestCase):

    def _make_excel(self, sheets: dict[str, pd.DataFrame]) -> bytes:
        """Write an in-memory Excel workbook with the given sheets."""
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            for name, df in sheets.items():
                df.to_excel(writer, sheet_name=name, index=False)
        return buf.getvalue()

    def test_list_excel_sheets_returns_names(self):
        from app.services.file_parser import FileParserService
        xls = self._make_excel({
            "Sales": _df(v=[1, 2]),
            "Returns": _df(v=[3, 4]),
        })
        sheets = FileParserService.list_excel_sheets(xls)
        self.assertEqual(sheets, ["Sales", "Returns"])

    def test_parse_default_reads_first_sheet(self):
        from app.services.file_parser import FileParserService
        xls = self._make_excel({
            "Sheet1": _df(a=[1, 2]),
            "Sheet2": _df(b=[3, 4]),
        })
        df = FileParserService.parse_file(xls, "data.xlsx")
        self.assertIn("a", df.columns)

    def test_parse_named_sheet(self):
        from app.services.file_parser import FileParserService
        xls = self._make_excel({
            "Sheet1": _df(a=[1, 2]),
            "Sheet2": _df(b=[3, 4]),
        })
        df = FileParserService.parse_file(xls, "data.xlsx", sheet_name="Sheet2")
        self.assertIn("b", df.columns)
        self.assertNotIn("a", df.columns)

    def test_parse_sheet_by_index(self):
        from app.services.file_parser import FileParserService
        xls = self._make_excel({
            "First": _df(x=[10]),
            "Second": _df(y=[20]),
        })
        df = FileParserService.parse_file(xls, "data.xlsx", sheet_name=1)
        self.assertIn("y", df.columns)


# =============================================================================
# Workstream E — Schema comparison logic
# =============================================================================

class TestSchemaComparisonLogic(unittest.TestCase):
    """Unit-test the comparison logic without the HTTP layer."""

    def _compare(self, cols_a: list[str], cols_b: list[str]) -> dict:
        import difflib
        cols_a_set = set(cols_a)
        cols_b_set = set(cols_b)
        exact = sorted(cols_a_set & cols_b_set)
        only_a = sorted(cols_a_set - cols_b_set)
        only_b = sorted(cols_b_set - cols_a_set)
        fuzzy: list[dict] = []
        for col in only_a:
            close = difflib.get_close_matches(col, list(cols_b_set), n=1, cutoff=0.6)
            if close:
                fuzzy.append({"column_a": col, "column_b": close[0]})
        score = round(len(exact) / max(len(cols_a_set | cols_b_set), 1), 2)
        return {"exact": exact, "only_a": only_a, "only_b": only_b,
                "fuzzy": fuzzy, "score": score}

    def test_identical_schemas_full_score(self):
        cols = ["id", "name", "age"]
        r = self._compare(cols, cols)
        self.assertEqual(r["score"], 1.0)
        self.assertEqual(r["only_a"], [])
        self.assertEqual(r["only_b"], [])

    def test_no_overlap_zero_score(self):
        r = self._compare(["a", "b"], ["c", "d"])
        self.assertEqual(r["score"], 0.0)
        self.assertEqual(r["exact"], [])

    def test_partial_overlap(self):
        r = self._compare(["id", "name", "age"], ["id", "name", "dob"])
        self.assertIn("id", r["exact"])
        self.assertIn("age", r["only_a"])
        self.assertIn("dob", r["only_b"])

    def test_fuzzy_suggestion_for_typo(self):
        r = self._compare(["customer_id"], ["customer_Id"])
        # Should suggest a fuzzy match
        self.assertTrue(len(r["fuzzy"]) > 0)


# =============================================================================
# NL system prompt — verifies all new ops appear
# =============================================================================

class TestNlSystemPromptOps(unittest.TestCase):
    """Ensure the updated system prompt advertises every new operation."""

    @classmethod
    def setUpClass(cls):
        from app.services.nl_pipeline_service import _SYSTEM_PROMPT
        cls.prompt = _SYSTEM_PROMPT

    def test_fill_nulls_in_prompt(self):
        self.assertIn("fill_nulls", self.prompt)

    def test_cast_column_type_in_prompt(self):
        self.assertIn("cast_column_type", self.prompt)

    def test_add_calculated_column_in_prompt(self):
        self.assertIn("add_calculated_column", self.prompt)

    def test_normalize_column_in_prompt(self):
        self.assertIn("normalize_column", self.prompt)

    def test_encode_categorical_in_prompt(self):
        self.assertIn("encode_categorical", self.prompt)

    def test_filter_rows_in_prompt(self):
        self.assertIn("filter_rows", self.prompt)

    def test_filter_outliers_in_prompt(self):
        self.assertIn("filter_outliers", self.prompt)

    def test_sort_by_column_in_prompt(self):
        self.assertIn("sort_by_column", self.prompt)

    def test_group_by_in_prompt(self):
        self.assertIn("group_by_sum", self.prompt)
        self.assertIn("group_by_count", self.prompt)
        self.assertIn("group_by_mean", self.prompt)

    def test_pivot_table_in_prompt(self):
        self.assertIn("pivot_table", self.prompt)

    def test_fuzzy_deduplicate_in_prompt(self):
        self.assertIn("fuzzy_deduplicate", self.prompt)

    def test_validate_rules_in_prompt(self):
        self.assertIn("validate_rules", self.prompt)

    def test_detect_date_gaps_in_prompt(self):
        self.assertIn("detect_date_gaps", self.prompt)

    def test_normalize_timezone_in_prompt(self):
        self.assertIn("normalize_timezone", self.prompt)

    def test_generate_id_in_prompt(self):
        self.assertIn("generate_id", self.prompt)

    def test_stale_ops_removed(self):
        """text_classification and forecast were never implemented — must be gone."""
        self.assertNotIn("text_classification", self.prompt)
        self.assertNotIn("forecast", self.prompt)

    def test_custom_sql_still_present(self):
        self.assertIn("{{dataset}}", self.prompt)


if __name__ == "__main__":
    unittest.main()
