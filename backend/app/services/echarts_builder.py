"""
echarts_builder.py — Builds complete ECharts option objects for the DataHub viz engine.

Frontend is a pure renderer: it receives the dict from this module and passes it
directly to echarts-for-react's ReactECharts component with no modification.

Theme:
  Primary accent  #5B6AF0  (brand indigo)
  Text            #E2E8F0  (light, for dark UI)
  Background      transparent
  Animation       500 ms ease-out

Table tiles use a special envelope { __type: "table", columns, rows, conditional }
which the frontend routes to ConditionalTable instead of ReactECharts.
"""

from __future__ import annotations

from typing import Any

# ── DataHub theme constants ───────────────────────────────────────────────────
_PRIMARY = "#5B6AF0"
_ACCENT2 = "#818CF8"
_ACCENT3 = "#A5B4FC"
_PALETTE = [
    "#5B6AF0", "#818CF8", "#A5B4FC",
    "#34D399", "#10B981", "#6EE7B7",
    "#F59E0B", "#FBBF24", "#FCD34D",
    "#F87171", "#EF4444", "#FCA5A5",
]
_TEXT = "#E2E8F0"
_SUBTEXT = "#94A3B8"
_AXIS_LINE = "#2D3748"
_TOOLTIP_BG = "#1E2130"
_GRID_LINE = "#1E293B"
_GREEN = "#34D399"
_RED = "#F87171"
_GREY = "#94A3B8"

_BASE_ANIMATION = {
    "animation": True,
    "animationDuration": 500,
    "animationEasing": "cubicOut",
}

_TOOLBOX = {
    "show": True,
    "right": 12,
    "top": 4,
    "feature": {
        "saveAsImage": {"show": True, "title": "Save PNG", "pixelRatio": 2},
        "dataView": {"show": True, "title": "Data view", "readOnly": True},
    },
    "iconStyle": {"borderColor": _SUBTEXT},
}

_LEGEND_BASE = {
    "type": "scroll",
    "orient": "horizontal",
    "bottom": 0,
    "textStyle": {"color": _TEXT, "fontSize": 12},
    "pageIconColor": _SUBTEXT,
    "pageTextStyle": {"color": _SUBTEXT},
}

_TITLE_STYLE = {"color": _TEXT, "fontSize": 14, "fontWeight": "500"}
_SUBTITLE_STYLE = {"color": _SUBTEXT, "fontSize": 12}

_TOOLTIP_BASE = {
    "trigger": "axis",
    "backgroundColor": _TOOLTIP_BG,
    "borderColor": _AXIS_LINE,
    "borderWidth": 1,
    "textStyle": {"color": _TEXT, "fontSize": 12},
    "axisPointer": {
        "type": "cross",
        "lineStyle": {"color": _AXIS_LINE},
        "crossStyle": {"color": _AXIS_LINE},
    },
}


def _x_axis(categories: list[str], name: str = "") -> dict:
    return {
        "type": "category",
        "data": categories,
        "name": name,
        "nameTextStyle": {"color": _SUBTEXT},
        "axisLabel": {"color": _SUBTEXT, "rotate": 30 if len(categories) > 8 else 0},
        "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
        "splitLine": {"lineStyle": {"color": _GRID_LINE}},
    }


def _value_axis(name: str = "") -> dict:
    return {
        "type": "value",
        "name": name,
        "nameTextStyle": {"color": _SUBTEXT},
        "axisLabel": {"color": _SUBTEXT},
        "axisLine": {"show": False},
        "splitLine": {"lineStyle": {"color": _GRID_LINE}},
    }


def _base(title: str, subtitle: str | None = None) -> dict:
    cfg: dict[str, Any] = {
        "backgroundColor": "transparent",
        "title": {
            "text": title,
            "subtext": subtitle or "",
            "textStyle": _TITLE_STYLE,
            "subtextStyle": _SUBTITLE_STYLE,
            "left": "left",
            "padding": [8, 0],
        },
        "toolbox": _TOOLBOX,
        **_BASE_ANIMATION,
    }
    return cfg


