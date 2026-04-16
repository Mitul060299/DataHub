from __future__ import annotations

import logging
import re
from collections.abc import AsyncIterator
from typing import Any

from fastapi import HTTPException, Header
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..security import get_current_role, get_current_subject, get_current_user_id, require_role

logger = logging.getLogger(__name__)


def _sanitize_alias_for_replay(name: str) -> str:
    """Mirror context_loader._sanitize_alias — converts a dataset name to its DuckDB alias."""
    s = re.sub(r"[^A-Za-z0-9_]", "_", (name or "").strip()).lower()
    s = re.sub(r"_+", "_", s).strip("_")
    if not s or s[0].isdigit():
        s = "ds_" + s
    return s or "dataset"


def _normalize_sql_for_replay(sql: str, alias: str | None) -> str:
    """Replace the primary dataset alias in *sql* with the generic 'dataset'.

    The agent stores SQL that references named DuckDB aliases (e.g. 'customers_csv',
    'clean_1_abc123') registered in the live DuckDB session.  When replaying via
    DataTransformationService.execute_transformation, only a temp table called
    'dataset' is available, so every alias-based FROM/JOIN reference fails with a
    DuckDB "Table not found" error.

    This function replaces all word-boundary occurrences of *alias* with 'dataset'
    so the existing transform_rows path works correctly.
    """
    # Strip CREATE TABLE ... AS prefix — only the SELECT part is needed.
    sql = re.sub(
        r"^CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+\S+\s+AS\s+",
        "", sql, flags=re.IGNORECASE,
    )
    # Legacy alias normalizations (safe: only FROM/JOIN positions)
    sql = re.sub(r"\b(FROM|JOIN)\s+table\b", r"\1 dataset", sql, flags=re.IGNORECASE)
    sql = re.sub(r"\bdataset_rows\b", "dataset", sql, flags=re.IGNORECASE)
    if not alias or alias == "dataset":
        return sql
    # Replace alias → dataset throughout the SQL (column names never match
    # the generated alias so this replacement is safe in practice)
    replaced = re.sub(rf"\b{re.escape(alias)}\b", "dataset", sql, flags=re.IGNORECASE)
    if replaced != sql:
        return replaced
    # Fallback: the computed alias didn't appear verbatim in the SQL (e.g. the
    # dataset name in the DB includes a file extension that was stripped when the
    # agent registered the table).  Extract the primary table name straight from
    # the first non-subquery FROM clause and replace it.
    from_match = re.search(r"\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)\b", sql, re.IGNORECASE)
    if from_match:
        detected = from_match.group(1)
        if detected.lower() not in ("dataset", "dual", "sqlite_master", "information_schema"):
            logger.debug(
                "replay alias fallback: alias '%s' not found; replacing detected table '%s' → 'dataset'",
                alias, detected,
            )
            return re.sub(rf"\b{re.escape(detected)}\b", "dataset", sql, flags=re.IGNORECASE)
    return sql
from ..models_db import DatasetMetaDB, TransformationHistoryDB
# AIAgentService, AgentGraphService, DataTransformationService are imported
# lazily inside the static methods that use them so that langgraph, pandas,
# and redis are NOT loaded at startup — they save ~30-40 MB of startup RSS.


