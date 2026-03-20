"""
pipeline_runner.py
==================
Standalone async pipeline execution engine for scheduled / upload-triggered /
manual pipeline refreshes.

Execution contract
------------------
* Always opens a FRESH duckdb.connect(":memory:") — never reuses a session.
* On ANY step failure: writes failed PipelineRunV2DB row, broadcasts failure event
  to Supabase Realtime, returns early.  Does NOT update snapshot bindings.
* On full success: exports output tables to Parquet via pyarrow, writes
  TableSnapshotDB rows, updates dashboard_tiles.snapshot_id for affected tiles,
  broadcasts refresh_complete to Supabase Realtime per dashboard.
"""
from __future__ import annotations

import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import duckdb
import httpx
import pyarrow as pa
import pyarrow.parquet as pq

from ..config import settings
from ..db import SessionLocal
from .analytics import track
from ..models_db import (
    DashboardTileDB,
    DashboardV2DB,
    DataSourceDB,
    PipelineRunV2DB,
    PipelineV2DB,
    TableSnapshotDB,
)
from .object_storage import StorageService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supabase Realtime broadcast (REST API — works with service role key)
# ---------------------------------------------------------------------------

async def _broadcast(channel: str, event: str, payload: dict) -> None:
    """Fire-and-forget broadcast via Supabase Realtime REST API."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return
    url = f"{settings.supabase_url.rstrip('/')}/realtime/v1/api/broadcast"
    body = {
        "messages": [
            {
                "topic": channel,
                "event": event,
                "payload": payload,
            }
        ]
    }
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(url, json=body, headers=headers)
    except Exception as exc:
        logger.warning("Realtime broadcast failed: %s", exc)


# ---------------------------------------------------------------------------
# Helper: export DuckDB table → Parquet bytes → S3
# ---------------------------------------------------------------------------

def _export_table_to_s3(
    con: duckdb.DuckDBPyConnection,
    table_name: str,
    pipeline_id: str,
    run_id: str,
    user_id: str,
) -> tuple[str, int, dict]:
    """
    Export *table_name* from the DuckDB connection as Parquet, upload to S3.

    Returns:
        (storage_path, row_count, schema_dict)
    """
    arrow_table: pa.Table = con.execute(f"SELECT * FROM {table_name}").arrow()
    row_count = len(arrow_table)

    # Build schema dict: {column_name: dtype_str}
    schema_dict = {
        field.name: str(field.type) for field in arrow_table.schema
    }

    buf = io.BytesIO()
    pq.write_table(arrow_table, buf, compression="snappy")
    buf.seek(0)

    file_name = f"{table_name}_{run_id}.parquet"
    # Use a synthetic dataset_id for the S3 key path
    snap_dataset_id = f"snapshot_{pipeline_id}_{table_name}"
    storage_path = StorageService.upload(
        user_id=user_id,
        dataset_id=snap_dataset_id,
        buffer=buf.read(),
        file_name=file_name,
        storage_tier="hot",
    )
    return storage_path, row_count, schema_dict


# ---------------------------------------------------------------------------
# Helper: resolve source file path for a pipeline step
# ---------------------------------------------------------------------------

def _resolve_source_path(db, source_id: str | None, source_overrides: dict | None) -> str | None:
    """
    Given a data_source id, return the local / presigned file path DuckDB can read.
    Respects source_overrides injected by the upload trigger.
    """
    if source_overrides and source_id and source_overrides.get("source_id") == source_id:
        raw = source_overrides.get("storage_path")
        if raw:
            return StorageService.get_query_path(raw)

    if not source_id:
        return None

    src = db.query(DataSourceDB).filter(DataSourceDB.id == source_id).first()
    if not src or not src.is_active:
        return None

    cfg: dict = src.config or {}

    if src.source_type == "manual_upload":
        raw = cfg.get("storage_path")
        if raw:
            return StorageService.get_query_path(str(raw))

    elif src.source_type == "s3_folder":
        # Return a glob path for DuckDB to scan the whole folder
        bucket = cfg.get("bucket", "")
        prefix = cfg.get("prefix", "")
        return f"s3://{bucket}/{prefix}*.parquet"

    elif src.source_type in {"google_sheets", "url"}:
        url = cfg.get("url", "")
        # DuckDB can read remote CSV/Parquet via HTTP
        return url

    # sftp: not directly readable by DuckDB; would require pre-download
    return None


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

async def run_pipeline(
    pipeline_id: str,
    triggered_by: str,
    source_overrides: dict | None = None,
) -> str:
    """
    Execute a pipelines_v2 record end-to-end.

    Returns the pipeline_run_id (UUID string).
    """
    run_id = str(uuid.uuid4())
    db = SessionLocal()

    try:
        # ── 1. Load pipeline ─────────────────────────────────────────────────
        pipeline: PipelineV2DB | None = db.query(PipelineV2DB).filter(
            PipelineV2DB.id == pipeline_id
        ).first()
        if not pipeline:
            logger.error("pipeline_runner: pipeline %s not found", pipeline_id)
            return run_id

        steps: list[dict] = pipeline.steps if isinstance(pipeline.steps, list) else []
        user_id: str = str(pipeline.user_id or "system")

        # ── 2. Create run record (status=running) ────────────────────────────
        run = PipelineRunV2DB(
            id=run_id,
            pipeline_id=pipeline_id,
            user_id=user_id,
            status="running",
            triggered_by=triggered_by,
            started_at=datetime.now(timezone.utc),
            execution_log=[],
            step_results={},
            metrics={},
        )
        db.add(run)
        db.commit()

        # ── 3. Open fresh DuckDB ─────────────────────────────────────────────
        con = duckdb.connect(":memory:")
        execution_log: list[dict[str, Any]] = []
        failed = False
        error_msg: str | None = None
        output_tables: list[str] = []   # ordered list of logical table names produced

        try:
            # ── 4. Register source views ─────────────────────────────────────
            for step in steps:
                params: dict = step.get("parameters") or {}
                source_id = params.get("data_source_id") or params.get("source_id")
                alias = params.get("source_alias") or params.get("alias")
                if source_id and alias:
                    path = _resolve_source_path(db, source_id, source_overrides)
                    if path:
                        try:
                            con.execute(
                                f"CREATE OR REPLACE VIEW {alias} AS "
                                f"SELECT * FROM read_parquet('{path}')"
                            )
                        except Exception as view_exc:
                            # Try CSV fallback
                            try:
                                con.execute(
                                    f"CREATE OR REPLACE VIEW {alias} AS "
                                    f"SELECT * FROM read_csv_auto('{path}')"
                                )
                            except Exception:
                                raise RuntimeError(
                                    f"Cannot register source '{alias}' from path '{path}': {view_exc}"
                                ) from view_exc

            # ── 5. Replay SQL steps ──────────────────────────────────────────
            for idx, step in enumerate(steps):
                step_num = idx + 1
                sql: str = str(
                    step.get("sql") or step.get("query") or ""
                ).strip()
                output_table: str | None = (
                    step.get("output_table")
                    or (step.get("parameters") or {}).get("output_table")
                )
                step_start = datetime.now(timezone.utc)

                log_entry: dict[str, Any] = {
                    "step": step_num,
                    "action": step.get("action_type") or step.get("operation") or "transform",
                    "sql": sql,
                    "started_at": step_start.isoformat(),
                }

                if not sql:
                    execution_log.append({**log_entry, "status": "skipped", "note": "no SQL"})
                    continue

                # ── Validate input_tables are present in the DuckDB connection ─
                required_tables: list[str] = []
                _raw_it = step.get("input_tables") or (step.get("parameters") or {}).get("input_tables") or []
                if isinstance(_raw_it, list):
                    required_tables = [str(t) for t in _raw_it if t]
                _missing = None
                for _tbl in required_tables:
                    try:
                        con.execute(f"SELECT * FROM {_tbl} LIMIT 0")
                    except Exception:
                        _missing = _tbl
                        break
                if _missing:
                    error_msg = (
                        f"Step {step_num} requires table '{_missing}' which was not found in the "
                        f"replay context. Ensure all source files are uploaded before running "
                        f"this pipeline."
                    )
                    log_entry.update({"status": "failed", "error": error_msg})
                    execution_log.append(log_entry)
                    failed = True
                    break

                try:
                    con.execute(sql)
                    step_end = datetime.now(timezone.utc)
                    duration_ms = int((step_end - step_start).total_seconds() * 1000)
                    log_entry.update({"status": "success", "duration_ms": duration_ms})
                    if output_table:
                        output_tables.append(output_table)
                except Exception as step_exc:
                    log_entry.update({"status": "failed", "error": str(step_exc)})
                    execution_log.append(log_entry)
                    failed = True
                    error_msg = f"Step {step_num} failed: {step_exc}"
                    break

                execution_log.append(log_entry)

        finally:
            con.close()  # close DuckDB regardless

        # ── 6. On failure: save run, broadcast, return ───────────────────────
        if failed:
            run.status = "failed"
            run.error_message = error_msg
            run.execution_log = execution_log
            run.completed_at = datetime.now(timezone.utc)
            db.commit()

            # Broadcast failure to all dashboards that use this pipeline
            affected_dashboard_ids = _get_affected_dashboard_ids(db, pipeline_id)
            for dashboard_id in affected_dashboard_ids:
                await _broadcast(
                    f"dashboard:{dashboard_id}",
                    "pipeline_failed",
                    {
                        "pipeline_id": pipeline_id,
                        "run_id": run_id,
                        "error": error_msg,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                )
            return run_id

        # ── 7. Export output tables as Parquet snapshots ─────────────────────
        # Re-open connection just to read results we materialized
        # (output_tables were created as tables/views inside the step SQL)
        # We need to re-run the pipeline to get the final tables.
        # Since DuckDB was closed, we need to re-execute to get arrow data.
        # Strategy: replay into a new connection for export only.
        con2 = duckdb.connect(":memory:")
        snapshot_records: list[TableSnapshotDB] = []
        primary_snapshot_url: str | None = None

        try:
            # Re-register sources
            for step in steps:
                params = step.get("parameters") or {}
                source_id = params.get("data_source_id") or params.get("source_id")
                alias = params.get("source_alias") or params.get("alias")
                if source_id and alias:
                    path = _resolve_source_path(db, source_id, source_overrides)
                    if path:
                        try:
                            con2.execute(
                                f"CREATE OR REPLACE VIEW {alias} AS "
                                f"SELECT * FROM read_parquet('{path}')"
                            )
                        except Exception:
                            try:
                                con2.execute(
                                    f"CREATE OR REPLACE VIEW {alias} AS "
                                    f"SELECT * FROM read_csv_auto('{path}')"
                                )
                            except Exception:
                                pass

            # Re-replay steps
            for step in steps:
                sql = str(step.get("sql") or step.get("query") or "").strip()
                if sql:
                    try:
                        con2.execute(sql)
                    except Exception:
                        pass  # already succeeded once; best-effort

            # Export each output table
            for table_name in output_tables:
                try:
                    storage_path, row_count, schema_dict = _export_table_to_s3(
                        con2, table_name, pipeline_id, run_id, user_id
                    )
                    snap_id = str(uuid.uuid4())
                    snap = TableSnapshotDB(
                        id=snap_id,
                        pipeline_run_id=run_id,
                        table_name=table_name,
                        snapshot_url=storage_path,
                        row_count=row_count,
                        schema=schema_dict,
                    )
                    snapshot_records.append(snap)
                    if primary_snapshot_url is None:
                        primary_snapshot_url = storage_path
                except Exception as export_exc:
                    logger.warning(
                        "pipeline_runner: failed to export table '%s': %s",
                        table_name, export_exc,
                    )
        finally:
            con2.close()

        # ── 8. Write snapshot records ─────────────────────────────────────────
        for snap in snapshot_records:
            db.add(snap)
        db.flush()

        # ── 9. Update pipeline_run ────────────────────────────────────────────
        run.status = "completed"
        run.output_snapshot_url = primary_snapshot_url
        run.execution_log = execution_log
        run.completed_at = datetime.now(timezone.utc)
        run.metrics = {
            "steps_total": len(steps),
            "steps_executed": len([e for e in execution_log if e.get("status") in {"success", "skipped"}]),
            "snapshots_created": len(snapshot_records),
        }

        # ── 10. Re-bind dashboard tiles to new snapshots ──────────────────────
        # Build a map: logical table_name → new snapshot_id
        snap_map: dict[str, str] = {s.table_name: s.id for s in snapshot_records}
        affected_tile_ids: list[str] = []
        affected_dashboard_ids_set: set[str] = set()

        if snap_map:
            all_tiles = db.query(DashboardTileDB).all()
            for tile in all_tiles:
                qs = tile.query_spec or {}
                src_table = qs.get("source_table") or qs.get("table_name")
                if src_table and src_table in snap_map:
                    tile.snapshot_id = snap_map[src_table]
                    tile.updated_at = datetime.now(timezone.utc)
                    affected_tile_ids.append(tile.id)
                    affected_dashboard_ids_set.add(tile.dashboard_id)

        db.commit()

        # ── 11. Broadcast refresh_complete to affected dashboards ─────────────
        refresh_ts = datetime.now(timezone.utc).isoformat()
        for dashboard_id in affected_dashboard_ids_set:
            # Find tile ids for this specific dashboard
            dashboard_tile_ids = [
                t.id for t in db.query(DashboardTileDB).filter(
                    DashboardTileDB.dashboard_id == dashboard_id,
                    DashboardTileDB.id.in_(affected_tile_ids),
                ).all()
            ]
            await _broadcast(
                f"dashboard:{dashboard_id}",
                "refresh_complete",
                {
                    "pipeline_id": pipeline_id,
                    "run_id": run_id,
                    "tile_ids": dashboard_tile_ids,
                    "timestamp": refresh_ts,
                },
            )

        track(str(user_id), "pipeline_run_completed", {"pipeline_id": pipeline_id, "run_id": run_id, "steps_total": len(steps), "snapshots_created": len(snapshot_records)})
        return run_id

    except Exception as top_exc:
        logger.exception("pipeline_runner: unhandled error for pipeline %s", pipeline_id)
        try:
            run_q = db.query(PipelineRunV2DB).filter(PipelineRunV2DB.id == run_id).first()
            if run_q:
                run_q.status = "failed"
                run_q.error_message = str(top_exc)
                run_q.completed_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
        track(str(user_id), "pipeline_run_failed", {"pipeline_id": pipeline_id, "run_id": run_id, "error": str(top_exc)[:200]})
        return run_id
    finally:
        db.close()


def _get_affected_dashboard_ids(db, pipeline_id: str) -> list[str]:
    """Return distinct dashboard_ids for tiles that were bound to any snapshot from this pipeline."""
    result = (
        db.query(DashboardTileDB.dashboard_id)
        .join(TableSnapshotDB, DashboardTileDB.snapshot_id == TableSnapshotDB.id)
        .join(PipelineRunV2DB, TableSnapshotDB.pipeline_run_id == PipelineRunV2DB.id)
        .filter(PipelineRunV2DB.pipeline_id == pipeline_id)
        .distinct()
        .all()
    )
    return [r[0] for r in result]