def _extract_series_data(
    rows: list[dict],
    x_col: str,
    y_cols: list[str],
    group_by: str | None,
) -> tuple[list[str], dict[str, list]]:
    """
    Returns (x_labels, {series_name: [values]})
    Handles single y_col, multiple y_cols, and group_by grouping.
    """
    # group_by grouping: pivot on group_by values
    if group_by and len(y_cols) == 1:
        y_col = y_cols[0]
        groups: dict[str, dict[str, Any]] = {}
        x_set: list[str] = []
        x_seen: set[str] = set()
        for row in rows:
            x_val = str(row.get(x_col, ""))
            g_val = str(row.get(group_by, ""))
            y_val = row.get(y_col, 0)
            if x_val not in x_seen:
                x_set.append(x_val)
                x_seen.add(x_val)
            if g_val not in groups:
                groups[g_val] = {}
            groups[g_val][x_val] = y_val

        series_data: dict[str, list] = {}
        for g_val, mapping in groups.items():
            series_data[g_val] = [mapping.get(x, 0) for x in x_set]
        return x_set, series_data

    # Multiple y_cols or single y_col
    x_labels = [str(r.get(x_col, "")) for r in rows]
    series_data = {}
    for y in y_cols:
        series_data[y] = [r.get(y, 0) for r in rows]
    return x_labels, series_data


# ─────────────────────────────────────────────────────────────────────────────
# Public builder
# ─────────────────────────────────────────────────────────────────────────────

def build_echarts_config(
    chart_type: str,
    rows: list[dict[str, Any]],
    x_col: str,
    y_col: str | list[str],
    group_by: str | None = None,
    title: str = "",
    subtitle: str | None = None,
    aggregation: str | None = None,
) -> dict[str, Any]:
    """
    Build a complete ECharts option object.

    For table chart type, returns a special envelope:
        { "__type": "table", "columns": [...], "rows": [[...]], "conditional": [...] }
    which the frontend routes to ConditionalTable.
    """
    y_cols: list[str] = [y_col] if isinstance(y_col, str) else list(y_col)
    ct = chart_type.lower().strip()

    if ct in ("table", "conditional_table"):
        return _build_table(rows, title, subtitle)
    if ct in ("bar", "horizontal_bar"):
        return _build_bar(rows, x_col, y_cols, group_by, title, subtitle, horizontal=(ct == "horizontal_bar"))
    if ct == "line":
        return _build_line(rows, x_col, y_cols, group_by, title, subtitle, area=False)
    if ct == "area":
        return _build_line(rows, x_col, y_cols, group_by, title, subtitle, area=True)
    if ct == "scatter":
        return _build_scatter(rows, x_col, y_cols[0] if y_cols else "", title, subtitle)
    if ct in ("pie", "donut"):
        return _build_pie(rows, x_col, y_cols[0] if y_cols else "", title, subtitle, donut=(ct == "donut"))
    if ct == "heatmap":
        return _build_heatmap(rows, x_col, y_cols[0] if y_cols else "", group_by, title, subtitle)
    if ct == "waterfall":
        return _build_waterfall(rows, x_col, y_cols[0] if y_cols else "", title, subtitle)

    # Fallback to bar
    return _build_bar(rows, x_col, y_cols, group_by, title, subtitle)


# ─────────────────────────────────────────────────────────────────────────────
# Chart builders
# ─────────────────────────────────────────────────────────────────────────────

