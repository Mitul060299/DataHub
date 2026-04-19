"""Static SQL safety checks.

The pipeline's correctness story rests on every step being **deterministic**:
given the same inputs, replaying the SQL must produce the same rows.  If a
step uses ``RANDOM()``, ``NOW()``, or ``CURRENT_TIMESTAMP``, then the snapshot
written at execution time will silently diverge from a later replay — and a
user who reloads the dataset tomorrow will see different numbers from
yesterday.  That breaks the "kill the server, reload, get the same answer"
contract that the snapshot-replay architecture is built on.

This module contains a single public function — ``reject_nondeterministic`` —
which scans a SQL string for the small set of constructs known to break
determinism in DuckDB and raises ``NonDeterministicSQLError`` with a clear,
actionable message if any are found.

The check is intentionally conservative.  It uses simple word-boundary regex
matches against the upper-cased SQL so it is fast (no parser) and easy to
reason about.  False positives (e.g. a column literally named ``random``) are
avoided by requiring the function-call shape ``NAME(`` for the function-style
forms.
"""

from __future__ import annotations

import re

__all__ = ["NonDeterministicSQLError", "reject_nondeterministic"]


class NonDeterministicSQLError(ValueError):
    """Raised when a SQL statement contains a construct that would make
    snapshot-vs-replay results diverge."""


# Function-style non-deterministic builtins.  We require an opening ``(`` so a
# column or alias literally named ``now`` or ``random`` doesn't false-trip.
_FUNC_PATTERNS = [
    (re.compile(r"\bRANDOM\s*\("), "RANDOM()"),
    (re.compile(r"\bRAND\s*\("), "RAND()"),
    (re.compile(r"\bRANDOM_UUID\s*\("), "RANDOM_UUID()"),
    (re.compile(r"\bUUID\s*\(\s*\)"), "UUID()"),
    (re.compile(r"\bGEN_RANDOM_UUID\s*\("), "GEN_RANDOM_UUID()"),
    (re.compile(r"\bNOW\s*\("), "NOW()"),
    (re.compile(r"\bGETDATE\s*\("), "GETDATE()"),
    (re.compile(r"\bTRANSACTION_TIMESTAMP\s*\("), "TRANSACTION_TIMESTAMP()"),
    (re.compile(r"\bSTATEMENT_TIMESTAMP\s*\("), "STATEMENT_TIMESTAMP()"),
    (re.compile(r"\bCLOCK_TIMESTAMP\s*\("), "CLOCK_TIMESTAMP()"),
    (re.compile(r"\bTIMEOFDAY\s*\("), "TIMEOFDAY()"),
    (re.compile(r"\bNEXTVAL\s*\("), "NEXTVAL()"),
]

# Bare-keyword non-deterministic builtins.  These are SQL keywords that read
# the wall clock without a ``()`` suffix, so we match them as standalone
# tokens (word boundaries on both sides).
_KEYWORD_PATTERNS = [
    (re.compile(r"\bCURRENT_TIMESTAMP\b"), "CURRENT_TIMESTAMP"),
    (re.compile(r"\bCURRENT_DATE\b"), "CURRENT_DATE"),
    (re.compile(r"\bCURRENT_TIME\b"), "CURRENT_TIME"),
    (re.compile(r"\bLOCALTIMESTAMP\b"), "LOCALTIMESTAMP"),
    (re.compile(r"\bLOCALTIME\b"), "LOCALTIME"),
    (re.compile(r"\bTODAY\b"), "TODAY"),
]

# DuckDB ``USING SAMPLE`` is non-deterministic unless an explicit seed is
# supplied via ``REPEATABLE (n)``.  We match unsewded sample clauses only.
_SAMPLE_PATTERN = re.compile(
    r"\bUSING\s+SAMPLE\b(?![^;]*\bREPEATABLE\s*\()",
    re.IGNORECASE,
)

# Strip out string and comment regions before scanning so a literal like
# ``WHERE description = 'queried at NOW()'`` doesn't trigger a false positive.
_STRING_LITERAL = re.compile(r"'(?:[^']|'')*'")
_LINE_COMMENT = re.compile(r"--[^\n]*")
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)


def _strip_noise(sql: str) -> str:
    """Remove string literals and SQL comments so pattern matching only runs
    against actual SQL tokens."""
    cleaned = _BLOCK_COMMENT.sub(" ", sql)
    cleaned = _LINE_COMMENT.sub(" ", cleaned)
    cleaned = _STRING_LITERAL.sub("''", cleaned)
    return cleaned


def reject_nondeterministic(sql: str, *, context: str = "step") -> None:
    """Raise ``NonDeterministicSQLError`` if *sql* contains a non-deterministic
    construct.

    Parameters
    ----------
    sql:
        The SQL string to inspect.  Empty / falsy input is silently accepted
        (the caller is responsible for emptiness checks; we only police
        determinism).
    context:
        Short label included in the error message so the user knows which
        step failed.  Typically the step number or operation name.
    """
    if not sql:
        return

    cleaned = _strip_noise(sql)
    upper = cleaned.upper()

    found: list[str] = []
    for pat, label in _FUNC_PATTERNS:
        if pat.search(upper):
            found.append(label)
    for pat, label in _KEYWORD_PATTERNS:
        if pat.search(upper):
            found.append(label)
    if _SAMPLE_PATTERN.search(upper):
        found.append("USING SAMPLE without REPEATABLE seed")

    if found:
        # De-dup while preserving order so the message reads naturally.
        seen: set[str] = set()
        unique = [x for x in found if not (x in seen or seen.add(x))]
        raise NonDeterministicSQLError(
            f"Non-deterministic SQL rejected ({context}): "
            f"{', '.join(unique)}.  Replay would diverge from the original "
            f"execution.  Use a literal value, a deterministic hash, or "
            f"materialize the value at the application layer instead."
        )
