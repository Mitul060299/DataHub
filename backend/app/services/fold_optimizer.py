"""
Query Fold Optimizer — pushes SQL pipeline steps to the source database.

When a dataset was imported from a SQL connector AND the step is a pure SQL
step, the fold optimizer rewrites the step SQL to execute directly on the
source database instead of pulling rows into DuckDB.  This mirrors Power BI's
"query folding" behaviour:

  pipeline step SQL:  SELECT col1 FROM dataset WHERE amount > 100
  folded SQL sent to source DB:
      SELECT col1 FROM (SELECT * FROM public.orders) AS dataset WHERE amount > 100

Fallback contract: any exception from execute_sql() silently falls back to
DuckDB — the user experience is never affected, only logs indicate the fold
was skipped.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Operations with no SQL equivalent — must stay in DuckDB / pandas
# ---------------------------------------------------------------------------
_PANDAS_ONLY_OPERATIONS: frozenset[str] = frozenset({
    "sentiment",
    "anomaly_detection",
    "keyword_extraction",
    "resample",
    "deduplicate",
    "fill_missing",
    "parse_dates",
    "trim_whitespace",
    "add_column",
    "ml_classify",
    "ml_cluster",
})

# Connectors that declare supports_query_folding = True
_FOLDABLE_CONNECTOR_TYPES: frozenset[str] = frozenset({
    "postgresql", "mysql", "mssql", "oracle", "sqlite",
})

MAX_FOLD_DEPTH: int = 5  # prevent absurdly deeply nested subquery chains


class FoldabilityClassifier:
    """Decide whether a single pipeline step can be pushed to the source DB."""

    @staticmethod
    def is_foldable(step: Dict[str, Any], source_meta: Any) -> bool:
        """
        Return True if this step can be pushed to the source database.

        Requirements:
        - source_meta.connector_credential_id must be set (we need creds to reconnect)
        - source_meta.source_type must be a SQL connector that supports folding
        - The step must carry a SQL body (not a pandas-only operation)
        """
        if not getattr(source_meta, "connector_credential_id", None):
            return False

        source_type = str(getattr(source_meta, "source_type", "") or "").lower()
        if source_type not in _FOLDABLE_CONNECTOR_TYPES:
            return False

        step_type = str(step.get("type") or "").lower()
        config = step.get("config") if isinstance(step.get("config"), dict) else {}
        operation = str(config.get("operation") or "").lower()
        sql = str(
            step.get("sql") or step.get("query") or config.get("sql") or ""
        ).strip()

        # pandas-only operations can never fold
        if operation in _PANDAS_ONLY_OPERATIONS:
            return False

        # If there is explicit SQL, it can fold
        if sql:
            return True

        # Generic transform / ai_transform without SQL body cannot fold
        if step_type in {"transform", "ai_transform"}:
            return False

        # Named SQL step types without an explicit sql field may fold later
        # after the AI expands them, but we surface False here as they have
        # no SQL yet; the engine will run them normally in DuckDB.
        return False


class QueryFoldOptimizer:
    """
    Stateful, per-pipeline-run optimizer.

    Creates a chain of subqueries where each foldable step wraps the previous
    one as a CTE / subquery, pushing the entire accumulated computation down
    to the source database.  A non-foldable step breaks the chain and resets
    state so subsequent (foldable) steps restart from the original table.
    """

    def __init__(self) -> None:
        self._fold_depth: int = 0
        self._accumulated_sql: Optional[str] = None  # SQL from the last folded step

    def reset(self) -> None:
        """Reset chain state — called when a non-foldable step breaks the fold chain."""
        self._fold_depth = 0
        self._accumulated_sql = None

    def build_folded_sql(
        self,
        step: Dict[str, Any],
        source_meta: Any,
    ) -> Optional[str]:
        """
        Return the fully-folded SQL for *this* step, or None if it cannot be folded.

        The returned SQL is dialect-neutral (it only relies on standard SQL
        subquery syntax).  Call connector.execute_sql(result, config) to run it.

        Side-effects:
        - On success: increments fold depth, stores accumulated SQL.
        - On failure (not foldable / depth exceeded): resets state.
        """
        if not FoldabilityClassifier.is_foldable(step, source_meta):
            self.reset()
            return None

        if self._fold_depth >= MAX_FOLD_DEPTH:
            logger.warning(
                "[FOLD] Max fold depth (%d) reached for dataset %s — "
                "falling back to DuckDB for this and subsequent steps",
                MAX_FOLD_DEPTH,
                getattr(source_meta, "id", "?"),
            )
            self.reset()
            return None

        config = step.get("config") if isinstance(step.get("config"), dict) else {}
        step_sql = str(
            step.get("sql") or step.get("query") or config.get("sql") or ""
        ).strip()

        if not step_sql:
            # No SQL body found despite passing is_foldable — safety net
            self.reset()
            return None

        base_relation = self._get_base_relation(source_meta)
        if not base_relation:
            self.reset()
            return None

        # Replace the first `FROM dataset` reference with the subquery
        folded_sql = re.sub(
            r"\bFROM\s+dataset\b",
            f"FROM ({base_relation}) AS dataset",
            step_sql,
            count=1,
            flags=re.IGNORECASE,
        )

        self._fold_depth += 1
        self._accumulated_sql = folded_sql

        logger.info(
            "[FOLD] depth=%d dataset=%s connector=%s sql_preview=%s",
            self._fold_depth,
            getattr(source_meta, "id", "?"),
            getattr(source_meta, "source_type", "?"),
            folded_sql[:160],
        )
        return folded_sql

    def _get_base_relation(self, source_meta: Any) -> Optional[str]:
        """Return the SQL expression to substitute for the `FROM dataset` target."""
        # If we already folded a previous step, chain from its output
        if self._accumulated_sql:
            return self._accumulated_sql

        # First step in the chain — derive base relation from original import config
        cfg: Dict[str, Any] = getattr(source_meta, "connector_config", None) or {}
        connector_type = str(getattr(source_meta, "source_type", "") or "").lower()

        orig_query = str(cfg.get("query") or "").strip()
        if orig_query:
            return orig_query

        table = str(cfg.get("table") or "").strip()
        if not table:
            logger.debug(
                "[FOLD] Cannot fold — no table or query in connector_config "
                "for dataset %s",
                getattr(source_meta, "id", "?"),
            )
            return None

        schema = str(cfg.get("schema") or "").strip()
        if schema and connector_type not in ("sqlite",):
            return f"SELECT * FROM {schema}.{table}"
        return f"SELECT * FROM {table}"
