from typing import List
import uuid
from ..models import AuditEntry
from ..db import SessionLocal
from ..models_db import AuditLogDB


class AuditStore:
    def __init__(self) -> None:
        self._entries: List[AuditEntry] = []

    def add(self, entry: AuditEntry) -> None:
        self._entries.append(entry)
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
            pass
        finally:
            try:
                db.close()
            except Exception:
                pass

    def list(self) -> List[AuditEntry]:
        return list(self._entries)


audit_store = AuditStore()
