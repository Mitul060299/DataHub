"""Append-only event log for pipeline + persistence lifecycle.

Use :func:`emit_event` from controllers / services to record what happened.
Never UPDATE or DELETE rows in ``pipeline_events`` \u2014 the log is the audit trail.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models_db import PipelineEventDB

logger = logging.getLogger(__name__)


def emit_event(
    db: Session,
    *,
    event_type: str,
    user_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    session_id: Optional[str] = None,
    run_id: Optional[str] = None,
    step_id: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> Optional[PipelineEventDB]:
    """Append an event to ``pipeline_events``.

    Failures are swallowed and logged \u2014 event-log writes must never break the
    business operation that triggered them.  Returns the row on success or
    ``None`` if the insert was skipped due to an error.
    """
    if not event_type:
        return None
    row = PipelineEventDB(
        id=str(uuid.uuid4()),
        user_id=user_id,
        workspace_id=workspace_id,
        session_id=session_id,
        run_id=run_id,
        step_id=step_id,
        event_type=event_type,
        payload=payload or {},
    )
    try:
        db.add(row)
        # Caller owns the transaction; do not commit here.  If the caller
        # rolls back, the event row is correctly discarded.
        return row
    except Exception as exc:
        logger.warning(
            "event_log: failed to enqueue %s for user=%s session=%s: %s",
            event_type, user_id, session_id, exc,
        )
        return None
