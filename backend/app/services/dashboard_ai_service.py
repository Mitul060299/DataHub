"""AI-assisted dashboard layout generation.

Converts a natural-language description (or screenshot) into a structured list of
tile specs that are immediately created on the target dashboard.

All LLM calls go through llm_provider.py — no direct SDK imports here.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from ..config import settings
from .llm_provider import complete_sync

_logger = logging.getLogger(__name__)

# ── Tile spec type ─────────────────────────────────────────────────────────────

TileSpec = dict[str, Any]

# ── Layout generation from text description ────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a professional BI dashboard designer.
Given a description of a dashboard, output a structured JSON layout.

Rules:
- tile_type must be one of: "heading" | "text" | "chart" | "metric" | "divider"
- For "chart" tiles:
    chart_type: "bar" | "line" | "area" | "pie" | "scatter"
    query_hint: a plain-English description of what to visualise (e.g. "Monthly revenue by region as a bar chart")
- For "metric" tiles:
    metric_label: the KPI name (e.g. "Total Revenue")
    query_hint: what column/calculation to aggregate
- For "heading" tiles:
    text: the heading text
    level: 1 | 2 | 3
- For "text" tiles:
    text: the body copy
- For "divider" tiles: no extra fields needed
- w: number of grid columns (1–12). Headings/dividers use 12. Metrics use 3. Charts use 6.
- h: height in row units (each unit ≈ 60 px). Dividers=1, headings=2, metrics=3, charts=6.
- title: a short display title shown in the tile header

Aim for 4–10 tiles total. Start with a heading, then KPI metrics, then charts, then a closing text block if needed.
Output ONLY valid JSON in this exact format — no markdown, no explanation:
{"tiles": [{"title": ..., "tile_type": ..., "w": ..., "h": ..., ...extra fields...}]}
"""


def generate_layout(
    description: str,
    dataset_names: list[str],
    user_id: str = "",
) -> list[TileSpec]:
    """Call the text LLM and parse tile specs from the response."""
    datasets_line = (
        ", ".join(dataset_names) if dataset_names else "no specific dataset"
    )
    user_msg = (
        f"Available datasets: {datasets_line}\n\n"
        f"Dashboard description:\n{description}"
    )

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    try:
        raw, _, _ = complete_sync(
            messages,
            temperature=0.3,
            json_mode=True,
            timeout=40.0,
            call_type="dashboard_generate",
            user_id=user_id,
        )
    except Exception as exc:
        _logger.error("dashboard_ai_service.generate_layout LLM error: %s", exc)
        raise RuntimeError(f"LLM call failed: {exc}") from exc

    return _parse_tile_specs(raw)


def layout_from_screenshot(
    image_base64: str,
    dataset_names: list[str],
    user_id: str = "",
) -> list[TileSpec]:
    """Use a vision-capable model to infer the layout from a screenshot.

    Falls back to GPT-4o via OpenAI API when available; raises RuntimeError if
    no vision-capable provider is configured.
    """
    openai_key = settings.openai_api_key
    anthropic_key = getattr(settings, "anthropic_api_key", "")

    if openai_key:
        return _vision_openai(image_base64, dataset_names, openai_key)
    if anthropic_key:
        return _vision_anthropic(image_base64, dataset_names, anthropic_key)
    raise RuntimeError(
        "No vision-capable model configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY."
    )


# ── Vision backends ────────────────────────────────────────────────────────────

def _vision_openai(image_base64: str, dataset_names: list[str], api_key: str) -> list[TileSpec]:
    import httpx

    datasets_line = ", ".join(dataset_names) if dataset_names else "no specific dataset"

    payload: dict[str, Any] = {
        "model": "gpt-4o",
        "response_format": {"type": "json_object"},
        "max_tokens": 2048,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"Available datasets: {datasets_line}\n\n"
                            "Analyse the dashboard screenshot below and reproduce its layout "
                            "as a JSON tile spec. Match the visual hierarchy, chart types, "
                            "and section structure as closely as possible."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_base64}"},
                    },
                ],
            },
        ],
    }

    try:
        resp = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=60,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"]
        return _parse_tile_specs(raw)
    except Exception as exc:
        _logger.error("dashboard_ai_service._vision_openai error: %s", exc)
        raise RuntimeError(f"OpenAI vision call failed: {exc}") from exc


