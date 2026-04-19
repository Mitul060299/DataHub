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

from ..models_db import ArtifactDB, DatasetMetaDB

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
    logger.info(
        "materialize_dataset id=%s name=%s parent_id=%s triggered_by=%s user_id=%s",
        fields.get("id"),
        fields.get("name"),
        fields.get("parent_id"),
        triggered_by,
        fields.get("user_id"),
    )
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
    return row