def _build_bar(
    rows: list[dict],
    x_col: str,
    y_cols: list[str],
    group_by: str | None,
    title: str,
    subtitle: str | None,
    horizontal: bool = False,
) -> dict:
    x_labels, series_data = _extract_series_data(rows, x_col, y_cols, group_by)
    cfg = _base(title, subtitle)
    cfg["legend"] = {**_LEGEND_BASE}
    cfg["tooltip"] = {**_TOOLTIP_BASE}
    cfg["grid"] = {"top": 70, "bottom": 50, "left": 60, "right": 20, "containLabel": True}

    series = []
    for i, (name, data) in enumerate(series_data.items()):
        series.append({
            "name": name,
            "type": "bar",
            "data": data,
            "barMaxWidth": 40,
            "itemStyle": {"color": _PALETTE[i % len(_PALETTE)], "borderRadius": [3, 3, 0, 0]},
            "emphasis": {"itemStyle": {"shadowBlur": 8, "shadowColor": "rgba(0,0,0,0.4)"}},
        })

    if horizontal:
        cfg["xAxis"] = _value_axis(y_cols[0] if y_cols else "")
        cfg["yAxis"] = {**_x_axis(x_labels, x_col), "type": "category"}
        for s in series:
            s["itemStyle"]["borderRadius"] = [0, 3, 3, 0]
    else:
        cfg["xAxis"] = _x_axis(x_labels, x_col)
        cfg["yAxis"] = _value_axis(y_cols[0] if y_cols else "")

    cfg["series"] = series
    return cfg


def _build_line(
    rows: list[dict],
    x_col: str,
    y_cols: list[str],
    group_by: str | None,
    title: str,
    subtitle: str | None,
    area: bool = False,
) -> dict:
    x_labels, series_data = _extract_series_data(rows, x_col, y_cols, group_by)
    cfg = _base(title, subtitle)
    cfg["legend"] = {**_LEGEND_BASE}
    cfg["tooltip"] = {**_TOOLTIP_BASE, "trigger": "axis"}
    cfg["grid"] = {"top": 70, "bottom": 60, "left": 60, "right": 20, "containLabel": True}
    cfg["dataZoom"] = [
        {"type": "inside", "start": 0, "end": 100},
        {"type": "slider", "start": 0, "end": 100, "bottom": 4,
         "fillerColor": "rgba(91,106,240,0.15)", "borderColor": _AXIS_LINE,
         "textStyle": {"color": _SUBTEXT}},
    ]
    cfg["xAxis"] = _x_axis(x_labels, x_col)
    cfg["yAxis"] = _value_axis(y_cols[0] if y_cols else "")

    series = []
    for i, (name, data) in enumerate(series_data.items()):
        color = _PALETTE[i % len(_PALETTE)]
        s: dict[str, Any] = {
            "name": name,
            "type": "line",
            "data": data,
            "smooth": True,
            "symbol": "circle",
            "symbolSize": 5,
            "lineStyle": {"color": color, "width": 2},
            "itemStyle": {"color": color},
        }
        if area:
            s["areaStyle"] = {"color": {"type": "linear", "x": 0, "y": 0, "x2": 0, "y2": 1,
                                         "colorStops": [{"offset": 0, "color": color + "55"},
                                                         {"offset": 1, "color": color + "00"}]}}
        series.append(s)

    cfg["series"] = series
    return cfg


def _build_scatter(
    rows: list[dict],
    x_col: str,
    y_col: str,
    title: str,
    subtitle: str | None,
) -> dict:
    data = [[r.get(x_col, 0), r.get(y_col, 0)] for r in rows]
    cfg = _base(title, subtitle)
    cfg["tooltip"] = {
        "trigger": "item",
        "backgroundColor": _TOOLTIP_BG,
        "borderColor": _AXIS_LINE,
        "textStyle": {"color": _TEXT, "fontSize": 12},
        "formatter": f"({x_col}: {{c0}}, {y_col}: {{c1}})",
    }
    cfg["grid"] = {"top": 70, "bottom": 50, "left": 60, "right": 20, "containLabel": True}
    cfg["xAxis"] = {**_value_axis(x_col), "type": "value"}
    cfg["yAxis"] = _value_axis(y_col)
    cfg["dataZoom"] = [{"type": "inside"}, {"type": "slider", "bottom": 4}]
    cfg["series"] = [{
        "name": title,
        "type": "scatter",
        "data": data,
        "symbolSize": 8,
        "itemStyle": {"color": _PRIMARY, "opacity": 0.75},
        "emphasis": {"itemStyle": {"shadowBlur": 8, "shadowColor": "rgba(91,106,240,0.6)"}},
    }]
    return cfg


