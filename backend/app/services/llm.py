from __future__ import annotations

import json
from typing import List, Tuple
import httpx
import pandas as pd

from ..config import settings
from ..models import TransformationStep
from .agent_heuristics import suggest_steps


SYSTEM_PROMPT = """
You are a data cleaning assistant. Return JSON only.
Allowed steps: drop_missing, fill_missing, rename_columns, cast_type, filter_rows.
Each step must include name and params.
""".strip()

CHAT_SYSTEM_PROMPT = """
You are an expert data analyst assistant. Answer questions about the dataset, propose analysis ideas,
and suggest next steps. Be concise, use bullet points for lists, and avoid hallucinations.
If information is not available, say so and propose how to get it.
""".strip()

INSIGHT_SYSTEM_PROMPT = """
You are a data analyst. Given highlights, anomalies, and recommendations, write a concise narrative
summary (3-6 sentences) explaining what matters and what to do next. Avoid speculation.
""".strip()


def _build_payload(df: pd.DataFrame, context_text: str) -> str:
    sample = df.head(20).to_dict(orient="records")
    columns = list(df.columns)
    return json.dumps(
        {
            "columns": columns,
            "sample": sample,
            "context": context_text,
        }
    )


def _parse_steps(raw: str) -> List[TransformationStep]:
    try:
        data = json.loads(raw)
        steps_data = data.get("steps", []) if isinstance(data, dict) else []
        steps = [TransformationStep(**step) for step in steps_data]
        return steps
    except Exception:
        return []


def _provider_config() -> tuple[str, str, str]:
    provider = settings.llm_provider.lower()
    if provider != "groq":
        raise RuntimeError("Unsupported LLM_PROVIDER. Only 'groq' is supported.")
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not configured.")
    return provider, settings.groq_api_key, settings.groq_model


def _provider_base_url(provider: str) -> str:
    if provider != "groq":
        raise RuntimeError("Unsupported LLM provider.")
    return settings.groq_base_url


def suggest_steps_llm(df: pd.DataFrame, context_text: str) -> Tuple[List[TransformationStep], List[str]]:
    try:
        provider, api_key, model = _provider_config()
    except RuntimeError as exc:
        return [], [str(exc)]

    prompt = _build_payload(df, context_text)

    request_body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    try:
        response = httpx.post(
            f"{_provider_base_url(provider)}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=request_body,
            timeout=15.0,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        steps = _parse_steps(content)
        if not steps:
            return suggest_steps(df), ["LLM response was invalid; used fallback suggestions."]
        return steps, ["LLM-generated suggestions."]
    except Exception:
        return suggest_steps(df), ["LLM call failed; used fallback suggestions."]


def _dataset_summary(df: pd.DataFrame) -> dict:
    sample = df.head(5).to_dict(orient="records")
    dtypes = {col: str(dtype) for col, dtype in df.dtypes.items()}
    return {
        "row_count": int(df.shape[0]),
        "column_count": int(df.shape[1]),
        "columns": list(df.columns),
        "dtypes": dtypes,
        "sample": sample,
    }


def _fallback_chat_response(df: pd.DataFrame, message: str) -> str:
    lowered = message.lower()
    if "column" in lowered:
        return "Columns: " + ", ".join(list(df.columns))
    if "row" in lowered or "count" in lowered:
        return f"Row count: {int(df.shape[0])}"
    if "type" in lowered or "dtype" in lowered:
        dtypes = [f"{col}: {dtype}" for col, dtype in df.dtypes.items()]
        return "Column types:\n- " + "\n- ".join(dtypes)
    return (
        "I can help analyze this dataset. Try asking about columns, row counts, missing values, "
        "outliers, distributions, or chart ideas."
    )


def chat_with_dataset(
    df: pd.DataFrame,
    context_text: str,
    message: str,
    history: List[dict],
) -> Tuple[str, List[str]]:
    try:
        provider, api_key, model = _provider_config()
    except RuntimeError as exc:
        return f"Groq configuration error: {str(exc)}", [str(exc)]

    summary = _dataset_summary(df)
    request_body = {
        "model": model,
        "messages": [
            {"role": "system", "content": CHAT_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "context": context_text,
                        "dataset_summary": summary,
                        "instructions": "Use the dataset summary to answer questions.",
                    }
                ),
            },
        ],
        "temperature": 0.2,
    }

    trimmed_history = history[-6:] if len(history) > 6 else history
    for item in trimmed_history:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and content:
            request_body["messages"].append({"role": role, "content": content})
    request_body["messages"].append({"role": "user", "content": message})

    try:
        response = httpx.post(
            f"{_provider_base_url(provider)}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=request_body,
            timeout=20.0,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return content, ["LLM-generated response."]
    except Exception:
        return _fallback_chat_response(df, message), ["LLM call failed; used fallback responses."]


def generate_insight_narrative(
    highlights: List[str],
    anomalies: List[str],
    recommendations: List[str],
    context_text: str = "",
) -> str | None:
    provider, api_key, model = _provider_config()

    payload = {
        "highlights": highlights,
        "anomalies": anomalies,
        "recommendations": recommendations,
        "context": context_text,
    }
    request_body = {
        "model": model,
        "messages": [
            {"role": "system", "content": INSIGHT_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload)},
        ],
        "temperature": 0.2,
    }
    try:
        response = httpx.post(
            f"{_provider_base_url(provider)}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=request_body,
            timeout=15.0,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    except Exception:
        return None
