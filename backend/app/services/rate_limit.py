from __future__ import annotations

import time
from typing import Dict, Tuple


class FixedWindowRateLimiter:
    def __init__(self, limit_per_minute: int) -> None:
        self.limit = max(1, limit_per_minute)
        self._buckets: Dict[str, Tuple[int, float]] = {}

    def allow(self, key: str) -> bool:
        now = time.time()
        count, reset_at = self._buckets.get(key, (0, now + 60))
        if now > reset_at:
            count, reset_at = 0, now + 60
        count += 1
        self._buckets[key] = (count, reset_at)
        return count <= self.limit
