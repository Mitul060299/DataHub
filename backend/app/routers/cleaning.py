from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..controllers.cleaning_controller import CleaningController

router = APIRouter(prefix="/cleaning", tags=["cleaning"])


class CommandRequest(BaseModel):
    message: str
    conversationHistory: list[dict[str, Any]] = []


class TransformationRequest(BaseModel):
    transformation: dict[str, Any]


@router.post("/datasets/{dataset_id}/analyze")
def analyze_dataset(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return CleaningController.analyze_dataset(dataset_id, authorization, db)


@router.post("/datasets/{dataset_id}/chat")
def process_command(
    dataset_id: str,
    payload: CommandRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return CleaningController.process_command(
        dataset_id,
        payload.message,
        payload.conversationHistory,
        authorization,
        db,
    )


@router.post("/datasets/{dataset_id}/transform")
def execute_transformation(
    dataset_id: str,
    payload: TransformationRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return CleaningController.execute_transformation(
        dataset_id,
        payload.transformation,
        authorization,
        db,
    )


@router.get("/datasets/{dataset_id}/history")
def get_history(
    dataset_id: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return CleaningController.get_history(dataset_id, authorization, db)


@router.get("/jobs/{job_id}/status")
def get_job_status(
    job_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    return CleaningController.get_job_status(job_id, authorization)
