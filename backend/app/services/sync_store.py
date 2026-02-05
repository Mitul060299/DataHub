from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional


@dataclass
class SyncStatus:
    key: str
    last_synced_at: str
    mode: str
    dataset_id: Optional[str] = None


class SyncStore:
    def __init__(self) -> None:
        self._status: Dict[str, SyncStatus] = {}

    def update(self, key: str, mode: str, dataset_id: Optional[str]) -> SyncStatus:
        status = SyncStatus(
            key=key,
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            mode=mode,
            dataset_id=dataset_id,
        )
        self._status[key] = status
        return status

    def list(self) -> List[SyncStatus]:
        return list(self._status.values())

    def get(self, key: str) -> Optional[SyncStatus]:
        return self._status.get(key)


sync_store = SyncStore()