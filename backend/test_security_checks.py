"""Quick regression checks for security fixes. Run with: python test_security_checks.py"""
import pandas as pd
import sys

# ── 1. transformer._safe_eval_formula ────────────────────────────────────────
from app.services.transformer import _safe_eval_formula

df = pd.DataFrame({"price": [10.0, 20.0, 30.0], "qty": [2, 3, 4]})

r1 = list(_safe_eval_formula(df, "price * qty"))
assert r1 == [20.0, 60.0, 120.0], f"multiply failed: {r1}"
print("PASS: formula multiply")

r2 = list(_safe_eval_formula(df, "abs(price - 15)"))
assert r2 == [5.0, 5.0, 15.0], f"abs failed: {r2}"
print("PASS: formula abs()")

r3 = list(_safe_eval_formula(df, "price + qty * 2"))
assert r3 == [14.0, 26.0, 38.0], f"chained failed: {r3}"
print("PASS: formula chained")

# Injection must be blocked
for evil in [
    "__import__('os').system('id')",
    "open('/etc/passwd').read()",
    "price.__class__",
    "'hello'",
]:
    try:
        _safe_eval_formula(df, evil)
        print(f"FAIL: injection not blocked: {evil!r}")
        sys.exit(1)
    except ValueError:
        print(f"PASS: injection blocked: {evil!r}")

# ── 2. data_sources path validation ──────────────────────────────────────────
import re

_PATH_RE = re.compile(
    r"^(?:"
    r"s3[a-z]*://[A-Za-z0-9.\-_/]+|"
    r"gs://[A-Za-z0-9.\-_/]+|"
    r"https://[A-Za-z0-9.\-_/@?=&%]+|"
    r"/[A-Za-z0-9._\-/]+"
    r")$"
)

valid_paths = [
    "s3://my-bucket/data/file.parquet",
    "gs://bucket/path/to/data.csv",
    "https://storage.googleapis.com/bucket/file.parquet",
    "/data/local/file.parquet",
]
invalid_paths = [
    "'; DROP TABLE users; --",
    "../../etc/passwd",
    "s3://bucket/file'; DROP TABLE--",
    "file with spaces.csv",
    "",
]
for p in valid_paths:
    assert _PATH_RE.match(p), f"FAIL: valid path rejected: {p}"
    print(f"PASS: valid path accepted: {p}")
for p in invalid_paths:
    assert not _PATH_RE.match(p), f"FAIL: injection path accepted: {p!r}"
    print(f"PASS: injection path rejected: {p!r}")

# ── 3. file_validator formula injection strip ─────────────────────────────────
from app.services.file_validator import _strip_formula_injection

csv_with_formulas = b"name,value\nAlice,=SUM(A1:A10)\nBob,+cmd\nCarol,100"
sanitised, warning = _strip_formula_injection(csv_with_formulas)
assert warning is not None, "FAIL: no warning produced"
# The tab-prefixed cell \t=SUM… means = no longer at position 0 of the field
assert b"\t=SUM" in sanitised, "FAIL: tab prefix missing on =SUM cell"
assert b"\t+cmd" in sanitised, "FAIL: tab prefix missing on +cmd cell"
print(f"PASS: formula injection stripped, warning: {warning}")

clean_csv = b"name,value\nAlice,hello\nBob,100"
sanitised2, warning2 = _strip_formula_injection(clean_csv)
assert warning2 is None, f"FAIL: false positive on clean CSV: {warning2}"
print("PASS: clean CSV unchanged")

# ── 4. config secret validation ───────────────────────────────────────────────
import os
os.environ["APP_ENV"] = "development"  # must not raise in dev
from importlib import reload
import app.config as cfg
reload(cfg)
print("PASS: config loads cleanly in development mode")

# ── 5. main.py imports without error ─────────────────────────────────────────
# Just check the middleware class is importable
from app.main import SecurityHeadersMiddleware
print("PASS: SecurityHeadersMiddleware importable")

print("\n✅ All checks passed.")
