"""
Live Dataset Federation Service

When a dataset is imported in "live" mode (import_mode = "live"), DataHub
does NOT copy rows into Postgres.  Instead, every preview / query call
delegates to this service, which reconnects to the source database on
demand, runs the original query, and caches results in-process for
`LIVE_DATASET_TTL_SECONDS` seconds (default 5 min) to avoid hammering the
source.

Cache key  : (dataset_id, query_hash)  — where query_hash is stable for the
             same SQL override, or "default" when using the original query.
Cache store: cachetools.TTLCache, thread-safe with a Lock.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from typing import Any, Dict, Optional

import pandas as pd

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-process TTL cache
# ---------------------------------------------------------------------------
try:
    from cachetools import TTLCache

    _cache: Any = TTLCache(
        maxsize=settings.dataset_cache_max,
        ttl=settings.live_dataset_ttl_seconds,
    )
except ImportError:
    logger.warning(
        "cachetools not installed — live dataset results will NOT be cached. "
        "Install cachetools>=5.3.0 to enable caching."
    )
    _cache = {}

_cache_lock = threading.Lock()


def _cache_key(dataset_id: str, sql_override: Optional[str]) -> str:
    if sql_override:
        h = hashlib.sha256(sql_override.encode()).hexdigest()[:16]
        return f"{dataset_id}:sql:{h}"
    return f"{dataset_id}:default"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class LiveDatasetService:
    """Fetch data from a live (pass-through) dataset, with short-term caching."""

    @staticmethod
    def get_live_data(
        dataset_meta: Any,
        db: Any,
        sql_override: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Fetch rows for a live dataset.

        Parameters
        ----------
        dataset_meta:
            A DatasetMetaDB row with import_mode='live' and connector_credential_id set.
        db:
            SQLAlchemy Session — used to look up the ConnectorCredentialDB row.
        sql_override:
            Optional SQL query to run instead of the original import query.
            Useful for preview filtering / ad-hoc queries.

        Returns
        -------
        pd.DataFrame
            The result set.  Raises ValueError / RuntimeError on any error.
        """
        cache_key = _cache_key(dataset_meta.id, sql_override)

        # --- Cache hit ---
        with _cache_lock:
            cached = _cache.get(cache_key)
        if cached is not None:
            logger.debug("[LIVE] Cache hit for %s", cache_key)
            return cached

        # --- Decrypt credentials ---
        from app.models_db import ConnectorCredentialDB
        from app.security import decrypt_connector_config
        from app.services.connectors import connector_registry

        cred_row = (
            db.query(ConnectorCredentialDB)
            .filter(ConnectorCredentialDB.id == dataset_meta.connector_credential_id)
            .first()
        )
        if not cred_row:
            raise ValueError(
                f"Connector credential {dataset_meta.connector_credential_id} not found — "
                "cannot fetch live data for dataset {dataset_meta.id}"
            )

        try:
            config = decrypt_connector_config(cred_row.encrypted_config)
        except Exception as exc:
            raise RuntimeError(
                f"Failed to decrypt connector credentials for dataset {dataset_meta.id}: {exc}"
            ) from exc

        # --- Build SQL ---
        connector_type = cred_row.connector_type
        connector = connector_registry.get(connector_type)
        if not connector:
            raise ValueError(f"Connector '{connector_type}' is not registered")

        if sql_override:
            sql = sql_override
        else:
            cfg = dataset_meta.connector_config or {}
            sql = str(cfg.get("query") or "").strip()
            if not sql:
                table = str(cfg.get("table") or "").strip()
                schema = str(cfg.get("schema") or "").strip()
                if not table:
                    raise ValueError(
                        f"Live dataset {dataset_meta.id} has no table or query in connector_config"
                    )
                if schema and connector_type not in ("sqlite",):
                    sql = f"SELECT * FROM {schema}.{table}"
                else:
                    sql = f"SELECT * FROM {table}"

        # --- Execute against source ---
        logger.info(
            "[LIVE] Fetching live data for dataset %s via %s (sql=%s…)",
            dataset_meta.id,
            connector_type,
            sql[:80],
        )

        if hasattr(connector, "execute_sql"):
            df = connector.execute_sql(sql, config)
        else:
            # Fallback for non-SQL connectors that somehow ended up in live mode
            df = connector.read(config)

        # --- Cache and return ---
        with _cache_lock:
            _cache[cache_key] = df

        return df

    @staticmethod
    def invalidate(dataset_id: str) -> None:
        """Remove all cached entries for a given dataset (e.g. after write-back)."""
        with _cache_lock:
            keys_to_remove = [k for k in list(_cache.keys()) if k.startswith(f"{dataset_id}:")]
            for k in keys_to_remove:
                _cache.pop(k, None)
        logger.debug("[LIVE] Invalidated %d cache entries for dataset %s", len(keys_to_remove), dataset_id)
