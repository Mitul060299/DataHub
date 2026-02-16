from __future__ import annotations

import json
import uuid
from typing import Any

import httpx
import pandas as pd
from sqlalchemy.orm import Session

from ..config import settings
from ..services.duckdb_service import DuckDBService
from ..services.data_conversion import DataConversionService
from ..models_db import DatasetMetaDB, DatasetChunkDB, DatasetDataDB


class AIAgentService:
    @staticmethod
    def analyze_dataset(dataset_id: str, db: Session) -> dict[str, Any]:
        context = AIAgentService._get_dataset_context(dataset_id, db)
        provider, api_key, model = AIAgentService._provider_config()
        if not provider or not api_key:
            return {"issues": [], "suggestions": []}

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

        response = AIAgentService._call_llm(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            provider=provider,
            api_key=api_key,
            model=model,
            response_format={"type": "json_object"},
        )

        payload = AIAgentService._safe_json(response)
        if not isinstance(payload, dict):
            return {"issues": [], "suggestions": []}
        payload.setdefault("issues", [])
        payload.setdefault("suggestions", [])
        return payload

    @staticmethod
    def process_command(
        dataset_id: str,
        user_message: str,
        conversation_history: list[dict[str, Any]],
        db: Session,
    ) -> dict[str, Any]:
        context = AIAgentService._get_dataset_context(dataset_id, db)
        provider, api_key, model = AIAgentService._provider_config()
        if not provider or not api_key:
            return {
                "response": "LLM is not configured. Please set GROQ_API_KEY or OPENAI_API_KEY.",
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
            f"Dataset context:\n- Columns: {', '.join(context['columns'])}\n"
            f"- Row count: {context['rowCount']:,}\n"
            f"- Data types: {json.dumps(context['schema'])}\n\n"
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
            "If no transformation is required, set transformation to null and needsConfirmation to false."
        )

        messages = [{"role": "system", "content": system_prompt}]
        for item in conversation_history[-6:]:
            role = item.get("role")
            content = item.get("content")
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_message})

        response = AIAgentService._call_llm(
            messages,
            provider=provider,
            api_key=api_key,
            model=model,
            response_format={"type": "json_object"},
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
        provider: str,
        api_key: str,
        model: str,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        base_url = AIAgentService._provider_base_url(provider)
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0.3,
        }
        if response_format:
            body["response_format"] = response_format
        response = httpx.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=body,
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    @staticmethod
    def _provider_config() -> tuple[str, str, str]:
        provider = settings.llm_provider.lower()
        if provider == "groq" and settings.groq_api_key:
            return provider, settings.groq_api_key, settings.groq_model
        if provider == "openai" and settings.openai_api_key:
            return provider, settings.openai_api_key, settings.openai_model
        return "", "", ""

    @staticmethod
    def _provider_base_url(provider: str) -> str:
        if provider == "groq":
            return settings.groq_base_url
        return "https://api.openai.com/v1"

    @staticmethod
    def _safe_json(raw: str) -> Any:
        try:
            return json.loads(raw)
        except Exception:
            return {}

    @staticmethod
    def _get_dataset_context(dataset_id: str, db: Session) -> dict[str, Any]:
        dataset = db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise ValueError("Dataset not found")

        row_count = int(dataset.row_count or 0)
        is_large = row_count > 1_000_000
        sample_size = 1000 if is_large else max(1, min(row_count, 10000))

        sample_data: list[dict[str, Any]] = []
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
