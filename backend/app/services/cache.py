from __future__ import annotations

import time
from typing import Any, Dict, Tuple

from ..config import settings


class SimpleTTLCache:
    def __init__(self, ttl_seconds: int = 300, max_items: int = 200) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_items = max_items
        self._store: Dict[str, Tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        if key not in self._store:
            return None
        expires_at, value = self._store[key]
        if expires_at < time.time():
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        if len(self._store) >= self.max_items:
            oldest_key = min(self._store.items(), key=lambda item: item[1][0])[0]
            self._store.pop(oldest_key, None)
        self._store[key] = (time.time() + self.ttl_seconds, value)

    def clear(self) -> None:
        self._store.clear()

    def delete_prefix(self, prefix: str) -> None:
        keys = [key for key in self._store.keys() if key.startswith(prefix)]
        for key in keys:
            self._store.pop(key, None)

    def stats(self) -> Dict[str, Any]:
        return {
            "size": len(self._store),
            "ttl_seconds": self.ttl_seconds,
            "max_items": self.max_items,
        }


profile_cache = SimpleTTLCache(
    ttl_seconds=settings.profile_cache_ttl_seconds,
    max_items=settings.profile_cache_max,
)


def invalidate_profile_cache(dataset_id: str) -> None:
    profile_cache.delete_prefix(f"profile:{dataset_id}:")
    profile_cache.delete_prefix(f"summary:{dataset_id}:")
    profile_cache.delete_prefix(f"corr:{dataset_id}")