class CleaningController:
    _UNDO_SNAPSHOT_PREFIX = "__UNDO_SNAPSHOT__:"

    @staticmethod
    def analyze_dataset(dataset_id: str, authorization: str | None, db: Session) -> dict[str, Any]:
        role = get_current_role(authorization)
        require_role("viewer", role)

        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")

        from ..services.ai_agent_service import AIAgentService  # lazy
        return AIAgentService.analyze_dataset(dataset_id, db)

    @staticmethod
    def process_command(
        dataset_id: str,
        message: str,
        conversation_history: list[dict[str, Any]],
        authorization: str | None,
        db: Session,
    ) -> dict[str, Any]:
        role = get_current_role(authorization)
        require_role("viewer", role)

        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")

        from ..services.agent_graph import AgentGraphService  # lazy: loads langgraph on first AI call
        return AgentGraphService.process_command(dataset_id, message, conversation_history, db)

    @staticmethod
    async def process_command_stream(
        dataset_id: str,
        message: str,
        session_id: str,
        pipeline_steps: list[dict[str, Any]],
        plan_approved: bool,
        workspace_id: str | None,
        authorization: str | None,
        secondary_dataset_ids: list[str] | None = None,
        pending_plan: list[dict[str, Any]] | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
        plan_pending_modification: bool = False,
    ) -> AsyncIterator[dict[str, Any]]:
        role = get_current_role(authorization)
        require_role("viewer", role)

        _db = SessionLocal()
        try:
            dataset = _db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
            if not dataset:
                raise HTTPException(status_code=404, detail="Dataset not found")
            request_user_id = get_current_user_id(authorization) or get_current_subject(authorization) or "agent"
            effective_workspace_id = workspace_id or dataset.workspace_id or "default"
        finally:
            _db.close()

        from ..services.agent_graph import AgentGraphService  # lazy: loads langgraph on first AI call
        return AgentGraphService.process_command_stream(
            dataset_id=dataset_id,
            user_message=message,
            session_id=session_id,
            pipeline_steps=pipeline_steps,
            plan_approved=plan_approved,
            pending_plan=pending_plan or [],
            user_id=request_user_id,
            workspace_id=effective_workspace_id,
            secondary_dataset_ids=secondary_dataset_ids or [],
            conversation_history=conversation_history or [],
            plan_pending_modification=plan_pending_modification,
        )

    @staticmethod
    def execute_transformation(
        dataset_id: str,
        transformation: dict[str, Any],
        authorization: str | None,
        db: Session,
    ) -> dict[str, Any]:
        role = get_current_role(authorization)
        require_role("viewer", role)

        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")

        user_id = get_current_subject(authorization) or "unknown"
        from ..services.data_transformation_service import DataTransformationService  # lazy
        return DataTransformationService.execute_transformation(
            dataset_id,
            user_id,
            transformation,
            db,
        )

    @staticmethod
    def get_job_status(job_id: str, authorization: str | None) -> dict[str, Any]:
        role = get_current_role(authorization)
        require_role("viewer", role)
        from ..services.data_transformation_service import DataTransformationService  # lazy
        return DataTransformationService.get_job_status(job_id)

    @staticmethod
    def get_history(
        dataset_id: str,
        authorization: str | None,
        db: Session,
    ) -> dict[str, Any]:
        role = get_current_role(authorization)
        require_role("viewer", role)
        user_id = get_current_subject(authorization) or "unknown"

        query = (
            db.query(TransformationHistoryDB)
            .filter(TransformationHistoryDB.dataset_id == dataset_id)
            .filter(TransformationHistoryDB.user_id == user_id)
            .order_by(TransformationHistoryDB.created_at.desc())
            .limit(50)
        )

        history = [
            {
                "id": row.id,
                "dataset_id": row.dataset_id,
                "user_id": row.user_id,
                "operation": row.operation,
                "sql": row.sql,
                "description": row.description,
                "affected_rows": row.affected_rows,
                "execution_time_ms": row.execution_time_ms,
                "status": row.status,
                "error_message": (
                    None
                    if isinstance(row.error_message, str)
                    and row.error_message.startswith(CleaningController._UNDO_SNAPSHOT_PREFIX)
                    else row.error_message
                ),
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in query.all()
        ]

        return {"history": history}

    @staticmethod
    def undo_last_transformation(
        dataset_id: str,
        authorization: str | None,
        db: Session,
    ) -> dict[str, Any]:
        role = get_current_role(authorization)
        require_role("viewer", role)

        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")

        user_id = get_current_subject(authorization) or "unknown"
        from ..services.data_transformation_service import DataTransformationService  # lazy
        try:
            return DataTransformationService.undo_last_transformation(dataset_id, user_id, db)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @staticmethod
    def replay_steps(
        pivot_dataset_id: str,
        steps: list[dict[str, Any]],
        authorization: str | None,
        db: Session,
    ) -> dict[str, Any]:
        """Re-execute *steps* sequentially starting from *pivot_dataset_id*.

        Each step must have a ``sql`` key.  Steps without SQL are skipped and
        their input/output dataset ID is reported as the current pivot so the
        frontend knows they didn't produce a new dataset.

        Returns::

            {
                "replayed_steps": [
                    {"step_index": 0, "input_dataset_id": "...",
                     "output_dataset_id": "...", "row_count": 123},
                    ...
                ],
                "final_dataset_id": "...",
                "final_row_count": 123,
            }
        """
        role = get_current_role(authorization)
        require_role("editor", role)

        from ..services.data_transformation_service import DataTransformationService  # lazy
        user_id = get_current_subject(authorization) or "unknown"
        current_dataset_id = pivot_dataset_id
        replayed: list[dict[str, Any]] = []

        # Compute the alias used by the agent for the pivot dataset.
        # The agent derives aliases via _sanitize_alias(dataset.name).
        # For step 0 the alias is from the base dataset name; for step N it
        # is the output_table / session_table_name stored in step N-1's rawConfig.
        base_dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == pivot_dataset_id).first()
        current_alias: str = _sanitize_alias_for_replay(
            str(base_dataset.name or pivot_dataset_id) if base_dataset else pivot_dataset_id
        )

        for idx, step in enumerate(steps):
            sql = step.get("sql")
            if not sql and isinstance(step.get("transformation"), dict):
                sql = step["transformation"].get("sql")
            if not sql:
                # No SQL — report as pass-through
                replayed.append({
                    "step_index": idx,
                    "input_dataset_id": current_dataset_id,
                    "output_dataset_id": current_dataset_id,
                    "row_count": None,
                    "skipped": True,
                })
                continue

            # Normalize alias → 'dataset' so the SQL works through transform_rows.
            # The agent registered the dataset under a named alias (e.g. 'customers_csv')
            # rather than the generic 'dataset'; transform_rows only creates 'dataset'.
            normalized_sql = _normalize_sql_for_replay(sql, current_alias)
            if normalized_sql != sql:
                logger.debug(
                    "replay step %d: normalized alias '%s' → 'dataset' in SQL", idx, current_alias
                )

            transformation = {**step, "sql": normalized_sql}
            dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == current_dataset_id).first()
            if not dataset:
                raise HTTPException(status_code=404, detail=f"Dataset {current_dataset_id} not found during replay")

            try:
                result = DataTransformationService.execute_transformation(
                    current_dataset_id, user_id, transformation, db
                )
            except Exception as exc:
                logger.exception("replay step %d failed for dataset %s", idx, current_dataset_id)
                raise HTTPException(status_code=422, detail=f"Step {idx} failed: {exc}")

            # For immediate (non-large) datasets, result["result"]["outputDataset"]["id"]
            inner = result.get("result") or {}
            output_ds = inner.get("outputDataset") or {}
            new_dataset_id = output_ds.get("id") or current_dataset_id
            row_count = output_ds.get("rowCount")

            replayed.append({
                "step_index": idx,
                "input_dataset_id": current_dataset_id,
                "output_dataset_id": new_dataset_id,
                "row_count": row_count,
                "skipped": False,
            })

            # Update the alias for the next step: prefer the session table name
            # stored in the step's rawConfig (set by the agent's execute_step node)
            # so follow-on steps that reference the prior step's output table are
            # also correctly normalized.
            next_alias = (
                step.get("output_table")
                or step.get("session_table_name")
            )
            current_alias = str(next_alias) if next_alias else _sanitize_alias_for_replay(
                str(dataset.name or current_dataset_id)
            )
            current_dataset_id = new_dataset_id

        final_dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == current_dataset_id).first()
        return {
            "replayed_steps": replayed,
            "final_dataset_id": current_dataset_id,
            "final_row_count": int(final_dataset.row_count or 0) if final_dataset else None,
        }
