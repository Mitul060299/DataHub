from typing import List
import logging
import uuid
from sqlalchemy.exc import ProgrammingError
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
        except ProgrammingError:
            # project_id (or another new column) doesn't exist yet on this
            # deployment — fall back to a raw INSERT using only the base columns
            # that were present in migration 0002.
            if db:
                try:
                    db.rollback()
                except Exception:
                    pass
            db2 = None
            try:
                from sqlalchemy import text as _text
                db2 = SessionLocal()
                db2.execute(
                    _text(
                        "INSERT INTO audit_logs (id, action, actor, target, metadata)"
                        " VALUES (:id, :action, :actor, :target, :metadata::jsonb)"
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "action": entry.action,
                        "actor": entry.actor,
                        "target": entry.target,
                        "metadata": __import__("json").dumps(entry.metadata),
                    },
                )
                db2.commit()
            except Exception:
                logger.exception("Failed to persist audit entry (fallback) action=%s actor=%s target=%s", entry.action, entry.actor, entry.target)
                if db2:
                    try:
                        db2.rollback()
                    except Exception:
                        pass
            finally:
                if db2:
                    try:
                        db2.close()
                    except Exception:
                        pass
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