def _build_pie(
    rows: list[dict],
    label_col: str,
    value_col: str,
    title: str,
    subtitle: str | None,
    donut: bool = False,
) -> dict:
    data = [{"name": str(r.get(label_col, "")), "value": r.get(value_col, 0)} for r in rows]
    cfg = _base(title, subtitle)
    cfg["tooltip"] = {
        "trigger": "item",
        "backgroundColor": _TOOLTIP_BG,
        "borderColor": _AXIS_LINE,
        "textStyle": {"color": _TEXT, "fontSize": 12},
        "formatter": "{b}: {c} ({d}%)",
    }
    cfg["legend"] = {**_LEGEND_BASE}
    radius = ["40%", "70%"] if donut else "60%"
    cfg["series"] = [{
        "name": title,
        "type": "pie",
        "radius": radius,
        "center": ["50%", "55%"],
        "data": data,
        "color": _PALETTE,
        "label": {"color": _TEXT, "fontSize": 12},
        "labelLine": {"lineStyle": {"color": _SUBTEXT}},
        "itemStyle": {"borderRadius": 4, "borderColor": "transparent", "borderWidth": 2},
        "emphasis": {"itemStyle": {"shadowBlur": 10, "shadowColor": "rgba(0,0,0,0.3)"}},
    }]
    return cfg


def _build_heatmap(
    rows: list[dict],
    x_col: str,
    y_col: str,
    group_by: str | None,
    title: str,
    subtitle: str | None,
) -> dict:
    """
    Heatmap: x = x_col (e.g. month), y = group_by (e.g. account), value = y_col.
    White (0) → deep indigo (#5B6AF0) for positives.
    Negatives use red scale.
    """
    row_col = group_by or x_col
    col_col = x_col

    x_labels = sorted({str(r.get(col_col, "")) for r in rows})
    y_labels = sorted({str(r.get(row_col, "")) for r in rows})

    x_idx = {v: i for i, v in enumerate(x_labels)}
    y_idx = {v: i for i, v in enumerate(y_labels)}

    data = []
    for r in rows:
        xi = x_idx.get(str(r.get(col_col, "")), 0)
        yi = y_idx.get(str(r.get(row_col, "")), 0)
        val = r.get(y_col, 0)
        data.append([xi, yi, val])

    values = [d[2] for d in data if isinstance(d[2], (int, float))]
    min_val = min(values) if values else 0
    max_val = max(values) if values else 1

    cfg = _base(title, subtitle)
    cfg["tooltip"] = {
        "trigger": "item",
        "backgroundColor": _TOOLTIP_BG,
        "borderColor": _AXIS_LINE,
        "textStyle": {"color": _TEXT},
        "formatter": lambda p: f"{x_labels[p.data[0]]} / {y_labels[p.data[1]]}: {p.data[2]}",
    }
    cfg["grid"] = {"top": 70, "bottom": 100, "left": 80, "right": 80, "containLabel": True}

    if min_val < 0:
        cfg["visualMap"] = {
            "min": min_val, "max": max_val,
            "calculable": True,
            "orient": "horizontal",
            "left": "center",
            "bottom": 10,
            "inRange": {"color": ["#EF4444", "#FFFFFF", _PRIMARY]},
            "textStyle": {"color": _TEXT},
        }
    else:
        cfg["visualMap"] = {
            "min": 0, "max": max_val,
            "calculable": True,
            "orient": "horizontal",
            "left": "center",
            "bottom": 10,
            "inRange": {"color": ["#FFFFFF", _PRIMARY]},
            "textStyle": {"color": _TEXT},
        }

    cfg["xAxis"] = {
        "type": "category",
        "data": x_labels,
        "name": col_col,
        "nameTextStyle": {"color": _SUBTEXT},
        "axisLabel": {"color": _SUBTEXT, "rotate": 30},
        "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
        "splitArea": {"show": True},
    }
    cfg["yAxis"] = {
        "type": "category",
        "data": y_labels,
        "name": row_col,
        "nameTextStyle": {"color": _SUBTEXT},
        "axisLabel": {"color": _SUBTEXT},
        "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
        "splitArea": {"show": True},
    }
    cfg["series"] = [{
        "name": title,
        "type": "heatmap",
        "data": data,
        "label": {"show": True, "color": "#1a1a2e", "fontSize": 10},
        "emphasis": {"itemStyle": {"shadowBlur": 10, "shadowColor": "rgba(0,0,0,0.5)"}},
    }]
    return cfg


