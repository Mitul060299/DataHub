from typing import List
import logging
import uuid
from ..models import AuditEntry
from ..db import SessionLocal
from ..models_db import AuditLogDB

logger = logging.getLogger(__name__)


class AuditStore:
    def __init__(self) -> None:
        self._entries: List[AuditEntry] = []

    def add(self, entry: AuditEntry) -> None:
        self._entries.append(entry)
        db = None
        try:
            db = SessionLocal()
            db.add(
                AuditLogDB(
                    id=str(uuid.uuid4()),
                    action=entry.action,
                    actor=entry.actor,
                    target=entry.target,
                    metadata_=entry.metadata,
                )
            )
            db.commit()
        except Exception:
            logger.exception("Failed to persist audit entry action=%s actor=%s target=%s", entry.action, entry.actor, entry.target)
            if db:
                try:
                    db.rollback()
                except Exception:
                    pass
        finally:
            if db:
                try:
                    db.close()
                except Exception:
                    pass

    def list(self) -> List[AuditEntry]:
        return list(self._entries)


audit_store = AuditStore()
