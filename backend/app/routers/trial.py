"""
trial.py
========
HTTP surface for the 15-day opt-in free trial.

Endpoints:
  POST /api/billing/trial/start  — activate trial on the chosen plan
  GET  /api/billing/trial/status — read current trial state for the user
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..dependencies import CurrentUser, get_current_user
from ..services import trial_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing/trial", tags=["billing"])


class StartTrialRequest(BaseModel):
    plan: str


def _ensure_billing_enabled() -> None:
    if not settings.billing_enabled:
        raise HTTPException(status_code=404, detail="Billing is not enabled")


@router.post("/start")
def start_trial(
    payload: StartTrialRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_billing_enabled()
    return trial_service.start_trial(user.id, payload.plan, db)


@router.get("/status")
def trial_status(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Status endpoint is safe to call regardless of billing flag — it just
    # returns the empty-trial shape if billing is off.
    return trial_service.get_trial_status(user.id, db)
