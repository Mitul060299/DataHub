"""Natural-language pipeline editing service.

Takes a plain-English instruction from the user and uses the LLM to produce
a new version of the pipeline steps.  The caller is responsible for
persisting the returned steps back to the database.

Supported operations (inferred from prompt):
  - Add a step
  - Remove a step
  - Modify a step (operation, threshold, column names, …)
  - Reorder steps
  - Any combination of the above

Returns
-------
{"steps": [...], "change_summary": "Added a filter step …"}
or
{"error": "...", "steps": None}   # on LLM/parse failure
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a data pipeline editor assistant.
The user will describe a change they want to make to an existing pipeline in plain English.
You must return ONLY valid JSON — no markdown, no explanation outside the JSON.

The pipeline steps schema is:
[
  {
    "id": "<unique string>",
    "name": "<short human label>",
    "type": "<transform|filter|ai_analysis|aggregate|sort|custom>",
    "config": {
      "operation": "<snake_case_operation_name>",
      "description": "<one-line description of what this step does>",
      ... (additional config keys specific to the operation)
    }
  },
  ...
]

Common operation names for "type": "transform":
  drop_duplicates, trim_string_columns, drop_null_columns, rename_snake_case,
  fill_nulls, cast_column_type, add_calculated_column, normalize_column,
  parse_dates, round_numeric, encode_categorical

Common operation names for "type": "filter":
  filter_rows, deduplicate_by_column, filter_nulls, filter_outliers

Common operation names for "type": "aggregate":
  group_by_sum, group_by_count, group_by_mean, pivot_table, flatten

Common operation names for "type": "sort":
  sort_by_column

Common operation names for "type": "ai_analysis":
  sentiment_analysis, text_classification, anomaly_detection, forecast

Respond with ONLY this JSON structure:
{
  "steps": [ ... updated full step list ... ],
  "change_summary": "< one-sentence summary of the changes made >"
}

Rules:
- Always return the COMPLETE updated list of steps (not just changed ones).
- Preserve existing step IDs when keeping/modifying them.
- Assign NEW unique IDs (e.g. "step-N") to new steps.
- Keep IDs sequential and gap-free after removals.
"""


def nl_edit_pipeline(
    current_steps: list[dict[str, Any]],
    user_prompt: str,
) -> dict[str, Any]:
    """Call the LLM and return {"steps": [...], "change_summary": "..."}.

    On failure returns {"error": "...", "steps": None}.
    """
    provider = settings.llm_provider.lower()
    api_key = settings.groq_api_key if provider == "groq" else ""
    model = settings.groq_model
    base_url = settings.groq_base_url

    if not api_key:
        return {
            "error": "LLM not configured — set GROQ_API_KEY.",
            "steps": None,
        }

    steps_json = json.dumps(current_steps, indent=2)

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Here are the current pipeline steps:\n```json\n{steps_json}\n```\n\n"
                f"User instruction: {user_prompt}\n\n"
                f"Return the updated steps JSON."
            ),
        },
    ]

    try:
        response = httpx.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
            timeout=40.0,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
        parsed = json.loads(raw)
        steps = parsed.get("steps")
        summary = parsed.get("change_summary", "Pipeline updated.")
        if not isinstance(steps, list):
            return {"error": "LLM returned no 'steps' array.", "steps": None}
        return {"steps": steps, "change_summary": summary}
    except httpx.HTTPStatusError as exc:
        logger.warning("nl_edit_pipeline LLM HTTP error: %s", exc)
        return {"error": f"LLM request failed: {exc.response.status_code}", "steps": None}
    except Exception as exc:
        logger.warning("nl_edit_pipeline error: %s", exc)
        return {"error": str(exc), "steps": None}
