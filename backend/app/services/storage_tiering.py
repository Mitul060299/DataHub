from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict

from ..config import settings


class StorageTierService:
    def __init__(self) -> None:
        self._hot_max_size_bytes = settings.storage_tier_hot_max_size_bytes
        self._warm_max_size_bytes = settings.storage_tier_warm_max_size_bytes
        self._warm_after_days = settings.storage_tier_warm_after_days
        self._archive_after_days = settings.storage_tier_archive_after_days

    def policy(self) -> Dict[str, int | Dict[str, str]]:
        return {
            "hot_max_size_bytes": self._hot_max_size_bytes,
            "warm_max_size_bytes": self._warm_max_size_bytes,
            "warm_after_days": self._warm_after_days,
            "archive_after_days": self._archive_after_days,
            "storage_classes": {
                "hot": "STANDARD",
                "warm": "STANDARD_IA",
                "archive": "GLACIER",
            },
        }

    def update_policy(
        self,
        hot_max_size_bytes: int | None = None,
        warm_max_size_bytes: int | None = None,
        warm_after_days: int | None = None,
        archive_after_days: int | None = None,
    ) -> Dict[str, int | Dict[str, str]]:
        if hot_max_size_bytes is not None:
            self._hot_max_size_bytes = hot_max_size_bytes
        if warm_max_size_bytes is not None:
            self._warm_max_size_bytes = warm_max_size_bytes
        if warm_after_days is not None:
            self._warm_after_days = warm_after_days
        if archive_after_days is not None:
            self._archive_after_days = archive_after_days
        if self._warm_max_size_bytes < self._hot_max_size_bytes:
            self._warm_max_size_bytes = self._hot_max_size_bytes
        if self._archive_after_days < self._warm_after_days:
            self._archive_after_days = self._warm_after_days
        return self.policy()

    def assign_initial_tier(
        self,
        file_size_bytes: int | None = None,
        row_count: int | None = None,
        parent_tier: str | None = None,
    ) -> str:
        if parent_tier in {"hot", "warm", "archive"}:
            return parent_tier
        if file_size_bytes is not None:
            if file_size_bytes <= self._hot_max_size_bytes:
                return "hot"
            if file_size_bytes <= self._warm_max_size_bytes:
                return "warm"
            return "archive"
        if row_count is not None:
            if row_count <= 500_000:
                return "hot"
            if row_count <= 5_000_000:
                return "warm"
            return "archive"
        return "hot"

    def resolve_storage_class(self, tier: str, provider: str | None) -> str | None:
        if not provider:
            return None
        provider_norm = provider.lower()
        if provider_norm != "s3":
            return None
        if tier == "archive":
            return "GLACIER"
        if tier == "warm":
            return "STANDARD_IA"
        return "STANDARD"

    def rebalance_tier(
        self,
        current_tier: str,
        created_at: datetime | None,
        last_queried_at: datetime | None,
    ) -> str:
        now = datetime.now(timezone.utc)
        reference = last_queried_at or created_at
        if reference is None:
            return current_tier
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)

        archive_cutoff = now - timedelta(days=self._archive_after_days)
        warm_cutoff = now - timedelta(days=self._warm_after_days)

        if reference <= archive_cutoff:
            return "archive"
        if reference <= warm_cutoff:
            return "warm"
        return "hot"


storage_tier_service = StorageTierService()
