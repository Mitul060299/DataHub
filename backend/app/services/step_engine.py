"""
Power Query-inspired Step Engine
================================

Implements four key patterns from Power Query / M Code:

1. **Applied Steps** (non-destructive, reorderable)
   - Every transform is a composable SQL view, never a destructive mutation.
   - Steps form a chain: Source → View1 → View2 → … → ViewN.
   - Any step can be removed/reordered and the chain recompiled.

2. **Lazy Evaluation with Sampling**
   - Preview always runs on a LIMIT-ed subset (default 200 rows).
   - Full materialisation only happens on explicit "Refresh" / export.
   - Keeps RAM under control on 2 GB instances.

3. **Query Folding**
   - Chains of views naturally fold in DuckDB's optimizer: a
     `SELECT * FROM view3 LIMIT 200` compiles a single optimized query
     across all upstream views without materializing intermediates.
   - For SQL connectors, delegates to `fold_optimizer.py`.

4. **Step Snapshot Caching**
   - After each step, a Parquet snapshot of the step's output can be
     persisted to object storage. On session loss, steps replay
     instantly from Parquet instead of re-executing SQL.
   - Snapshots are opt-in (only on explicit save / export).

Usage from execute_step.py:

    from ...step_engine import StepEngine
    engine = StepEngine(session_id, table_registry)
    result = engine.apply_step(step_sql, output_name, source_table, step_number)
    preview = engine.preview(output_name, limit=200)
    engine.materialize(output_name)  # only for export / full refresh
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from .duckdb_session import (
    get_connection,
    register_view_from_sql,
    execute_in_session,
    SessionExpiredError,
)

logger = logging.getLogger(__name__)

# Default preview row limit — mirrors Power Query's sampled evaluation.
# Keeps memory minimal while giving the user a realistic data preview.
DEFAULT_PREVIEW_LIMIT = 200


@dataclass
class StepResult:
    """Result of applying a single pipeline step."""
    output_table: str
    step_number: int
    operation: str
    sql: str
    row_count: Optional[int] = None
    row_count_before: Optional[int] = None
    rows_changed: Optional[int] = None
    column_schema: list[dict] = field(default_factory=list)
    preview_rows: list[dict] = field(default_factory=list)
    execution_time_ms: int = 0
    is_view: bool = True
    snapshot_url: Optional[str] = None


class StepEngine:
    """Power Query-style step engine operating on a DuckDB session.

    Principles:
    - Every step creates a VIEW (lazy, zero RAM).
    - Previews use LIMIT sampling — never materialize full result.
    - Materialization is explicit (export, save checkpoint, full refresh).
    - Step chain is recompilable from SQL definitions alone.
    """

    def __init__(self, session_id: str, table_registry: dict[str, Any]):
        self._session_id = session_id
        self._registry = table_registry

    # ── Core: Apply a step as a lazy VIEW ────────────────────────────────────

    def apply_step(
        self,
        sql: str,
        output_name: str,
        source_table: str,
        step_number: int,
        operation: str = "transform",
        *,
        input_tables: list[str] | None = None,
        ddl_name: str | None = None,
        display_name: str | None = None,
    ) -> StepResult:
        """Apply a transformation step as a lazy VIEW.

        Unlike the old approach (which materialised tables), this creates
        only a VIEW. DuckDB's optimizer will fold the entire view chain
        into a single query plan when previewed or materialised.

        Returns a StepResult with a sampled preview (DEFAULT_PREVIEW_LIMIT rows).
        """
        import time
        t0 = time.monotonic()

        # 1. Create the lazy view — zero RAM, deferred execution.
        register_view_from_sql(self._session_id, output_name, sql)

        # 2. If the agent used a CREATE TABLE name, also alias it.
        if ddl_name and ddl_name != output_name:
            try:
                get_connection(self._session_id).execute(
                    f'CREATE OR REPLACE VIEW "{ddl_name}" AS SELECT * FROM "{output_name}"'
                )
            except Exception:
                pass

        # 3. Get row count BEFORE (from source) — fast on views via DuckDB pushdown.
        row_count_before = self._fast_count(source_table)

        # 4. Get row count AFTER — uses DuckDB's view pushdown, no materialization.
        row_count = self._fast_count(output_name)

        # 5. Get column schema via DESCRIBE (metadata-only, no data scan).
        column_schema = self._describe(output_name)
        col_names = [c["name"] for c in column_schema]

        # 6. Sampled preview — LIMIT pushes through the view chain (query folding).
        preview_rows = self._preview(output_name, DEFAULT_PREVIEW_LIMIT)

        # 7. Rows changed (EXCEPT set diff) — skip if source unknown.
        rows_changed = None
        if source_table and row_count is not None:
            rows_changed = self._count_changed(source_table, output_name)

        elapsed_ms = int((time.monotonic() - t0) * 1000)

        # 8. Update registry — mark as view (lazy, non-destructive).
        self._registry[output_name] = {
            "duckdb_name": output_name,
            "dataset_id": "",
            "display_name": display_name or ddl_name or output_name,
            "source_intent": operation,
            "parent_tables": input_tables or ([source_table] if source_table else []),
            "row_count": row_count or 0,
            "column_names": col_names,
            "pipeline_step_number": step_number,
            "is_artifact": False,
            "is_view": True,  # KEY: always a view, never materialized during apply
            "ddl_name": ddl_name or "",
        }

        return StepResult(
            output_table=output_name,
            step_number=step_number,
            operation=operation,
            sql=sql,
            row_count=row_count,
            row_count_before=row_count_before,
            rows_changed=rows_changed,
            column_schema=column_schema,
            preview_rows=preview_rows,
            execution_time_ms=elapsed_ms,
            is_view=True,
        )

    # ── Preview: lazy sampled evaluation ─────────────────────────────────────

    def preview(
        self,
        table_or_view: str,
        limit: int = DEFAULT_PREVIEW_LIMIT,
        offset: int = 0,
    ) -> list[dict]:
        """Return a sampled preview of a step's output.

        DuckDB optimizes this: `SELECT * FROM view_chain LIMIT N` folds
        the LIMIT through all upstream views, reading only N rows from
        the base Parquet file. This is the "lazy evaluation" pattern.
        """
        return self._preview(table_or_view, limit, offset)

    # ── Materialize: explicit full evaluation ────────────────────────────────

    def materialize(self, view_name: str) -> int:
        """Convert a lazy VIEW to a materialized TABLE.

        Use this only for:
        - Export / download (user explicitly requests full data)
        - Save checkpoint (persist to S3)
        - Full refresh (user clicks "Refresh all")

        Returns the row count of the materialized table.
        """
        conn = get_connection(self._session_id)
        # Materialize the view into a table — this is the "full refresh"
        # equivalent to Power Query's "Refresh" button.
        temp_name = f"__mat_{uuid.uuid4().hex[:8]}"
        conn.execute(f'CREATE OR REPLACE TABLE "{temp_name}" AS SELECT * FROM "{view_name}"')
        # Swap: drop the view, rename the table.
        conn.execute(f'DROP VIEW IF EXISTS "{view_name}"')
        conn.execute(f'ALTER TABLE "{temp_name}" RENAME TO "{view_name}"')
        # Update registry
        if view_name in self._registry:
            self._registry[view_name]["is_view"] = False
        count_result = conn.execute(f'SELECT COUNT(*) FROM "{view_name}"').fetchone()
        row_count = int(count_result[0]) if count_result else 0
        if view_name in self._registry:
            self._registry[view_name]["row_count"] = row_count
        logger.info("STEP_MATERIALIZED: view=%s rows=%d session=%s", view_name, row_count, self._session_id)
        return row_count

    # ── Recompile: rebuild view chain from SQL definitions ───────────────────

    def recompile_chain(self, steps: list[dict]) -> None:
        """Rebuild the entire view chain from step SQL definitions.

        This is the "edit step / reorder" equivalent: given a new ordering
        of steps (each with `output_table` and `sql`), drop all derived
        views and re-create them in order.

        Mirrors Power Query's ability to reorder Applied Steps.
        """
        conn = get_connection(self._session_id)
        # Drop derived views (step_number > 0) in reverse order.
        derived = sorted(
            [(k, v) for k, v in self._registry.items()
             if isinstance(v, dict) and v.get("pipeline_step_number", 0) > 0],
            key=lambda x: x[1].get("pipeline_step_number", 0),
            reverse=True,
        )
        for name, _entry in derived:
            try:
                conn.execute(f'DROP VIEW IF EXISTS "{name}"')
                conn.execute(f'DROP TABLE IF EXISTS "{name}"')
            except Exception:
                pass
            self._registry.pop(name, None)

        # Re-create views in order.
        for step_def in sorted(steps, key=lambda s: s.get("step_number", 0)):
            output = step_def.get("output_table", "")
            sql = step_def.get("sql", "")
            if output and sql:
                try:
                    register_view_from_sql(self._session_id, output, sql)
                    self._registry[output] = {
                        "duckdb_name": output,
                        "dataset_id": "",
                        "display_name": step_def.get("description", output),
                        "source_intent": step_def.get("operation", "transform"),
                        "parent_tables": step_def.get("input_tables", []),
                        "row_count": 0,
                        "column_names": [],
                        "pipeline_step_number": step_def["step_number"],
                        "is_artifact": False,
                        "is_view": True,
                        "ddl_name": "",
                    }
                except Exception as exc:
                    logger.warning("RECOMPILE_FAILED: step=%s error=%s", output, exc)
                    break  # Later steps depend on this one

    # ── Snapshot: persist step output to Parquet ─────────────────────────────

    def snapshot_to_parquet(self, view_name: str, dataset_id: str, user_id: str) -> str | None:
        """Export a step's output as a Parquet file to object storage.

        Returns the **storage_path** (e.g. ``s3://bucket/user/dataset/step_X.parquet``)
        that can be re-registered later via
        ``StorageService.get_query_path(path)`` + ``read_parquet(...)``.

        Used as the auto-snapshot path on every successful step so replay
        is O(1) per step instead of re-running the SQL chain.
        """
        try:
            from .object_storage import StorageService
            conn = get_connection(self._session_id)
            # Use a unique tmp filename — DuckDB writes to disk, then we read it
            # back into memory for the upload.
            import os as _os
            import tempfile as _tempfile
            tmp_dir = _tempfile.gettempdir()
            parquet_path = _os.path.join(
                tmp_dir, f"step_snapshot_{uuid.uuid4().hex[:8]}.parquet"
            )
            try:
                conn.execute(
                    f"COPY (SELECT * FROM \"{view_name}\") "
                    f"TO '{parquet_path}' (FORMAT PARQUET, COMPRESSION ZSTD)"
                )
                with open(parquet_path, "rb") as f:
                    buffer = f.read()
            finally:
                try:
                    _os.unlink(parquet_path)
                except Exception:
                    pass
            # Stable filename per (dataset, view_name) so re-running the same
            # step overwrites the previous snapshot rather than littering S3.
            safe_view = "".join(c if c.isalnum() or c in "._-" else "_" for c in view_name)[:80]
            storage_path = StorageService.upload(
                user_id=user_id,
                dataset_id=dataset_id,
                buffer=buffer,
                file_name=f"step_{safe_view}.parquet",
            )
            if view_name in self._registry:
                self._registry[view_name]["is_artifact"] = True
                self._registry[view_name]["artifact_url"] = storage_path
            logger.info(
                "STEP_SNAPSHOT: view=%s storage_path=%s bytes=%d",
                view_name, storage_path, len(buffer),
            )
            return storage_path
        except Exception as exc:
            logger.warning("STEP_SNAPSHOT_FAILED: view=%s error=%s", view_name, exc)
            return None

    # ── Private helpers ──────────────────────────────────────────────────────

    def _fast_count(self, table: str) -> int | None:
        """Fast row count — DuckDB pushes COUNT through views."""
        try:
            result = execute_in_session(self._session_id, f'SELECT COUNT(*) AS n FROM "{table}"')
            return int(result[0]["n"]) if result else None
        except Exception:
            return None

    def _describe(self, table: str) -> list[dict]:
        """Get column schema via DESCRIBE — metadata only, no data scan."""
        try:
            rows = execute_in_session(self._session_id, f'DESCRIBE "{table}"')
            return [
                {"name": r.get("column_name", ""), "type": r.get("column_type", "")}
                for r in (rows or [])
            ]
        except Exception:
            return []

    def _preview(self, table: str, limit: int = DEFAULT_PREVIEW_LIMIT, offset: int = 0) -> list[dict]:
        """Sampled preview — LIMIT folds through view chain."""
        try:
            sql = f'SELECT * FROM "{table}" LIMIT {int(limit)}'
            if offset > 0:
                sql += f' OFFSET {int(offset)}'
            return execute_in_session(self._session_id, sql) or []
        except Exception:
            return []

    def _count_changed(self, source: str, target: str) -> int | None:
        """Count rows changed between source and target via EXCEPT."""
        try:
            result = execute_in_session(
                self._session_id,
                f'SELECT COUNT(*) AS n FROM ('
                f'SELECT * FROM "{source}" EXCEPT SELECT * FROM "{target}")',
            )
            return int(result[0]["n"]) if result else None
        except Exception:
            return None