def _build_waterfall(
    rows: list[dict],
    x_col: str,
    value_col: str,
    title: str,
    subtitle: str | None,
) -> dict:
    """
    ECharts waterfall: stacked bar trick.
    - "placeholder" transparent series holds the cumulative base
    - "positive" series coloured green for positive values
    - "negative" series coloured red for negative values
    - Special "total" category (if label ends in 'total'/'net'/'grand') rendered grey
    """
    labels = [str(r.get(x_col, "")) for r in rows]
    raw_values = [r.get(value_col, 0) for r in rows]

    placeholders: list[Any] = []
    pos_data: list[Any] = []
    neg_data: list[Any] = []

    cumulative = 0.0
    for i, val in enumerate(raw_values):
        val = float(val) if val is not None else 0.0
        label = labels[i].lower()
        is_total = any(k in label for k in ("total", "net", "grand", "subtotal"))

        if is_total:
            placeholders.append(0)
            pos_data.append({"value": cumulative, "itemStyle": {"color": _GREY}})
            neg_data.append("-")
        elif val >= 0:
            placeholders.append(cumulative)
            pos_data.append({"value": val, "itemStyle": {"color": _GREEN}})
            neg_data.append("-")
            cumulative += val
        else:
            placeholders.append(cumulative + val)
            pos_data.append("-")
            neg_data.append({"value": -val, "itemStyle": {"color": _RED}})
            cumulative += val

    cfg = _base(title, subtitle)
    cfg["tooltip"] = {
        "trigger": "axis",
        "backgroundColor": _TOOLTIP_BG,
        "borderColor": _AXIS_LINE,
        "textStyle": {"color": _TEXT, "fontSize": 12},
        "formatter": "function(params){var v=0;params.forEach(function(p){if(p.value!=='-')v+=p.value;});return params[0].name+': '+v.toLocaleString();}",
    }
    cfg["grid"] = {"top": 70, "bottom": 50, "left": 70, "right": 20, "containLabel": True}
    cfg["xAxis"] = _x_axis(labels, x_col)
    cfg["yAxis"] = _value_axis(value_col)
    cfg["series"] = [
        {
            "name": "base",
            "type": "bar",
            "stack": "waterfall",
            "data": placeholders,
            "itemStyle": {"color": "transparent"},
        },
        {
            "name": "increase",
            "type": "bar",
            "stack": "waterfall",
            "data": pos_data,
            "barMaxWidth": 50,
        },
        {
            "name": "decrease",
            "type": "bar",
            "stack": "waterfall",
            "data": neg_data,
            "barMaxWidth": 50,
        },
    ]
    return cfg