def _vision_anthropic(
    image_base64: str, dataset_names: list[str], api_key: str
) -> list[TileSpec]:
    import httpx

    datasets_line = ", ".join(dataset_names) if dataset_names else "no specific dataset"

    payload: dict[str, Any] = {
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": 2048,
        "system": _SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_base64,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            f"Available datasets: {datasets_line}\n\n"
                            "Analyse this dashboard screenshot and reproduce its layout as JSON tile specs."
                        ),
                    },
                ],
            }
        ],
    }

    try:
        resp = httpx.post(
            "https://api.anthropic.com/v1/messages",
            json=payload,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            timeout=60,
        )
        resp.raise_for_status()
        raw = resp.json()["content"][0]["text"]
        return _parse_tile_specs(raw)
    except Exception as exc:
        _logger.error("dashboard_ai_service._vision_anthropic error: %s", exc)
        raise RuntimeError(f"Anthropic vision call failed: {exc}") from exc


# ── Response parser ────────────────────────────────────────────────────────────

def _parse_tile_specs(raw: str) -> list[TileSpec]:
    """Parse the LLM JSON response into a validated list of tile specs."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        # Try to extract a JSON object from the text
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            try:
                data = json.loads(raw[start:end])
            except Exception:
                _logger.error("dashboard_ai_service: could not parse LLM response: %s", raw[:200])
                raise RuntimeError("LLM returned invalid JSON") from exc
        else:
            raise RuntimeError("LLM returned invalid JSON") from exc

    tiles = data.get("tiles", [])
    if not isinstance(tiles, list):
        raise RuntimeError("LLM JSON missing 'tiles' array")

    validated: list[TileSpec] = []
    valid_types = {"heading", "text", "chart", "metric", "divider"}
    valid_charts = {"bar", "line", "area", "pie", "scatter", "heatmap"}

    for spec in tiles:
        if not isinstance(spec, dict):
            continue
        tile_type = str(spec.get("tile_type", "chart"))
        if tile_type not in valid_types:
            tile_type = "chart"

        # Clamp grid dimensions
        w = max(1, min(12, int(spec.get("w", 6))))
        h = max(1, min(12, int(spec.get("h", 6))))

        out: TileSpec = {
            "title": str(spec.get("title", "Untitled"))[:120],
            "tile_type": tile_type,
            "w": w,
            "h": h,
        }

        if tile_type == "chart":
            ct = str(spec.get("chart_type", "bar")).lower()
            if ct not in valid_charts:
                ct = "bar"
            out["chart_type"] = ct
            out["query_hint"] = str(spec.get("query_hint", ""))[:300]

        elif tile_type == "metric":
            out["metric_label"] = str(spec.get("metric_label", out["title"]))[:80]
            out["query_hint"] = str(spec.get("query_hint", ""))[:300]

        elif tile_type == "heading":
            level = int(spec.get("level", 1))
            out["text"] = str(spec.get("text", out["title"]))[:200]
            out["level"] = max(1, min(3, level))

        elif tile_type == "text":
            out["text"] = str(spec.get("text", ""))[:1000]

        validated.append(out)

    if not validated:
        raise RuntimeError("LLM returned no valid tiles")

    return validated


# ── Static templates ───────────────────────────────────────────────────────────

TEMPLATES: dict[str, list[TileSpec]] = {
    "sales-overview": [
        {"title": "Sales Overview", "tile_type": "heading", "text": "Sales Overview", "level": 1, "w": 12, "h": 2},
        {"title": "Total Revenue", "tile_type": "metric", "metric_label": "Total Revenue", "query_hint": "Sum of revenue or sales amount", "w": 3, "h": 3},
        {"title": "Total Orders", "tile_type": "metric", "metric_label": "Total Orders", "query_hint": "Count of orders or transactions", "w": 3, "h": 3},
        {"title": "Avg Order Value", "tile_type": "metric", "metric_label": "Avg Order Value", "query_hint": "Average transaction value", "w": 3, "h": 3},
        {"title": "Conversion Rate", "tile_type": "metric", "metric_label": "Conversion Rate", "query_hint": "Conversion or success rate percentage", "w": 3, "h": 3},
        {"title": "Revenue Trend", "tile_type": "chart", "chart_type": "line", "query_hint": "Monthly revenue over time", "w": 6, "h": 6},
        {"title": "Top Products", "tile_type": "chart", "chart_type": "bar", "query_hint": "Top 10 products by revenue", "w": 6, "h": 6},
        {"title": "Revenue by Channel", "tile_type": "chart", "chart_type": "pie", "query_hint": "Revenue breakdown by channel or category", "w": 6, "h": 6},
        {"title": "Regional Performance", "tile_type": "chart", "chart_type": "bar", "query_hint": "Sales by region or geography", "w": 6, "h": 6},
    ],
    "executive-report": [
        {"title": "Executive Summary", "tile_type": "heading", "text": "Executive Summary", "level": 1, "w": 12, "h": 2},
        {"title": "Total Revenue", "tile_type": "metric", "metric_label": "Total Revenue", "query_hint": "Total revenue this period", "w": 4, "h": 3},
        {"title": "Profit Margin", "tile_type": "metric", "metric_label": "Profit Margin", "query_hint": "Net profit margin percentage", "w": 4, "h": 3},
        {"title": "YoY Growth", "tile_type": "metric", "metric_label": "YoY Growth", "query_hint": "Year-over-year growth rate", "w": 4, "h": 3},
        {"title": "12-Month Revenue Trend", "tile_type": "chart", "chart_type": "area", "query_hint": "Monthly revenue over the last 12 months", "w": 8, "h": 6},
        {"title": "Dept Performance", "tile_type": "chart", "chart_type": "bar", "query_hint": "Revenue or KPI by department", "w": 4, "h": 6},
        {"title": "", "tile_type": "divider", "w": 12, "h": 1},
        {"title": "Key Findings", "tile_type": "text", "text": "Add executive commentary, key findings, or action items here.", "w": 12, "h": 3},
    ],
    "financial-dashboard": [
        {"title": "Financial Dashboard", "tile_type": "heading", "text": "Financial Dashboard", "level": 1, "w": 12, "h": 2},
        {"title": "Total Revenue", "tile_type": "metric", "metric_label": "Total Revenue", "query_hint": "Sum of revenue", "w": 3, "h": 3},
        {"title": "Net Income", "tile_type": "metric", "metric_label": "Net Income", "query_hint": "Net income or profit", "w": 3, "h": 3},
        {"title": "EBITDA", "tile_type": "metric", "metric_label": "EBITDA", "query_hint": "Earnings before interest taxes depreciation amortization", "w": 3, "h": 3},
        {"title": "Total Expenses", "tile_type": "metric", "metric_label": "Total Expenses", "query_hint": "Sum of all expenses", "w": 3, "h": 3},
        {"title": "P&L Trend", "tile_type": "chart", "chart_type": "line", "query_hint": "Monthly profit and loss over time", "w": 8, "h": 6},
        {"title": "Expense Breakdown", "tile_type": "chart", "chart_type": "pie", "query_hint": "Breakdown of expenses by category", "w": 4, "h": 6},
        {"title": "Revenue vs Expenses", "tile_type": "chart", "chart_type": "bar", "query_hint": "Monthly revenue vs expenses comparison", "w": 6, "h": 6},
        {"title": "Cash Flow", "tile_type": "chart", "chart_type": "area", "query_hint": "Monthly cash flow trend", "w": 6, "h": 6},
    ],
    "product-analytics": [
        {"title": "Product Analytics", "tile_type": "heading", "text": "Product Analytics", "level": 1, "w": 12, "h": 2},
        {"title": "Daily Active Users", "tile_type": "metric", "metric_label": "DAU", "query_hint": "Count of daily active users", "w": 4, "h": 3},
        {"title": "Retention Rate", "tile_type": "metric", "metric_label": "Retention Rate", "query_hint": "User retention or return rate percentage", "w": 4, "h": 3},
        {"title": "NPS Score", "tile_type": "metric", "metric_label": "NPS Score", "query_hint": "Net promoter score or satisfaction rating", "w": 4, "h": 3},
        {"title": "User Growth", "tile_type": "chart", "chart_type": "line", "query_hint": "Daily or weekly user growth over time", "w": 6, "h": 6},
        {"title": "Feature Usage", "tile_type": "chart", "chart_type": "bar", "query_hint": "Top features by usage count or engagement", "w": 6, "h": 6},
        {"title": "User Segments", "tile_type": "chart", "chart_type": "pie", "query_hint": "User breakdown by segment plan or cohort", "w": 6, "h": 6},
        {"title": "Engagement Trend", "tile_type": "chart", "chart_type": "area", "query_hint": "Average session duration or engagement score over time", "w": 6, "h": 6},
    ],
    "marketing-performance": [
        {"title": "Marketing Performance", "tile_type": "heading", "text": "Marketing Performance", "level": 1, "w": 12, "h": 2},
        {"title": "Impressions", "tile_type": "metric", "metric_label": "Impressions", "query_hint": "Total ad or content impressions", "w": 3, "h": 3},
        {"title": "Clicks", "tile_type": "metric", "metric_label": "Clicks", "query_hint": "Total clicks", "w": 3, "h": 3},
        {"title": "Click-Through Rate", "tile_type": "metric", "metric_label": "CTR", "query_hint": "Click-through rate percentage", "w": 3, "h": 3},
        {"title": "ROAS", "tile_type": "metric", "metric_label": "ROAS", "query_hint": "Return on ad spend", "w": 3, "h": 3},
        {"title": "Spend vs Revenue", "tile_type": "chart", "chart_type": "line", "query_hint": "Monthly campaign spend versus revenue generated", "w": 6, "h": 6},
        {"title": "Top Channels", "tile_type": "chart", "chart_type": "bar", "query_hint": "Performance by marketing channel", "w": 6, "h": 6},
        {"title": "Traffic Sources", "tile_type": "chart", "chart_type": "pie", "query_hint": "Traffic breakdown by source organic paid social direct", "w": 6, "h": 6},
        {"title": "Conversion Funnel", "tile_type": "chart", "chart_type": "bar", "query_hint": "Funnel stages impressions clicks leads conversions", "w": 6, "h": 6},
    ],
}

TEMPLATE_META: dict[str, dict[str, str]] = {
    "sales-overview":       {"label": "Sales Overview",       "icon": "📊", "desc": "Revenue, orders, top products & regional breakdown"},
    "executive-report":     {"label": "Executive Report",     "icon": "📋", "desc": "KPIs, trend, department performance & commentary"},
    "financial-dashboard":  {"label": "Financial Dashboard",  "icon": "💰", "desc": "P&L, expense breakdown, cash flow & EBITDA"},
    "product-analytics":    {"label": "Product Analytics",    "icon": "🚀", "desc": "DAU, retention, feature usage & user growth"},
    "marketing-performance":{"label": "Marketing Performance","icon": "📣", "desc": "Campaign metrics, channels, ROAS & funnel"},
}


def get_template_specs(name: str) -> list[TileSpec]:
    """Return a deep copy of tile specs for the named template."""
    if name not in TEMPLATES:
        raise KeyError(f"Unknown template: {name!r}. Available: {list(TEMPLATES)}")
    import copy
    return copy.deepcopy(TEMPLATES[name])


def list_templates() -> list[dict]:
    """Return template metadata for the frontend picker."""
    return [{"id": k, **v} for k, v in TEMPLATE_META.items()]


# ── Auto-arrange layout ────────────────────────────────────────────────────────

_AUTO_ARRANGE_SYSTEM = """\
You are a dashboard layout optimizer.
Given a list of tiles (id, tile_type, title), produce an optimal 12-column grid layout.

