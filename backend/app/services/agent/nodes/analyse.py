"""analyse node — statistical analysis via DuckDB SQL.

Handles four analysis types without a plan/execute cycle (read-only, instant):
  descriptive  — mean, median, std, percentiles, skewness, kurtosis per column
  correlation  — Pearson or Spearman pairwise correlation matrix
  frequency    — value counts + percentage for a categorical column
  outliers     — IQR-fence outlier detection per numeric column

Each type also auto-generates an appropriate ECharts chart config returned in
``chart_config`` so the frontend renders a chart alongside the text result.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from ...llm_provider import get_chat_model
from ...echarts_builder import (
    build_correlation_heatmap,
    build_box_plot,
    build_echarts_config,
)
from ..model_router import select_model
from ..state import AgentState
from .planner import _dumps
from ...analysis_service import (
    correlation_matrix,
    descriptive_stats,
    frequency_distribution,
    outlier_summary,
)

_logger = logging.getLogger(__name__)

_llm_cache: dict = {}


def _get_llm():
    model = select_model("classify")
    cached = _llm_cache.get(model)
    if cached is None:
        cached = get_chat_model(model=model, temperature=0)
        _llm_cache[model] = cached
    return cached


# ---------------------------------------------------------------------------
# LLM prompt for parsing the user's analysis request
# ---------------------------------------------------------------------------

_PARSE_PROMPT = """\
You are a data analyst assistant. Parse the user's analysis request and return a JSON spec.

DATASET SCHEMA (column → type):
{schema}

NUMERIC COLUMNS: {numeric_cols}
CATEGORICAL COLUMNS: {categorical_cols}

USER REQUEST:
{user_request}

Return ONLY valid JSON (no markdown fences) with exactly these fields:
{{
  "analysis_type": "descriptive" | "correlation" | "frequency" | "outliers",
  "columns": ["col1", "col2", ...],
  "method": "pearson" | "spearman",
  "top_n": 20,
  "reasoning": "one-line explanation"
}}

