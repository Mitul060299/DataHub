from __future__ import annotations

import json
from typing import List, Tuple
import httpx
import pandas as pd

from ..config import settings
from ..models import TransformationStep
from .agent_heuristics import suggest_steps
from .token_tracking_service import log_call as _log_call


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
    raw_sample = df.head(20).to_dict(orient="records")
    # Truncate cell values to <= 200 chars to prevent prompt-stuffing via
    # large cells that could carry injected instructions to the LLM.
    sample = [
        {k: (str(v)[:200] if v is not None else v) for k, v in row.items()}
        for row in raw_sample
    ]
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
        _d = response.json()
        content = _d["choices"][0]["message"]["content"]
        _u = _d.get("usage") or {}
        _log_call(user_id="", model_used=model, query_type="suggest",
                  input_tokens=_u.get("prompt_tokens", 0),
                  output_tokens=_u.get("completion_tokens", 0),
                  dataset_rows=int(df.shape[0]))
        steps = _parse_steps(content)
        if not steps:
            return suggest_steps(df), ["LLM response was invalid; used fallback suggestions."]
        return steps, ["LLM-generated suggestions."]
    except Exception:
        _log_call(user_id="", model_used=model, query_type="suggest",
                  input_tokens=0, output_tokens=0)
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
        _d2 = response.json()
        content = _d2["choices"][0]["message"]["content"]
        _u2 = _d2.get("usage") or {}
        _log_call(user_id="", model_used=model, query_type="chat",
                  input_tokens=_u2.get("prompt_tokens", 0),
                  output_tokens=_u2.get("completion_tokens", 0),
                  dataset_rows=int(df.shape[0]))
        return content, ["LLM-generated response."]
    except Exception:
        _log_call(user_id="", model_used=model, query_type="chat",
                  input_tokens=0, output_tokens=0)
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
        _d3 = response.json()
        _u3 = _d3.get("usage") or {}
        _log_call(user_id="", model_used=model, query_type="insights",
                  input_tokens=_u3.get("prompt_tokens", 0),
                  output_tokens=_u3.get("completion_tokens", 0))
        return _d3["choices"][0]["message"]["content"]
    except Exception:
        return None