Rules:
- Every tile MUST appear exactly once. Do not omit any.
- x + w ≤ 12. x ≥ 0. y ≥ 0.
- heading / divider: w=12. heading h=2, divider h=1.
- metric: w=3, h=3 (group 4 per row).
- chart: w=6, h=6 (2 per row).
- text: w=12, h=3.
- image: w=6, h=5.
- Pack rows densely — minimise wasted vertical space.

Output ONLY valid JSON (no markdown, no explanation):
{"layout": [{"i": "<tile_id>", "x": 0, "y": 0, "w": 6, "h": 6}]}
"""


def auto_arrange_layout(
    tiles: list[dict],
    user_id: str = "",
) -> list[dict]:
    """Ask the LLM to compute an optimal RGL layout for the given tiles."""
    tile_descs = [
        {"id": str(t["id"]), "tile_type": str(t.get("tile_type", "chart")), "title": str(t.get("title", ""))}
        for t in tiles
    ]
    user_msg = "Tiles:\n" + json.dumps(tile_descs, indent=2)

    messages = [
        {"role": "system", "content": _AUTO_ARRANGE_SYSTEM},
        {"role": "user", "content": user_msg},
    ]

    try:
        raw, _, _ = complete_sync(
            messages,
            temperature=0.1,
            json_mode=True,
            timeout=30.0,
            call_type="auto_arrange",
            user_id=user_id,
        )
    except Exception as exc:
        raise RuntimeError(f"LLM call failed: {exc}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start != -1 and end > start:
            data = json.loads(raw[start:end])
        else:
            raise RuntimeError("LLM returned invalid JSON for auto-arrange")

    layout = data.get("layout", [])
    if not isinstance(layout, list):
        raise RuntimeError("auto-arrange response missing 'layout' array")

    tile_ids = {str(t["id"]) for t in tiles}
    seen: set[str] = set()
    validated: list[dict] = []
    for entry in layout:
        if not isinstance(entry, dict):
            continue
        i = str(entry.get("i", ""))
        if i not in tile_ids or i in seen:
            continue
        seen.add(i)
        validated.append({
            "i": i,
            "x": max(0, min(11, int(entry.get("x", 0)))),
            "y": max(0, int(entry.get("y", 0))),
            "w": max(1, min(12, int(entry.get("w", 6)))),
            "h": max(1, min(20, int(entry.get("h", 6)))),
        })

    # Fill in any tiles the LLM omitted
    missing_y = max((e["y"] + e["h"] for e in validated), default=0)
    for t in tiles:
        tid = str(t["id"])
        if tid not in seen:
            validated.append({"i": tid, "x": 0, "y": missing_y, "w": 6, "h": 6})
            missing_y += 6

    return validated