Rules:
- "descriptive"  → numeric columns only; default to ALL numeric cols (max 12) if unspecified
- "correlation"  → 2+ numeric columns; default to ALL numeric cols (max 8) if unspecified
- "frequency"    → exactly ONE column (prefer categorical); default to first categorical col
- "outliers"     → numeric columns only; default to ALL numeric cols (max 12) if unspecified
- Only include column names that appear in SCHEMA exactly as listed
- "method" and "top_n" are optional; use defaults when not requested
- If the request is ambiguous, default to "descriptive" over all numeric columns\
"""


# ---------------------------------------------------------------------------
# Column classification
# ---------------------------------------------------------------------------

_NUMERIC_TYPE_KEYWORDS = {
    "int", "float", "double", "bigint", "decimal", "numeric",
    "real", "smallint", "tinyint", "hugeint", "ubigint", "uinteger",
}


def _classify_columns(schema: dict) -> tuple[list[str], list[str]]:
    numeric: list[str] = []
    categorical: list[str] = []
    for col, dtype in schema.items():
        if isinstance(dtype, str) and any(kw in dtype.lower() for kw in _NUMERIC_TYPE_KEYWORDS):
            numeric.append(col)
        else:
            categorical.append(col)
    return numeric, categorical


# ---------------------------------------------------------------------------
# Primary table helper (mirrors execute_step._primary_alias_from_state)
# ---------------------------------------------------------------------------

def _primary_table(state: AgentState) -> str:
    registry: dict = state.get("table_registry") or {}
    stored = registry.get("__primary_alias__")
    if isinstance(stored, str) and stored and stored != "dataset":
        return stored
    for name, entry in registry.items():
        if name == "__primary_alias__":
            continue
        if isinstance(entry, dict) and entry.get("pipeline_step_number", -1) == 0 and name != "dataset":
            return name
    return "dataset"


# ---------------------------------------------------------------------------
# Result formatters
# ---------------------------------------------------------------------------

def _fmt_descriptive(rows: list[dict]) -> str:
    if not rows:
        return "No numeric columns could be analysed."
    lines = ["### Descriptive Statistics\n"]
    for r in rows:
        col = r.get("column_name", "?")
        if "error" in r:
            lines.append(f"**{col}**: _{r['error']}_")
            continue
        lines.append(
            f"**{col}** — "
            f"n={r.get('count', '?')}  |  "
            f"mean={r.get('mean', '?')}  |  "
            f"median={r.get('median', '?')}  |  "
            f"std={r.get('stddev', '?')}  |  "
            f"min={r.get('min', '?')}  |  "
            f"max={r.get('max', '?')}  \n"
            f"  P5={r.get('p5', '?')}  |  "
            f"P25={r.get('p25', '?')}  |  "
            f"P75={r.get('p75', '?')}  |  "
            f"P95={r.get('p95', '?')}  |  "
            f"skewness={r.get('skewness', '?')}  |  "
            f"kurtosis={r.get('kurtosis', '?')}"
        )
    return "\n\n".join(lines)


def _strength(corr: Any) -> str:
    if not isinstance(corr, (int, float)):
        return ""
    a = abs(corr)
    if a >= 0.9:
        return " *(very strong)*"
    if a >= 0.7:
        return " *(strong)*"
    if a >= 0.5:
        return " *(moderate)*"
    if a >= 0.3:
        return " *(weak)*"
    return " *(negligible)*"


def _fmt_correlation(rows: list[dict], method: str) -> str:
    if not rows:
        return "No correlations could be computed."
    seen: set[tuple[str, str]] = set()
    lines = [f"### Correlation Matrix ({method.capitalize()})\n"]
    for r in rows:
        c1, c2 = r.get("col1", ""), r.get("col2", "")
        if c1 == c2:
            continue
        key = (min(c1, c2), max(c1, c2))
        if key in seen:
            continue
        seen.add(key)
        corr = r.get("correlation", "?")
        lines.append(f"**{c1}** ↔ **{c2}**: {corr}{_strength(corr)}")
    return "\n\n".join(lines)


def _fmt_frequency(rows: list[dict], column: str) -> str:
    if not rows:
        return f"No data for column `{column}`."
    if "error" in rows[0]:
        return f"Error: {rows[0]['error']}"
    header = f"### Frequency Distribution — `{column}`\n\n| Value | Count | % |\n|-------|------:|--:|"
    body = "\n".join(
        f"| {r.get('value', '')} | {r.get('count', '')} | {r.get('pct', '')}% |"
        for r in rows
    )
    return f"{header}\n{body}"


def _fmt_outliers(rows: list[dict]) -> str:
    if not rows:
        return "No outlier analysis available."
    lines = ["### Outlier Summary (IQR — 1.5× fence)\n"]
    for r in rows:
        col = r.get("column_name", "?")
        if "error" in r:
            lines.append(f"**{col}**: _{r['error']}_")
            continue
        total = r.get("total_outliers", 0)
        pct = r.get("outlier_pct", 0)
        lines.append(
            f"**{col}**: {total} outlier(s) ({pct}% of non-null rows)  \n"
            f"  IQR=[{r.get('q1', '?')}, {r.get('q3', '?')}]  "
            f"fence=[{r.get('lower_bound', '?')}, {r.get('upper_bound', '?')}]  "
            f"below={r.get('below_lower', 0)} / above={r.get('above_upper', 0)}"
        )
    return "\n\n".join(lines)


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------

async def analyse(state: AgentState) -> dict:
    """LangGraph node: parse analysis request, run DuckDB SQL, return results."""
    messages = state.get("messages", [])
    user_request: str = messages[-1].content if messages else ""
    schema: dict = state.get("schema", {})
    session_id: str = state.get("session_id", "")
    table_name: str = _primary_table(state)

    numeric_cols, categorical_cols = _classify_columns(schema)

    # ── 1. LLM: parse the analysis spec ─────────────────────────────────────
    parse_prompt = _PARSE_PROMPT.format(
        schema=_dumps(schema),
        numeric_cols=json.dumps(numeric_cols),
        categorical_cols=json.dumps(categorical_cols),
        user_request=user_request,
    )

    spec: dict[str, Any] = {}
    try:
        llm_response = await asyncio.wait_for(
            _get_llm().ainvoke(
                [
                    SystemMessage(content=parse_prompt),
                    HumanMessage(content=user_request),
                ]
            ),
            timeout=15,
        )
        raw = str(llm_response.content).strip()
        # Strip markdown fences that some models add despite instructions
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1].lstrip("json").strip() if len(parts) > 1 else raw
        spec = json.loads(raw)
    except (asyncio.TimeoutError, json.JSONDecodeError, Exception) as exc:
        _logger.warning("analyse: spec parse failed (%s), defaulting to descriptive", exc)
        spec = {"analysis_type": "descriptive", "columns": numeric_cols[:8]}

    analysis_type: str = spec.get("analysis_type", "descriptive")
    raw_cols: list = spec.get("columns") or []
    columns: list[str] = [c for c in raw_cols if c in schema]
    method: str = spec.get("method", "pearson")
    top_n: int = max(5, min(int(spec.get("top_n") or 20), 50))

    # Fallback: fill missing columns from schema defaults
    if not columns:
        if analysis_type in ("descriptive", "correlation", "outliers"):
            columns = numeric_cols[:8]
        else:
            columns = categorical_cols[:1] or list(schema.keys())[:1]

    # ── 2. Run the analysis via DuckDB ───────────────────────────────────────
    query_results: list[dict] = []
    response_text: str
    chart_type_label: str = "heatmap"

    if not session_id:
        response_text = "No active data session. Please start a chat with a dataset first."

    elif analysis_type == "descriptive":
        if not columns:
            response_text = "No numeric columns found for descriptive statistics."
        else:
            rows = descriptive_stats(session_id, table_name, columns)
            query_results = rows
            response_text = _fmt_descriptive(rows)
            chart_type_label = "boxplot"

    elif analysis_type == "correlation":
        if len(columns) < 2:
            response_text = (
                "Need at least 2 numeric columns to compute a correlation matrix. "
                f"Found: {columns or '(none)'}."
            )
        else:
            rows = correlation_matrix(session_id, table_name, columns, method=method)
            query_results = rows
            response_text = _fmt_correlation(rows, method)
            chart_type_label = "heatmap"

    elif analysis_type == "frequency":
        col = columns[0] if columns else ""
        if not col:
            response_text = "No column available for frequency distribution."
        else:
            rows = frequency_distribution(session_id, table_name, col, top_n=top_n)
            query_results = rows
            response_text = _fmt_frequency(rows, col)
            chart_type_label = "bar"

    elif analysis_type == "outliers":
        if not columns:
            response_text = "No numeric columns found for outlier detection."
        else:
            rows = outlier_summary(session_id, table_name, columns)
            query_results = rows
            response_text = _fmt_outliers(rows)
            chart_type_label = "boxplot"

    else:
        response_text = f"Unknown analysis type: {analysis_type!r}."

    # ── 3. Auto-generate chart config ─────────────────────────────────────
    tile: dict | None = None
    if query_results and session_id:
        try:
            echarts_cfg: dict | None = None
            if analysis_type == "correlation" and len(columns) >= 2:
                echarts_cfg = build_correlation_heatmap(
                    query_results,
                    title=f"Correlation Matrix ({method.capitalize()})",
                )
            elif analysis_type in ("descriptive", "outliers"):
                echarts_cfg = build_box_plot(
                    query_results,
                    title=(
                        "Descriptive Statistics — Distribution"
                        if analysis_type == "descriptive"
                        else "Outlier Detection — IQR Ranges"
                    ),
                )
            elif analysis_type == "frequency" and query_results and "error" not in query_results[0]:
                col_name = columns[0] if columns else "value"
                echarts_cfg = build_echarts_config(
                    "horizontal_bar",
                    query_results,
                    x_col="value",
                    y_col="count",
                    title=f"Frequency Distribution — {col_name}",
                )
            if echarts_cfg:
                tile = {
                    "chart_id": str(uuid.uuid4()),
                    "title": echarts_cfg.get("title", {}).get("text", "Analysis Chart")
                    if isinstance(echarts_cfg.get("title"), dict)
                    else "Analysis Chart",
                    "chart_type": chart_type_label,
                    "echarts_config": echarts_cfg,
                    "saveable": True,
                }
        except Exception as exc:
            _logger.warning("analyse: chart generation failed: %s", exc)

    result: dict[str, Any] = {
        "messages": [AIMessage(content=response_text)],
        "final_response": response_text,
        "query_results": query_results,
    }
    if tile:
        result["chart_config"] = tile
    return result
