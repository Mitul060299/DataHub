from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from fastapi import HTTPException, Header
from sqlalchemy.orm import Session

from ..security import get_current_role, get_current_subject, get_current_user_id, require_role
from ..models_db import DatasetMetaDB, TransformationHistoryDB
from ..services.ai_agent_service import AIAgentService
from ..services.agent_graph import AgentGraphService
from ..services.data_transformation_service import DataTransformationService


class CleaningController:
    _UNDO_SNAPSHOT_PREFIX = "__UNDO_SNAPSHOT__:"

    @staticmethod
    def analyze_dataset(dataset_id: str, authorization: str | None, db: Session) -> dict[str, Any]:
        role = get_current_role(authorization)
        require_role("viewer", role)

        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")

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
        db: Session,
        secondary_dataset_ids: list[str] | None = None,
        pending_plan: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        role = get_current_role(authorization)
        require_role("viewer", role)

        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")

        request_user_id = get_current_user_id(authorization) or get_current_subject(authorization) or "agent"
        effective_workspace_id = workspace_id or dataset.workspace_id or "default"

        return AgentGraphService.process_command_stream(
            dataset_id=dataset_id,
            user_message=message,
            session_id=session_id,
            pipeline_steps=pipeline_steps,
            plan_approved=plan_approved,
            pending_plan=pending_plan or [],
            user_id=request_user_id,
            workspace_id=effective_workspace_id,
            db=db,
            secondary_dataset_ids=secondary_dataset_ids or [],
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
        try:
            return DataTransformationService.undo_last_transformation(dataset_id, user_id, db)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
