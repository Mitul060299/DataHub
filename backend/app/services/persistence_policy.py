"""Single sanctioned creator for ``DatasetMetaDB`` and ``ArtifactDB`` rows.

Every persistent dataset / artifact row in the system must be materialized
through this module.  This codifies *why* a row exists (the ``triggered_by``
argument) and gives us a single chokepoint where we can:

* attach an audit log entry,
* enforce invariants (e.g. parent_id only set for user-published derivatives),
* short-circuit accidental auto-materialization from background code paths.

A static guard test (``tests/test_persistence_policy.py``) AST-walks the
``app/`` tree and fails CI if any code outside this module calls
``DatasetMetaDB(...)`` or ``ArtifactDB(...)`` directly.

Add a new ``triggered_by`` value here whenever you add a new legitimate code
path that materializes one of these rows.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from sqlalchemy.orm import Session

from ..models_db import ArtifactDB, DatasetLineageEdgeDB, DatasetMetaDB

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Allowed trigger taxonomy
# ---------------------------------------------------------------------------

DatasetTriggeredBy = Literal[
    "user_upload",     # Human uploaded a file or finalized a presigned upload
    "user_save",       # Human clicked "Save as dataset" / checkpoint
    "user_publish",    # Human published a derivative as a permanent dataset
    "transform",       # Programmatic transform output (DataTransformationService)
    "pipeline_step",   # Programmatic pipeline_v2 step materialization
    "system_restore",  # Admin / restore-from-backup flows
]

ArtifactTriggeredBy = Literal[
    "user_save",       # Saved checkpoint
    "user_export",     # Explicit export (BI / download)
    "user_publish",    # Published as a shareable artifact
]

_DATASET_TRIGGERS = set(DatasetTriggeredBy.__args__)
_ARTIFACT_TRIGGERS = set(ArtifactTriggeredBy.__args__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def materialize_dataset(
    db: Session,
    *,
    triggered_by: str,
    **fields: Any,
) -> DatasetMetaDB:
    """Create + add a ``DatasetMetaDB`` row.

    The caller is still responsible for the surrounding transaction
    (``db.flush()`` / ``db.commit()``); this helper only constructs the row,
    attaches it to the session, and emits an audit log line.
    """
    if triggered_by not in _DATASET_TRIGGERS:
        raise ValueError(
            f"Unknown DatasetMetaDB trigger {triggered_by!r}; "
            f"allowed: {sorted(_DATASET_TRIGGERS)}"
        )
    row = DatasetMetaDB(**fields)
    db.add(row)
    # If this row declares a parent, also record the lineage edge so
    # downstream code can stop walking the deprecated ``parent_id`` column.
    parent_id = fields.get("parent_id")
    child_id = fields.get("id")
    if parent_id and child_id:
        try:
            record_lineage_edge(db, child_id=child_id, parent_id=parent_id)
        except Exception:
            logger.exception(
                "materialize_dataset: lineage edge insert failed (non-fatal)"
            )
    logger.info(
        "materialize_dataset id=%s name=%s parent_id=%s triggered_by=%s user_id=%s",
        fields.get("id"),
        fields.get("name"),
        fields.get("parent_id"),
        triggered_by,
        fields.get("user_id"),
    )
    # Append-only audit event.  Failure here must not break the business op.
    try:
        from .event_log import emit_event
        emit_event(
            db,
            event_type="dataset_materialized",
            user_id=fields.get("user_id"),
            workspace_id=fields.get("workspace_id"),
            payload={
                "triggered_by": triggered_by,
                "dataset_id": fields.get("id"),
                "name": fields.get("name"),
                "parent_id": fields.get("parent_id"),
                "row_count": fields.get("row_count"),
                "source_type": fields.get("source_type"),
            },
        )
    except Exception:
        logger.exception("materialize_dataset: event emit failed (non-fatal)")
    return row


def materialize_artifact(
    db: Session,
    *,
    triggered_by: str,
    **fields: Any,
) -> ArtifactDB:
    """Create + add an ``ArtifactDB`` row.  See :func:`materialize_dataset`."""
    if triggered_by not in _ARTIFACT_TRIGGERS:
        raise ValueError(
            f"Unknown ArtifactDB trigger {triggered_by!r}; "
            f"allowed: {sorted(_ARTIFACT_TRIGGERS)}"
        )
    row = ArtifactDB(**fields)
    db.add(row)
    logger.info(
        "materialize_artifact id=%s name=%s triggered_by=%s user_id=%s",
        fields.get("id"),
        fields.get("name"),
        triggered_by,
        fields.get("user_id"),
    )
    try:
        from .event_log import emit_event
        emit_event(
            db,
            event_type="artifact_materialized",
            user_id=fields.get("user_id"),
            session_id=fields.get("session_id"),
            run_id=fields.get("pipeline_run_id"),
            step_id=fields.get("step_id"),
            payload={
                "triggered_by": triggered_by,
                "artifact_id": fields.get("id"),
                "name": fields.get("name"),
                "type": fields.get("type"),
                "format": fields.get("format"),
                "row_count": fields.get("row_count"),
            },
        )
    except Exception:
        logger.exception("materialize_artifact: event emit failed (non-fatal)")
    return row


# ---------------------------------------------------------------------------
# Lineage edges (replaces the deprecated ``DatasetMetaDB.parent_id`` chain)
# ---------------------------------------------------------------------------

def record_lineage_edge(
    db: Session,
    *,
    child_id: str,
    parent_id: str,
    transform_id: str | None = None,
) -> None:
    """Idempotently record a lineage edge ``parent_id -> child_id``.

    Safe to call multiple times for the same pair; the unique
    ``(child_id, parent_id)`` index is checked first via a SELECT so the
    INSERT is skipped on conflict (works on SQLite + Postgres without
    needing dialect-specific ON CONFLICT).
    """
    if not child_id or not parent_id or child_id == parent_id:
        return
    existing = (
        db.query(DatasetLineageEdgeDB.id)
        .filter(
            DatasetLineageEdgeDB.child_id == child_id,
            DatasetLineageEdgeDB.parent_id == parent_id,
        )
        .first()
    )
    if existing:
        return
    db.add(
        DatasetLineageEdgeDB(
            id=f"edge:{child_id}:{parent_id}",
            child_id=child_id,
            parent_id=parent_id,
            transform_id=transform_id,
        )
    )


def lineage_parents(db: Session, child_id: str) -> list[str]:
    """Return the parent ids for a given child (typically 0 or 1 today)."""
    if not child_id:
        return []
    rows = (
        db.query(DatasetLineageEdgeDB.parent_id)
        .filter(DatasetLineageEdgeDB.child_id == child_id)
        .all()
    )
    return [str(r[0]) for r in rows if r[0]]


def lineage_children(db: Session, parent_id: str) -> list[str]:
    """Return the child ids for a given parent (any number)."""
    if not parent_id:
        return []
    rows = (
        db.query(DatasetLineageEdgeDB.child_id)
        .filter(DatasetLineageEdgeDB.parent_id == parent_id)
        .all()
    )
    return [str(r[0]) for r in rows if r[0]]
