from __future__ import annotations

import json
import re
import uuid
from typing import Any

import pandas as pd
from sqlalchemy.orm import Session

from ..config import settings
from ..services.duckdb_service import DuckDBService
from ..services.llm_provider import complete_sync, get_default_model
from ..services.data_conversion import DataConversionService
from ..models_db import DatasetMetaDB, DatasetChunkDB, DatasetDataDB
from ..services.token_tracking_service import log_call


class AIAgentService:
    @staticmethod
    def _resolve_model_name(model: str) -> str:
        normalized = (model or "").strip().lower()
        aliases = {
            "llama 3.1 8b instant": "llama-3.1-8b-instant",
            "llama3.1-8b-instant": "llama-3.1-8b-instant",
            "llama3.1 8b instant": "llama-3.1-8b-instant",
            "llama 3.3 70b versatile": "llama-3.3-70b-versatile",
            "llama3.3-70b-versatile": "llama-3.3-70b-versatile",
            "llama3.3 70b versatile": "llama-3.3-70b-versatile",
        }
        return aliases.get(normalized, model)

    @staticmethod
    def analyze_dataset(
        dataset_id: str,
        db: Session,
        *,
        user_id: str = "",
        session_id: str | None = None,
        table_name: str | None = None,
        client_pipeline_steps: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        context = AIAgentService._get_dataset_context(
            dataset_id, db,
            session_id=session_id,
            table_name=table_name,
            client_pipeline_steps=client_pipeline_steps,
        )
        model = get_default_model()
        if not AIAgentService._is_llm_configured():
            return {
                "issues": [],
                "suggestions": [],
                "data_profile": AIAgentService._compute_data_profile(context),
                "used_session_data": bool(context.get("usedSessionData")),
                "session_fallback_reason": context.get("sessionFallbackReason"),
                "error": "LLM provider is not configured. Set LLM_PROVIDER and the corresponding API key.",
            }

        system_prompt = (
            "You are a data quality expert analyzing datasets.\n\n"
            "Identify ALL issues:\n"
            "- Duplicates (exact row matches)\n"
            "- Missing values (nulls, empty strings, 'N/A', 'null')\n"
            "- Outliers (values beyond 3 standard deviations)\n"
            "- Type inconsistencies (mixed types in column)\n"
            "- Format inconsistencies (dates, phone numbers, emails)\n"
            "- Whitespace issues (leading/trailing spaces)\n"
            "- Case inconsistencies (mixed upper/lower)\n"
            "- Invalid values (negative ages, future dates)\n\n"
            "Suggest operations:\n"
            "- Cleaning (remove, fill, standardize)\n"
            "- Transformation (filter, aggregate, pivot)\n"
            "- New columns (derived calculations)\n\n"
            "Return JSON with this exact structure:\n"
            "{\n"
            "  \"issues\": [\n"
            "    {\n"
            "      \"type\": \"duplicates\" | \"missing_values\" | \"outliers\" | \"inconsistent_types\" | \"format_issues\" | \"whitespace\" | \"case_issues\",\n"
            "      \"column\": \"column_name\" | null,\n"
            "      \"severity\": \"high\" | \"medium\" | \"low\",\n"
            "      \"count\": number,\n"
            "      \"percentage\": number,\n"
            "      \"description\": \"Human explanation\",\n"
            "      \"examples\": [\"example1\", \"example2\"]\n"
            "    }\n"
            "  ],\n"
            "  \"suggestions\": [\n"
            "    {\n"
            "      \"operation\": \"remove_duplicates\" | \"fill_missing\" | \"remove_outliers\" | \"trim_whitespace\" | \"standardize_case\" | \"fix_types\" | \"filter_rows\" | \"create_column\" | \"rename_columns\" | \"aggregate\" | \"pivot\",\n"
            "      \"column\": \"column_name\" | null,\n"
            "      \"method\": \"specific method\",\n"
            "      \"description\": \"What this will do\",\n"
            "      \"impact\": \"Estimated effect\",\n"
            "      \"priority\": \"high\" | \"medium\" | \"low\",\n"
            "      \"sql\": \"DuckDB SQL query\"\n"
            "    }\n"
            "  ]\n"
            "}"
        )

        user_prompt = (
            "Analyze this dataset:\n\n"
            f"Total rows: {context['rowCount']:,}\n"
            f"{('Analyzing sample: 1,000 rows' if context['isLargeDataset'] else '')}\n\n"
            f"Schema:\n{json.dumps(context['schema'], indent=2)}\n\n"
            f"Statistics:\n{json.dumps(context['stats'], indent=2)}\n\n"
            f"Sample data (first 10 rows):\n{json.dumps(context['sampleData'][:10], indent=2)}\n\n"
            "Identify ALL data quality issues and suggest cleaning operations."
        )

        _usage: dict[str, Any] = {}
        try:
            response, _usage = AIAgentService._call_llm(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                model=model,
                response_format={"type": "json_object"},
                user_id=user_id,
                dataset_rows=context.get("rowCount", 0),
            )
        except Exception as exc:
            return {
                "issues": [],
                "suggestions": [],
                "data_profile": AIAgentService._compute_data_profile(context),
                "used_session_data": bool(context.get("usedSessionData")),
                "session_fallback_reason": context.get("sessionFallbackReason"),
                "error": f"LLM request failed: {str(exc)}",
            }
        log_call(
            user_id=user_id,
            session_id=session_id or "",
            model_used=model,
            query_type="insights",
            input_tokens=_usage.get("prompt_tokens", 0),
            output_tokens=_usage.get("completion_tokens", 0),
            dataset_rows=context.get("rowCount", 0),
        )

        payload = AIAgentService._safe_json(response)
        if not isinstance(payload, dict):
            payload = {}
        payload.setdefault("issues", [])
        payload.setdefault("suggestions", [])
        # Always include the computed profile — it is ground-truth, not LLM-estimated
        payload["data_profile"] = AIAgentService._compute_data_profile(context)
        # Surface session-fallback so the UI can show a banner instead of silently
        # presenting a quality report on the original (uncleaned) dataset.
        payload["used_session_data"] = bool(context.get("usedSessionData"))
        if context.get("sessionFallbackReason"):
            payload["session_fallback_reason"] = context["sessionFallbackReason"]
        return payload

    @staticmethod
    def _compute_data_profile(context: dict[str, Any]) -> dict[str, Any]:
        """Compute ground-truth data quality metrics from the sample data.

        Returns a dict with:
          - row_count         : total rows in the dataset
          - sample_size       : number of rows analysed
          - duplicate_rows    : exact duplicate row count in the sample
          - duplicate_pct     : duplicate percentage in the sample
          - columns           : per-column profile dict
        """
        sample = context.get("sampleData") or []
        row_count: int = context.get("rowCount") or len(sample)

        if not sample:
            return {
                "row_count": row_count,
                "sample_size": 0,
                "duplicate_rows": 0,
                "duplicate_pct": 0.0,
                "columns": {},
            }

        try:
            df = pd.DataFrame(sample)
        except Exception:
            return {
                "row_count": row_count,
                "sample_size": len(sample),
                "duplicate_rows": 0,
                "duplicate_pct": 0.0,
                "columns": {},
            }

        n = len(df)
        duplicate_count = int(df.duplicated().sum())
        duplicate_pct = round(duplicate_count / n * 100, 2) if n else 0.0

        col_profiles: dict[str, Any] = {}
        for col in df.columns:
            series = df[col]
            null_count = int(series.isna().sum())
            # Also count common pseudo-nulls in string columns
            if pd.api.types.is_string_dtype(series) or pd.api.types.is_object_dtype(series):
                pseudo_null_mask = series.astype(str).str.strip().str.lower().isin(
                    {"", "null", "none", "n/a", "na", "nan", "-"}
                )
                null_count = int((series.isna() | pseudo_null_mask).sum())
            null_pct = round(null_count / n * 100, 2) if n else 0.0
            unique_count = int(series.nunique(dropna=True))

            profile: dict[str, Any] = {
                "null_count": null_count,
                "null_pct": null_pct,
                "unique_count": unique_count,
                "unique_pct": round(unique_count / n * 100, 2) if n else 0.0,
            }

            # Numeric column extras: min, max, mean, std, outlier_count
            numeric_series = pd.to_numeric(series, errors="coerce")
            if numeric_series.notna().sum() / max(n, 1) > 0.5:
                valid = numeric_series.dropna()
                if len(valid) > 1:
                    mean = float(valid.mean())
                    std = float(valid.std(ddof=0))
                    outlier_count = int((((valid - mean) / std).abs() > 3.0).sum()) if std > 0 else 0
                    profile.update({
                        "min": round(float(valid.min()), 4),
                        "max": round(float(valid.max()), 4),
                        "mean": round(mean, 4),
                        "std": round(std, 4),
                        "outlier_count": outlier_count,
                        "outlier_pct": round(outlier_count / len(valid) * 100, 2),
                    })
            else:
                # String/categorical: top 5 values
                top = series.dropna().astype(str).value_counts().head(5)
                profile["top_values"] = [
                    {"value": str(v), "count": int(c)} for v, c in top.items()
                ]

            col_profiles[str(col)] = profile

        return {
            "row_count": row_count,
            "sample_size": n,
            "duplicate_rows": duplicate_count,
            "duplicate_pct": duplicate_pct,
            "columns": col_profiles,
        }

    @staticmethod
    def process_command(
        dataset_id: str,
        user_message: str,
        conversation_history: list[dict[str, Any]],
        db: Session,
        secondary_dataset_ids: list[str] | None = None,
        user_id: str = "",
        session_id: str = "",
    ) -> dict[str, Any]:
        context = AIAgentService._get_dataset_context(dataset_id, db)
        model = get_default_model()
        if not AIAgentService._is_llm_configured():
            return {
                "response": "LLM provider is not configured. Set LLM_PROVIDER and the corresponding API key.",
                "transformation": None,
                "needsConfirmation": False,
            }

        lowered = user_message.lower()
        if "show" in lowered and "operation" in lowered:
            return {
                "response": "Available operations: cleaning, transformation, aggregation, advanced.",
                "transformation": None,
                "needsConfirmation": False,
            }

        system_prompt = (
            "You are an expert data transformation assistant.\n\n"
            "[DATA SCHEMA START]\n"
            f"- Columns: {', '.join(AIAgentService._sanitize_for_prompt(c) for c in context['columns'])}\n"
            f"- Row count: {context['rowCount']:,}\n"
            f"- Data types: {json.dumps({AIAgentService._sanitize_for_prompt(k): v for k, v in context['schema'].items()})}\n"
            "[DATA SCHEMA END]\n\n"
        )

        # Include schemas of any secondary datasets so the LLM can generate
        # correct JOIN / UNION SQL referencing the right column names.
        if secondary_dataset_ids:
            secondary_info_lines: list[str] = []
            for sec_id in secondary_dataset_ids:
                try:
                    sec_ctx = AIAgentService._get_dataset_context(sec_id, db)
                    sec_meta = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == sec_id).first()
                    alias = AIAgentService._sanitize_for_prompt(
                        str(sec_meta.name) if sec_meta and sec_meta.name else sec_id
                    )
                    safe_cols = ', '.join(
                        AIAgentService._sanitize_for_prompt(c) for c in sec_ctx['columns']
                    )
                    secondary_info_lines.append(
                        f"- {alias} (id: {sec_id}): columns={safe_cols} | "
                        f"rows={sec_ctx['rowCount']:,}"
                    )
                except Exception:
                    secondary_info_lines.append(f"- {sec_id}: (unavailable)")
            secondary_block = "\n".join(secondary_info_lines)
            system_prompt += (
                "ADDITIONAL DATASETS AVAILABLE FOR JOIN/UNION:\n"
                f"{secondary_block}\n"
                "When generating SQL that spans multiple datasets, reference them by their SQL\n"
                "alias names shown above. The primary dataset is always available as 'dataset'.\n\n"
            )

        system_prompt += (
            "AVAILABLE OPERATIONS:\n\n"
            "CLEANING:\n"
            "- remove_duplicates: Remove exact duplicate rows\n"
            "- fill_missing: Fill null values (mean, median, mode, ffill, bfill, custom)\n"
            "- remove_outliers: Remove statistical outliers (IQR or Z-score)\n"
            "- trim_whitespace: Remove leading/trailing spaces\n"
            "- standardize_case: Convert to UPPER, lower, or Title Case\n"
            "- replace_values: Find and replace specific values\n\n"
            "TRANSFORMATION:\n"
            "- filter_rows: Keep rows matching conditions (WHERE)\n"
            "- select_columns: Keep only specific columns\n"
            "- drop_columns: Remove specific columns\n"
            "- rename_columns: Change column names\n"
            "- create_column: Add calculated column\n"
            "- split_column: Split by delimiter (e.g., 'Full Name' -> 'First Name', 'Last Name')\n"
            "- merge_columns: Concatenate columns\n"
            "- change_type: Convert data type (string->number, string->date)\n\n"
            "AGGREGATION:\n"
            "- group_by: Group and aggregate (SUM, AVG, COUNT, MIN, MAX)\n"
            "- pivot: Convert rows to columns\n"
            "- unpivot: Convert columns to rows\n"
            "- distinct: Keep only unique values\n\n"
            "ADVANCED:\n"
            "- join: Combine tables (INNER, LEFT, RIGHT, FULL)\n"
            "- union: Stack tables vertically\n"
            "- sort: Order by columns (ASC/DESC)\n"
            "- sample: Random sample of rows\n"
            "- bin_values: Create ranges/buckets for numbers\n\n"
            "When user asks for a transformation, return JSON with:\n"
            "{\n"
            "  \"response\": \"message to user\",\n"
            "  \"needsConfirmation\": true|false,\n"
            "  \"transformation\": {\n"
            "    \"operation\": \"operation_name\",\n"
            "    \"sql\": \"DuckDB SQL query\",\n"
            "    \"description\": \"what it does\",\n"
            "    \"affectedRows\": \"estimate\",\n"
            "    \"columns\": [\"col1\", \"col2\"]\n"
            "  }\n"
            "}\n"
            "SQL RULES:\n"
            "- Use dataset as the input relation/table name (never use table as relation name)\n"
            "- SELECT statements are allowed for projection/filter/aggregation transforms\n"
            "- Mutation statements are allowed when needed (UPDATE/DELETE/ALTER TABLE)\n"
            "- Keep SQL valid for DuckDB syntax\n"
            "If no transformation is required, set transformation to null and needsConfirmation to false."
        )

        # Retry with progressively shorter history on 413 (context-window overflow).
        # Small/free-tier models (e.g. llama-3.1-8b-instant) have ≤6K token windows
        # that are easily exceeded when conversation history accumulates.
        _usage2: dict[str, Any] = {}
        _last_exc: Exception | None = None
        response: str = ""
        for _history_len in (6, 2, 0):
            _slice = conversation_history[-_history_len:] if _history_len > 0 else []
            messages = [{"role": "system", "content": system_prompt}]
            for item in _slice:
                role = item.get("role")
                content = item.get("content")
                if role in {"user", "assistant"} and content:
                    messages.append({"role": role, "content": content})
            messages.append({"role": "user", "content": user_message})
            try:
                response, _usage2 = AIAgentService._call_llm(
                    messages,
                    model=model,
                    response_format={"type": "json_object"},
                    user_id=user_id,
                )
                _last_exc = None
                break
            except Exception as exc:
                _last_exc = exc
                err_str = str(exc)
                is_context_overflow = (
                    "413" in err_str
                    or "Request too large" in err_str
                    or "please reduce" in err_str.lower()
                    or "context_length_exceeded" in err_str
                )
                if is_context_overflow and _history_len > 0:
                    continue  # try again with fewer messages
                break  # non-413 or already at minimum — surface immediately

        if _last_exc is not None:
            return {
                "response": f"LLM request failed: {str(_last_exc)}.",
                "transformation": None,
                "needsConfirmation": False,
            }
        log_call(
            user_id=user_id,
            session_id=session_id,
            model_used=model,
            query_type="execute",
            input_tokens=_usage2.get("prompt_tokens", 0),
            output_tokens=_usage2.get("completion_tokens", 0),
        )
        payload = AIAgentService._safe_json(response)
        if not isinstance(payload, dict):
            return {
                "response": "I could not parse that. Please rephrase.",
                "transformation": None,
                "needsConfirmation": False,
            }

        transformation = payload.get("transformation")
        if isinstance(transformation, dict):
            raw_sql = str(transformation.get("sql") or "")
            transformation["sql"] = AIAgentService._normalize_transformation_sql(raw_sql)
            transformation = {
                "id": str(uuid.uuid4()),
                **transformation,
                "requiresSample": context["isLargeDataset"],
            }
            payload["transformation"] = transformation
        payload.setdefault("response", "")
        payload.setdefault("needsConfirmation", False)
        return payload

    @staticmethod
    def _call_llm(
        messages: list[dict[str, str]],
        model: str,
        response_format: dict[str, Any] | None = None,
        user_id: str = "",
        dataset_rows: int = 0,
    ) -> tuple[str, dict[str, Any]]:
        """Call the LLM via the provider-agnostic llm_provider gateway.

        Returns (content, usage_dict) where usage_dict has keys
        prompt_tokens, completion_tokens, total_tokens.
        """
        json_mode = bool(response_format and response_format.get("type") == "json_object")
        content, in_tok, out_tok = complete_sync(
            messages,
            model=model,
            temperature=0.3,
            json_mode=json_mode,
            call_type="insights",
            user_id=user_id,
            dataset_rows=dataset_rows,
        )
        usage = {"prompt_tokens": in_tok, "completion_tokens": out_tok, "total_tokens": in_tok + out_tok}
        return content, usage

    @staticmethod
    def _sanitize_for_prompt(value: str, max_len: int = 100) -> str:
        """Sanitize a user-controlled string before embedding it in an LLM prompt.

        Strips common prompt-injection trigger phrases and control characters,
        then truncates to ``max_len`` characters so injection payloads cannot
        carry arbitrarily long instructions.
        """
        import re as _re
        # Remove line-feed and carriage-return to prevent instruction injection
        # across lines inside the system prompt.
        cleaned = value.replace("\n", " ").replace("\r", " ")
        # Neutralise common instruction-override trigger words by prefixing them
        # with a zero-width space so the LLM does not treat them as directives.
        _TRIGGERS = ("ignore ", "forget ", "disregard ", "system:", "<|", "###",
                     "assistant:", "user:", "human:")
        lower = cleaned.lower()
        for trigger in _TRIGGERS:
            if trigger in lower:
                # Replace case-insensitively
                cleaned = _re.sub(
                    _re.escape(trigger), f"\u200b{trigger}", cleaned,
                    flags=_re.IGNORECASE,
                )
        return cleaned[:max_len]

    @staticmethod
    def _is_llm_configured() -> bool:
        """Return True if the active LLM provider has an API key configured."""
        p = settings.llm_provider.lower()
        if p == "groq":
            return bool(settings.groq_api_key)
        if p == "openai":
            return bool(settings.openai_api_key)
        if p == "anthropic":
            return bool(settings.anthropic_api_key)
        return False

    @staticmethod
    def _safe_json(raw: str) -> Any:
        try:
            return json.loads(raw)
        except Exception:
            return {}

    @staticmethod
    def _normalize_transformation_sql(sql: str) -> str:
        normalized = (sql or "").strip()
        if not normalized:
            return normalized
        return re.sub(r"\btable\b", "dataset", normalized, flags=re.IGNORECASE)

    # Track which session_ids have had their views replayed at least once in
    # *this* process.  When the DuckDB session is disk-backed, view definitions
    # survive a restart but any signed S3/R2 URLs they reference will have
    # expired — re-registering the source view with a fresh signed URL on the
    # first request per process keeps queries working without forcing the
    # client to re-upload or re-run the pipeline.
    _warmed_sessions: set[str] = set()
    _warmed_lock = __import__("threading").Lock()

    # Content-addressed replay cache:
    #   session_id -> (sha256(step_list), frozenset(output_table names))
    # When a replay request arrives whose normalized step list hashes the same
    # AND every output_table view still exists in the live DuckDB session, the
    # rebuild is skipped.  This makes the common "refresh -> repeat command"
    # path O(1) and removes the entire class of "is the session current?" race
    # conditions: the answer is "yes iff the views are still there".
    _replay_cache: dict[str, tuple[str, frozenset[str]]] = {}
    _replay_cache_lock = __import__("threading").Lock()

    @staticmethod
    def invalidate_replay_cache(session_id: str) -> None:
        """Drop the cached step-hash for a session (e.g. after explicit reset)."""
        with AIAgentService._replay_cache_lock:
            AIAgentService._replay_cache.pop(session_id, None)

    @staticmethod
    def _replay_session_views(
        session_id: str,
        dataset: Any,
        client_steps: list[dict[str, Any]] | None = None,
    ) -> bool:
        """Re-register the source Parquet + replay pipeline VIEWs.

        Sources, in priority order:
          1. ``client_steps`` — pipeline_steps sent by the frontend in this request
             (race-immune: we don't depend on the previous request's DB commit).
          2. ``PipelineStepDB`` rows for this session (cross-device fallback).

        A step is replayable when it has both an ``output_table`` and a
        non-empty ``sql``/``duckdb_sql`` field.  Steps that fail to replay are
        logged and SKIPPED — we no longer break the whole chain on the first
        bad step, since later independent branches may still be valid.

        Returns True if at least one view was replayed.
        """
        import re as _re_replay
        from .duckdb_session import get_connection, register_view
        from .object_storage import StorageService
        from ..db import SessionLocal
        from ..models_db import PipelineStepDB as _PipelineStepDB
        import logging as _rlog
        _logger = _rlog.getLogger(__name__)

        conn = get_connection(session_id)

        # 1. Re-register the source dataset view
        if dataset and dataset.storage_path:
            try:
                file_path = StorageService.get_query_path(dataset.storage_path)
                _sanitized = _re_replay.sub(r"[^A-Za-z0-9_]", "_", (dataset.name or "dataset").strip()).lower()
                _sanitized = _re_replay.sub(r"_+", "_", _sanitized).strip("_") or "dataset"
                if _sanitized[0].isdigit():
                    _sanitized = "ds_" + _sanitized
                register_view(session_id, _sanitized, file_path)
                if _sanitized != "dataset":
                    register_view(session_id, "dataset", file_path)
            except Exception as _src_exc:
                _logger.warning(
                    "replay: source view registration failed for session %s: %s",
                    session_id[:8], _src_exc,
                )
                # Source registration may fail for connector-only datasets;
                # derived steps that don't reference the source can still replay.
        elif dataset:
            # Connector-imported dataset with no Parquet file — load from JSONB
            # chunks and materialise as a DuckDB TABLE so pipeline SQL can run.
            _src_alias = _re_replay.sub(r"[^A-Za-z0-9_]", "_", (dataset.name or "").strip()).lower()
            _src_alias = _re_replay.sub(r"_+", "_", _src_alias).strip("_")
            if not _src_alias:
                # No usable name — fall back to the sanitized UUID
                _src_alias = _re_replay.sub(r"[^A-Za-z0-9_]", "_", str(dataset.id))
            elif _src_alias[0].isdigit():
                _src_alias = "ds_" + _src_alias
            try:
                import pandas as _pd_replay
                from ..models_db import DatasetChunkDB as _ChunkDB, DatasetDataDB as _DataDB
                _rdb = SessionLocal()
                try:
                    _rows: list[dict] = []
                    for _cc in (
                        _rdb.query(_ChunkDB)
                        .filter(_ChunkDB.dataset_id == str(dataset.id))
                        .order_by(_ChunkDB.chunk_index)
                        .all()
                    ):
                        _rows.extend(_cc.rows or [])
                    if not _rows:
                        _dd = _rdb.query(_DataDB).filter(_DataDB.id == str(dataset.id)).first()
                        if _dd and isinstance(_dd.rows, list):
                            _rows = list(_dd.rows)
                finally:
                    _rdb.close()
                if _rows:
                    _df_r = _pd_replay.DataFrame(_rows)
                    conn.register("_replay_src", _df_r)
                    conn.execute(f'CREATE OR REPLACE TABLE "{_src_alias}" AS SELECT * FROM _replay_src')
                    if _src_alias != "dataset":
                        conn.execute(f'CREATE OR REPLACE VIEW "dataset" AS SELECT * FROM "{_src_alias}"')
                    # Also register the raw UUID alias — stored pipeline step SQL
                    # may reference the UUID from before the name was set.
                    _uuid_alias = _re_replay.sub(r"[^A-Za-z0-9_]", "_", str(dataset.id))
                    if _uuid_alias != _src_alias:
                        conn.execute(f'CREATE OR REPLACE VIEW "{_uuid_alias}" AS SELECT * FROM "{_src_alias}"')
                    _logger.info(
                        "replay: JSONB source table created alias=%s rows=%d session=%s",
                        _src_alias, len(_rows), session_id[:8],
                    )
                else:
                    _logger.warning(
                        "replay: JSONB dataset %s has no rows — pipeline replay may fail",
                        dataset.id,
                    )
            except Exception as _jexc:
                _logger.warning(
                    "replay: JSONB source table creation failed session=%s: %s",
                    session_id[:8], _jexc,
                )

        # 2. Build the canonical step list
        normalized: list[dict[str, Any]] = []

        def _add_norm(
            step_number: Any,
            output_table: Any,
            sql: Any,
            snapshot_path: Any = None,
        ) -> None:
            try:
                sn = int(step_number or 0)
            except Exception:
                sn = 0
            ot = str(output_table or "").strip()
            sq = str(sql or "").strip()
            sp = str(snapshot_path or "").strip() or None
            # A step is replayable if EITHER it has a snapshot_path (deterministic
            # O(1) restore) OR it has both an output_table + duckdb_sql.  We
            # accept snapshot-only entries so future steps that drop the SQL
            # column for storage savings still replay cleanly.
            if not ot or (not sq and not sp):
                return
            normalized.append({
                "step_number": sn,
                "output_table": ot,
                "sql": sq,
                "snapshot_path": sp,
            })

        if client_steps:
            for cs in client_steps:
                if not isinstance(cs, dict):
                    continue
                _add_norm(
                    cs.get("step_number"),
                    cs.get("output_table") or cs.get("session_table_name"),
                    cs.get("sql") or cs.get("duckdb_sql"),
                    cs.get("snapshot_path"),
                )

        if not normalized:
            _db = SessionLocal()
            try:
                rows = (
                    _db.query(_PipelineStepDB)
                    .filter(
                        _PipelineStepDB.session_id == session_id,
                        _PipelineStepDB.output_table.isnot(None),
                        _PipelineStepDB.status == "completed",
                    )
                    .order_by(_PipelineStepDB.step_number)
                    .all()
                )
                for ps in rows:
                    _add_norm(
                        ps.step_number,
                        ps.output_table,
                        ps.duckdb_sql,
                        getattr(ps, "snapshot_path", None),
                    )
            finally:
                _db.close()

        if not normalized:
            _logger.info(
                "replay: no replayable steps for session %s (client=%d)",
                session_id[:8], len(client_steps or []),
            )
            return False

        normalized.sort(key=lambda s: s["step_number"])

        # Idempotent fast path: if the step list is identical to the last
        # successful replay for this session AND every view is still present
        # in the live DuckDB connection, skip the rebuild entirely.
        import hashlib as _h_replay
        from .duckdb_session import table_exists as _table_exists_replay
        step_hash = _h_replay.sha256(
            "\n".join(
                f"{s['step_number']}\x1f{s['output_table']}\x1f{s['sql']}\x1f{s.get('snapshot_path') or ''}"
                for s in normalized
            ).encode("utf-8")
        ).hexdigest()
        output_tables = frozenset(s["output_table"] for s in normalized)
        with AIAgentService._replay_cache_lock:
            cached = AIAgentService._replay_cache.get(session_id)
        if cached and cached[0] == step_hash:
            try:
                if all(_table_exists_replay(session_id, t) for t in output_tables):
                    _logger.debug(
                        "replay: cache hit session=%s hash=%s tables=%d",
                        session_id[:8], step_hash[:8], len(output_tables),
                    )
                    return True
            except Exception:
                # If the existence probe itself fails, fall through to a real
                # rebuild rather than trusting a possibly-stale cache entry.
                pass

        # 3. Re-create each VIEW.  Skip-and-continue rather than break — a later
        # step that doesn't depend on a failed predecessor can still succeed.
        #
        # Strategy per step:
        #   (a) PREFERRED — if snapshot_path is set, register a view over the
        #       Parquet snapshot.  Deterministic + O(1) regardless of source
        #       file size or how complex the original SQL was.  This is what
        #       makes "kill the server mid-pipeline + reload" produce byte-
        #       identical results.
        #   (b) FALLBACK — replay the original SQL.  Used when the snapshot
        #       is missing (older rows, snapshot upload failed) or when the
        #       snapshot's storage path can't be resolved.
        replayed_count = 0
        snapshot_count = 0
        failures: list[tuple[int, str]] = []
        for step in normalized:
            out_table = step["output_table"]
            raw_sql = step["sql"]
            snap = step.get("snapshot_path")
            replayed = False

            # (a) Prefer snapshot — deterministic, fast.
            if snap:
                try:
                    query_path = StorageService.get_query_path(snap)
                    # Quote the path safely.  read_parquet accepts a string
                    # literal; we escape any embedded single quotes.
                    safe_path = query_path.replace("'", "''")
                    conn.execute(
                        f"CREATE OR REPLACE VIEW \"{out_table}\" AS "
                        f"SELECT * FROM read_parquet('{safe_path}')"
                    )
                    replayed_count += 1
                    snapshot_count += 1
                    replayed = True
                except Exception as _snap_exc:
                    _logger.info(
                        "replay: snapshot failed for %s (step %s) — "
                        "falling back to SQL: %s",
                        out_table, step["step_number"], _snap_exc,
                    )

            # (b) Fallback — replay original SQL.
            if not replayed and raw_sql:
                ct_m = _re_replay.match(
                    r"(?i)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+\S+\s+AS\s+",
                    raw_sql,
                )
                select_sql = (raw_sql[ct_m.end():].strip() if ct_m else raw_sql).rstrip("; \t\r\n")
                try:
                    conn.execute(f'CREATE OR REPLACE VIEW "{out_table}" AS ({select_sql})')
                    replayed_count += 1
                    replayed = True
                except Exception as _view_exc:
                    failures.append((step["step_number"], str(_view_exc)[:200]))
                    _logger.warning(
                        "replay: failed to create view %s (step %s): %s",
                        out_table, step["step_number"], _view_exc,
                    )
            elif not replayed:
                # No snapshot AND no SQL — nothing we can do.
                failures.append((step["step_number"], "no snapshot_path and no duckdb_sql"))
        if failures:
            _logger.warning(
                "replay: session %s replayed %d/%d views (snapshot=%d), failures=%s",
                session_id[:8], replayed_count, len(normalized),
                snapshot_count, failures,
            )
        else:
            _logger.info(
                "replay: session %s replayed %d/%d views (snapshot=%d)",
                session_id[:8], replayed_count, len(normalized), snapshot_count,
            )
        # Update cache only when *all* steps replayed cleanly — a partial
        # rebuild leaves missing views, so we want the next request to retry.
        if replayed_count == len(normalized) and replayed_count > 0:
            with AIAgentService._replay_cache_lock:
                AIAgentService._replay_cache[session_id] = (step_hash, output_tables)
        return replayed_count > 0

    @staticmethod
    def _get_dataset_context(
        dataset_id: str,
        db: Session,
        *,
        session_id: str | None = None,
        table_name: str | None = None,
        client_pipeline_steps: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise ValueError("Dataset not found")

        row_count = int(dataset.row_count or 0)
        is_large = row_count > 1_000_000
        sample_size = 1000 if is_large else max(1, min(row_count, 10000))

        sample_data: list[dict[str, Any]] = []
        # When a live DuckDB session has pipeline output, query that instead of
        # the original Parquet — the user expects the report on transformed data.
        _used_session = False
        _fallback_reason: str | None = None
        if session_id and table_name:
            from .duckdb_session import execute_in_session, table_exists
            import logging as _ctx_log
            _logger = _ctx_log.getLogger(__name__)

            # First request per process for this session: replay views so any
            # disk-persisted view definitions referencing expired signed URLs
            # are refreshed.  Subsequent requests skip this.  CREATE OR REPLACE
            # makes the operation idempotent even if a table_exists check below
            # also triggers a replay.
            _warmed = False
            with AIAgentService._warmed_lock:
                if session_id not in AIAgentService._warmed_sessions:
                    AIAgentService._warmed_sessions.add(session_id)
                    _warmed = True
            if _warmed:
                try:
                    AIAgentService._replay_session_views(
                        session_id, dataset, client_steps=client_pipeline_steps,
                    )
                except Exception as _warm_exc:
                    _logger.warning(
                        "session-warmup: replay failed for %s: %s",
                        session_id[:8], _warm_exc,
                    )

            # Proactively replay views if the target table is missing from the
            # DuckDB session (server restart, TTL eviction, memory pressure).
            # This is idempotent — CREATE OR REPLACE VIEW is safe on existing views.
            try:
                if not table_exists(session_id, table_name):
                    _logger.info(
                        "quality-report: view %s missing in session %s — replaying from DB",
                        table_name, session_id[:8],
                    )
                    _replayed = AIAgentService._replay_session_views(
                        session_id, dataset, client_steps=client_pipeline_steps,
                    )
                    if not _replayed:
                        _fallback_reason = (
                            f"The cleaned/transformed table '{table_name}' could not be "
                            "restored from history (no completed pipeline steps were found "
                            "for this session). Showing results on the original dataset instead."
                        )
            except Exception as _replay_exc:
                _logger.warning("quality-report: proactive replay failed: %s", _replay_exc)
                _fallback_reason = (
                    f"Could not restore the transformed table '{table_name}' "
                    f"({type(_replay_exc).__name__}). Showing results on the original dataset instead."
                )

            try:
                sample_data = execute_in_session(
                    session_id,
                    f'SELECT * FROM "{table_name}" LIMIT {sample_size}',
                ) or []
                if sample_data:
                    _used_session = True
                    # Update row_count from the session table for accurate profile.
                    try:
                        cnt = execute_in_session(
                            session_id,
                            f'SELECT COUNT(*) AS n FROM "{table_name}"',
                        )
                        if cnt:
                            row_count = int(cnt[0]["n"])
                    except Exception:
                        pass
                else:
                    _logger.warning(
                        "quality-report: session query returned 0 rows for %s in session %s",
                        table_name, session_id[:8],
                    )
                    if _fallback_reason is None:
                        _fallback_reason = (
                            f"The transformed table '{table_name}' is empty in the current "
                            "session. Showing results on the original dataset instead."
                        )
            except Exception as _sess_exc:
                _logger.warning(
                    "quality-report: session query failed after replay for %s: %s",
                    table_name, _sess_exc,
                )
                if _fallback_reason is None:
                    _fallback_reason = (
                        f"Could not query the transformed table '{table_name}' "
                        f"({type(_sess_exc).__name__}). Showing results on the original dataset instead."
                    )
        if not _used_session:
            if dataset.storage_path:
                sample_query = (
                    f"SELECT * FROM dataset USING SAMPLE {sample_size} ROWS"
                    if is_large
                    else f"SELECT * FROM dataset LIMIT {sample_size}"
                )
                sample_data = DuckDBService.query_parquet(dataset.storage_path, sample_query)
            else:
                df = AIAgentService._load_dataframe(dataset_id, db)
                sample_data = df.head(sample_size).to_dict(orient="records")

        schema = dataset.schema_json or DataConversionService._infer_schema(
            pd.DataFrame(sample_data)
        )
        stats = dataset.stats_json or DataConversionService._generate_stats(
            pd.DataFrame(sample_data), schema
        )
        columns = list(schema.keys()) if isinstance(schema, dict) else []

        return {
            "datasetId": dataset_id,
            "schema": schema,
            "stats": stats,
            "rowCount": row_count,
            "sampleData": sample_data,
            "isLargeDataset": is_large,
            "columns": columns,
            # Visibility into session fallback so callers can warn the user
            # rather than silently returning a report on the wrong data.
            "usedSessionData": _used_session,
            "sessionFallbackReason": (
                _fallback_reason if (session_id and table_name and not _used_session) else None
            ),
        }

    @staticmethod
    def _load_dataframe(dataset_id: str, db: Session) -> pd.DataFrame:
        chunks = (
            db.query(DatasetChunkDB)
            .filter(DatasetChunkDB.dataset_id == dataset_id)
            .order_by(DatasetChunkDB.chunk_index.asc())
            .all()
        )
        if chunks:
            rows: list[dict[str, Any]] = []
            for chunk in chunks:
                rows.extend(chunk.rows or [])
            return pd.DataFrame(rows)

        data = db.query(DatasetDataDB).filter(DatasetDataDB.id == dataset_id).first()
        if not data:
            return pd.DataFrame()
        return pd.DataFrame(data.rows or [])