def _build_table(
    rows: list[dict],
    title: str,
    subtitle: str | None,
) -> dict:
    """
    Returns special envelope for ConditionalTable frontend component.
    Detects variance and missing-key rows for conditional formatting.
    """
    if not rows:
        return {"__type": "table", "title": title, "subtitle": subtitle,
                "columns": [], "rows": [], "conditional": []}

    columns = list(rows[0].keys())

    # Detect variance column (common names: variance, diff, difference, delta)
    variance_col = next(
        (c for c in columns if c.lower() in ("variance", "diff", "difference", "delta", "var", "gap")),
        None,
    )

    conditional: list[dict] = []
    for i, row in enumerate(rows):
        if variance_col and row.get(variance_col) not in (None, 0, 0.0, "0", ""):
            try:
                if float(str(row[variance_col]).replace(",", "")) != 0:
                    conditional.append({"row": i, "type": "variance", "color": "#EF4444", "bg": "#2D0D0D"})
                    continue
            except (ValueError, TypeError):
                pass
        # Detect missing-key (any None/null value in first two columns)
        if any(row.get(c) is None for c in columns[:2]):
            conditional.append({"row": i, "type": "missing", "color": "#F59E0B", "bg": "#2D1A00"})

    table_rows = [[row.get(c, "") for c in columns] for row in rows]

    return {
        "__type": "table",
        "title": title,
        "subtitle": subtitle,
        "columns": columns,
        "rows": table_rows,
        "row_count": len(rows),
        "conditional": conditional,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Chart type inference
# ─────────────────────────────────────────────────────────────────────────────

def infer_chart_type(
    column_names: list[str],
    column_types: dict[str, str],
    row_count: int,
    intent_context: str = "",
) -> tuple[str, list[str]]:
    """
    Returns (primary_chart_type, list_of_alternatives).

    column_types: {col_name: dtype_string} where dtype is
        one of: 'timestamp'|'date'|'datetime'|'int'|'float'|'double'|
                'varchar'|'text'|'bool'|'object'|...
    """
    ctx = intent_context.lower()
    col_lower = {c.lower(): c for c in column_names}

    _DATE_TYPES = {"timestamp", "date", "datetime", "timestamp with time zone", "timestamptz"}
    _NUM_TYPES = {"int", "integer", "bigint", "smallint", "float", "double", "numeric",
                  "decimal", "real", "float4", "float8", "int4", "int8", "int2"}

    date_cols = [c for c in column_names if column_types.get(c, "").lower() in _DATE_TYPES]
    num_cols = [c for c in column_names if column_types.get(c, "").lower() in _NUM_TYPES]
    cat_cols = [c for c in column_names if c not in date_cols and c not in num_cols]

    # Explicit waterfall request
    if "waterfall" in ctx:
        return "waterfall", ["bar", "table"]

    # Reconciliation → table
    if "reconcil" in ctx:
        return "table", ["bar"]

    # Pivot output with period/month columns → heatmap
    if len(cat_cols) >= 1 and len(num_cols) >= 2 and row_count > 1:
        period_hints = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep",
                        "oct", "nov", "dec", "q1", "q2", "q3", "q4", "2022", "2023",
                        "2024", "2025", "month", "period", "week")
        if any(any(h in c.lower() for h in period_hints) for c in column_names):
            return "heatmap", ["table", "bar"]

    # Date + numeric → line; cumulative context → area
    if date_cols and num_cols:
        if "cumulative" in ctx or "running" in ctx or "trend" in ctx:
            return "area", ["line", "bar"]
        return "line", ["area", "bar"]

    # Part-of-whole context
    if ("proportion" in ctx or "share" in ctx or "breakdown" in ctx or "percent" in ctx
            or "distribution" in ctx or "composition" in ctx):
        if cat_cols and num_cols:
            unique_cats = row_count  # proxy
            if unique_cats < 8:
                return "pie", ["donut", "bar"]
            else:
                return "donut", ["pie", "bar"]

    # Two numeric, no clear category → scatter
    if len(num_cols) >= 2 and len(cat_cols) == 0 and not date_cols:
        return "scatter", ["bar", "table"]

    # Categorical + numeric → bar
    if cat_cols and num_cols:
        return "bar", ["line", "table"]

    # Single numeric → metric / bar fallback
    if num_cols and row_count == 1:
        return "table", ["bar"]

    return "bar", ["table", "line"]
