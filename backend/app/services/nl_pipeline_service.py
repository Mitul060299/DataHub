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

from .llm_provider import complete_sync

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a data pipeline editor assistant.
The user will describe a change they want to make to an existing pipeline in plain English.
You must return ONLY valid JSON — no markdown, no explanation outside the JSON.

IMPORTANT: When a dataset schema is provided, you MUST use ONLY the exact column names from
that schema. Never guess or invent column names. If the requested column does not exist,
choose the closest matching column name from the schema and note it in the description.

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
  drop_duplicates           — (config: keep="first"|"last")
  trim_string_columns       — strip whitespace from all text columns
  drop_null_columns         — (config: threshold=0.5) drop cols with >50% nulls
  rename_snake_case         — rename all columns to snake_case
  fill_nulls                — (config: column, strategy="mean"|"median"|"mode"|"zero"|"ffill"|"bfill"|"value", value)
  cast_column_type          — (config: column, type="int"|"float"|"str"|"datetime"|"bool")
  add_calculated_column     — (config: output_column, formula e.g. "col_a * col_b")
  normalize_column          — (config: column, method="minmax"|"zscore")
  parse_dates               — auto-detect and parse date columns
  round_numeric             — (config: decimals=2, column optional)
  encode_categorical        — (config: column, method="onehot"|"label")
  resample_timeseries       — (config: freq="D"|"W"|"M", agg="sum"|"mean")
  fuzzy_deduplicate         — (config: column, threshold=90, keep="first")
  normalize_timezone        — (config: date_column, source_tz="UTC", target_tz="UTC")
  generate_id               — (config: output_column="id", strategy="rownum"|"uuid"|"hash", columns=[...])

Common operation names for "type": "filter":
  filter_rows               — (config: column, operator="=="|"!="|">"|">="|"<"|"<="|"contains"|"startswith", value)
  deduplicate_by_column     — (config: column, keep="first")
  filter_nulls              — (config: column) drop rows where column is null
  filter_outliers           — (config: column, threshold=3.0) zscore-based outlier removal

Common operation names for "type": "aggregate":
  group_by_sum              — (config: group_by, agg_column)
  group_by_count            — (config: group_by)
  group_by_mean             — (config: group_by, agg_column)
  pivot_table               — (config: index, values, columns optional, agg="sum")
  detect_date_gaps          — (config: date_column, freq="D", fill_method="ffill"|"bfill")

Common operation names for "type": "sort":
  sort_by_column            — (config: column, ascending=true|false)

Common operation names for "type": "ai_analysis":
  sentiment                 — (config: input_column, output_column)
  keywords                  — (config: input_column, output_column, top_k=5)
  anomaly_detection         — (config: method="zscore", threshold=3.0, output_column)
  validate_rules            — (config: rules=[{column, operator, value}], mode="flag"|"drop"|"report", flag_column)
    Supported rule operators: not_null, >, >=, <, <=, ==, unique, regex, min_length

"type": "custom" — raw DuckDB SQL (use when no built-in operation fits):
  config: {
    "operation": "custom",
    "sql": "SELECT ... FROM {{dataset}}",
    "description": "Plain-English description"
  }
  The placeholder {{dataset}} is replaced with the actual table name at runtime.
  Use actual column names from the schema when writing SQL.

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
- Use ONLY exact column names from the provided schema.
"""


def nl_edit_pipeline(
    current_steps: list[dict[str, Any]],
    user_prompt: str,
    dataset_schema: dict[str, Any] | None = None,
    sample_rows: list[dict[str, Any]] | None = None,
    prior_error: str | None = None,
) -> dict[str, Any]:
    """Call the LLM and return {"steps": [...], "change_summary": "..."}.

    Parameters
    ----------
    current_steps:    The existing pipeline steps to edit.
    user_prompt:      Plain-English instruction from the user.
    dataset_schema:   Mapping of {column_name: dtype_string} for the input dataset.
                      When supplied the LLM is instructed to use only these column names.
    sample_rows:      Up to 3 sample rows (list of dicts) from the dataset.
                      Helps the LLM understand value formats and data shapes.
    prior_error:      If this is a retry, pass the error message from the first attempt
                      so the LLM can self-correct.

    On failure returns {"error": "...", "steps": None}.
    """
    steps_json = json.dumps(current_steps, indent=2)

    # Build the schema context block injected into the user message
    schema_block = ""
    if dataset_schema:
        schema_lines = [f"  {col}: {dtype}" for col, dtype in dataset_schema.items()]
        schema_block = "Dataset columns (use ONLY these exact names):\n" + "\n".join(schema_lines)
        if sample_rows:
            try:
                sample_str = json.dumps(sample_rows[:3], default=str)
                schema_block += f"\n\nSample rows (first 3):\n{sample_str}"
            except Exception:
                pass
        schema_block = f"\n\n{schema_block}\n"

    # When retrying, prepend the error so the LLM can self-correct
    error_block = ""
    if prior_error:
        error_block = (
            f"\n\nNOTE: A previous attempt produced this error — fix it:\n"
            f"  {prior_error}\n"
        )

    user_content = (
        f"Here are the current pipeline steps:\n```json\n{steps_json}\n```\n"
        f"{schema_block}"
        f"{error_block}"
        f"\nUser instruction: {user_prompt}\n\n"
        f"Return the updated steps JSON."
    )

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    try:
        raw, _, _ = complete_sync(
            messages,
            temperature=0.2,
            json_mode=True,
            timeout=40.0,
            call_type="nl_pipeline",
        )
        parsed = json.loads(raw)
        steps = parsed.get("steps")
        summary = parsed.get("change_summary", "Pipeline updated.")
        if not isinstance(steps, list):
            return {"error": "LLM returned no 'steps' array.", "steps": None}
        return {"steps": steps, "change_summary": summary}
    except json.JSONDecodeError:
        return {"error": "LLM returned invalid JSON.", "steps": None}
    except Exception as exc:
        logger.warning("nl_edit_pipeline error: %s", exc)
        return {"error": str(exc), "steps": None}
