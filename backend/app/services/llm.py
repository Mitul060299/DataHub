from __future__ import annotations

import json
from typing import List, Tuple
import pandas as pd

from ..models import TransformationStep
from .agent_heuristics import suggest_steps
from .llm_provider import complete_sync


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


def suggest_steps_llm(df: pd.DataFrame, context_text: str) -> Tuple[List[TransformationStep], List[str]]:
    prompt = _build_payload(df, context_text)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    try:
        content, _, _ = complete_sync(
            messages,
            temperature=0.2,
            json_mode=True,
            timeout=15.0,
            call_type="suggest",
            dataset_rows=int(df.shape[0]),
        )
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
    summary = _dataset_summary(df)
    messages = [
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
    ]
    trimmed_history = history[-6:] if len(history) > 6 else history
    for item in trimmed_history:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    try:
        content, _, _ = complete_sync(
            messages,
            temperature=0.2,
            timeout=20.0,
            call_type="chat",
            dataset_rows=int(df.shape[0]),
        )
        return content, ["LLM-generated response."]
    except Exception:
        return _fallback_chat_response(df, message), ["LLM call failed; used fallback responses."]


def generate_insight_narrative(
    highlights: List[str],
    anomalies: List[str],
    recommendations: List[str],
    context_text: str = "",
) -> str | None:
    payload = {
        "highlights": highlights,
        "anomalies": anomalies,
        "recommendations": recommendations,
        "context": context_text,
    }
    messages = [
        {"role": "system", "content": INSIGHT_SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(payload)},
    ]
    try:
        content, _, _ = complete_sync(
            messages,
            temperature=0.2,
            timeout=15.0,
            call_type="insights",
        )
        return content
    except Exception:
        return None
