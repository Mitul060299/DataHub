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
    if ct == "funnel":
        return _build_funnel(rows, x_col, y_cols[0] if y_cols else "", title, subtitle)
    if ct == "gauge":
        return _build_gauge(rows, y_cols[0] if y_cols else "", title, subtitle)
    if ct == "treemap":
        return _build_treemap(rows, x_col, y_cols[0] if y_cols else "", title, subtitle)
    if ct == "radar":
        return _build_radar(rows, x_col, y_cols, title, subtitle)
    if ct in ("dual_axis", "dual-axis", "combo"):
        return _build_dual_axis(rows, x_col, y_cols, title, subtitle)

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
    # Access by declared col names first; fall back to "name"/"value" aliases
    # (produced by visualization.py) then positional — guards against SQL alias
    # mismatches where the LLM-generated query renames columns.
    def _get_name(r: dict) -> str:
        v = r.get(label_col) if label_col else None
        if v is None:
            v = r.get("name")
        if v is None and r:
            v = next(iter(r.values()))
        return str(v) if v is not None else ""

    def _get_value(r: dict) -> float | int:
        v = r.get(value_col) if value_col else None
        if v is None:
            v = r.get("value")
        if v is None and len(r) >= 2:
            v = list(r.values())[1]
        return v if isinstance(v, (int, float)) else 0

    data = [{"name": _get_name(r), "value": _get_value(r)} for r in rows]
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
        "label": {"show": True, "color": _TEXT, "fontSize": 12},
        "labelLine": {"show": True, "lineStyle": {"color": _SUBTEXT}},
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
# Analysis-specific chart builders
# ─────────────────────────────────────────────────────────────────────────────

def build_correlation_heatmap(
    corr_rows: list[dict[str, Any]],
    title: str = "Correlation Matrix",
) -> dict[str, Any]:
    """Build a symmetric N×N correlation heatmap from correlation_matrix() output.

    corr_rows: list of {col1, col2, correlation} dicts (includes diagonal + both
    (A,B) and (B,A) entries as returned by analysis_service.correlation_matrix).

    Color scale: red (−1) → white (0) → indigo (+1).
    """
    # Collect ordered column list, preserving first-seen order
    seen: set[str] = set()
    cols: list[str] = []
    for r in corr_rows:
        for k in ("col1", "col2"):
            c = str(r.get(k, ""))
            if c and c not in seen:
                seen.add(c)
                cols.append(c)
    if not cols:
        return _base(title)

    col_idx = {c: i for i, c in enumerate(cols)}
    n = len(cols)

    # Build [xi, yi, val] triples; y is reversed so the matrix reads
    # top-left → bottom-right (col[0] diagonal at top-left).
    data: list[list[Any]] = []
    for r in corr_rows:
        c1, c2 = str(r.get("col1", "")), str(r.get("col2", ""))
        if c1 not in col_idx or c2 not in col_idx:
            continue
        val = r.get("correlation")
        if val is None:
            continue
        xi = col_idx[c1]
        yi = n - 1 - col_idx[c2]   # reversed y so (0,0) is top-left
        data.append([xi, yi, round(float(val), 4)])

    cfg = _base(title)
    cfg["tooltip"] = {
        "trigger": "item",
        "backgroundColor": _TOOLTIP_BG,
        "borderColor": _AXIS_LINE,
        "textStyle": {"color": _TEXT, "fontSize": 12},
    }
    cfg["grid"] = {"top": 60, "bottom": 90, "left": 100, "right": 100, "containLabel": True}
    cfg["xAxis"] = {
        "type": "category",
        "data": cols,
        "axisLabel": {
            "color": _SUBTEXT,
            "rotate": 35 if n > 4 else 0,
            "interval": 0,
        },
        "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
        "splitArea": {"show": True, "areaStyle": {"color": ["rgba(255,255,255,0.02)", "transparent"]}},
    }
    cfg["yAxis"] = {
        "type": "category",
        "data": list(reversed(cols)),
        "axisLabel": {"color": _SUBTEXT, "interval": 0},
        "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
        "splitArea": {"show": True, "areaStyle": {"color": ["rgba(255,255,255,0.02)", "transparent"]}},
    }
    cfg["visualMap"] = {
        "min": -1,
        "max": 1,
        "calculable": True,
        "orient": "horizontal",
        "left": "center",
        "bottom": 10,
        "inRange": {"color": [_RED, "#FFFFFF", _PRIMARY]},
        "textStyle": {"color": _TEXT},
        "precision": 2,
    }
    cfg["series"] = [{
        "type": "heatmap",
        "data": data,
        "label": {
            "show": True,
            "fontSize": 10 if n <= 8 else 8,
            "color": "#1A202C",
            "formatter": "{c}",
        },
        "emphasis": {"itemStyle": {"shadowBlur": 8, "shadowColor": "rgba(0,0,0,0.3)"}},
    }]
    cfg.update(_BASE_ANIMATION)
    return cfg


def build_box_plot(
    desc_rows: list[dict[str, Any]],
    title: str = "Distribution (Box Plot)",
) -> dict[str, Any]:
    """Build a box plot from descriptive_stats() output.

    Each column becomes one box: whiskers at P5/P95, box at P25/P75, line at median.
    Columns with errors are skipped.
    """
    clean = [r for r in desc_rows if "error" not in r and r.get("column_name")]
    if not clean:
        return _base(title)

    cols = [r["column_name"] for r in clean]
    # ECharts boxplot data item: [lower_whisker, Q1, median, Q3, upper_whisker]
    box_data = [
        [r.get("p5"), r.get("p25"), r.get("median"), r.get("p75"), r.get("p95")]
        for r in clean
    ]

    cfg = _base(title)
    cfg["tooltip"] = {
        "trigger": "item",
        "backgroundColor": _TOOLTIP_BG,
        "borderColor": _AXIS_LINE,
        "textStyle": {"color": _TEXT, "fontSize": 12},
    }
    cfg["grid"] = {"top": 70, "bottom": 50, "left": 60, "right": 20, "containLabel": True}
    cfg["xAxis"] = {
        "type": "category",
        "data": cols,
        "boundaryGap": True,
        "axisLabel": {"color": _SUBTEXT, "rotate": 30 if len(cols) > 4 else 0},
        "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
    }
    cfg["yAxis"] = {
        "type": "value",
        "axisLabel": {"color": _SUBTEXT},
        "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
        "splitLine": {"lineStyle": {"color": _GRID_LINE}},
    }
    cfg["series"] = [{
        "name": "Distribution",
        "type": "boxplot",
        "data": box_data,
        "itemStyle": {"color": _ACCENT2, "borderColor": _PRIMARY, "borderWidth": 2},
        "emphasis": {"itemStyle": {"borderColor": _PRIMARY, "shadowBlur": 8, "shadowColor": "rgba(91,106,240,0.4)"}},
    }]
    cfg.update(_BASE_ANIMATION)
    return cfg


def build_regression_chart(
    points: list[dict[str, Any]],
    x_col: str,
    y_col: str,
    r2: float | None = None,
    title: str = "Linear Regression",
) -> dict[str, Any]:
    """Scatter chart (actual data) + regression line overlay.

    ``points`` should be the ``points`` list from ``prediction_service.linear_regression``,
    each item containing ``x_col``, ``y_col``, and ``predicted`` keys.
    """
    actual: list[list[Any]] = []
    fitted: list[list[Any]] = []
    for r in points:
        x = r.get(x_col)
        y = r.get(y_col)
        pred = r.get("predicted")
        if x is not None and y is not None:
            actual.append([x, y])
        if x is not None and pred is not None:
            fitted.append([x, pred])

    r2_label = f"  (R² = {r2:.3f})" if r2 is not None else ""
    subtitle = f"Fitted line vs actual values{r2_label}"

    cfg = _base(title, subtitle)
    cfg["tooltip"] = {
        "trigger": "item",
        "backgroundColor": _TOOLTIP_BG,
        "borderColor": _AXIS_LINE,
        "textStyle": {"color": _TEXT, "fontSize": 12},
    }
    cfg["legend"] = {
        "data": ["Actual", "Fitted"],
        "textStyle": {"color": _TEXT},
        "top": 42,
    }
    cfg["grid"] = {"top": 80, "bottom": 50, "left": 60, "right": 20, "containLabel": True}
    cfg["xAxis"] = {
        "type": "value",
        "name": x_col,
        "nameTextStyle": {"color": _SUBTEXT},
        "axisLabel": {"color": _SUBTEXT},
        "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
        "splitLine": {"lineStyle": {"color": _GRID_LINE}},
    }
    cfg["yAxis"] = {
        "type": "value",
        "name": y_col,
        "nameTextStyle": {"color": _SUBTEXT},
        "axisLabel": {"color": _SUBTEXT},
        "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
        "splitLine": {"lineStyle": {"color": _GRID_LINE}},
    }
    cfg["series"] = [
        {
            "name": "Actual",
            "type": "scatter",
            "data": actual,
            "symbolSize": 6,
            "itemStyle": {"color": _ACCENT2, "opacity": 0.7},
        },
        {
            "name": "Fitted",
            "type": "line",
            "data": sorted(fitted, key=lambda p: p[0]),
            "smooth": False,
            "showSymbol": False,
            "lineStyle": {"color": _PRIMARY, "width": 2},
        },
    ]
    cfg.update(_BASE_ANIMATION)
    return cfg


def build_forecast_chart(
    rows: list[dict[str, Any]],
    x_col: str,
    actual_col: str,
    predicted_col: str = "predicted",
    title: str = "Forecast",
) -> dict[str, Any]:
    """Dual-line chart: actual values + trend/forecast overlay.

    Works for both moving-average rows ({x_col, actual_col, moving_avg})
    and forecast rows ({x_col, actual_col, predicted, is_forecast}).

    Forecast rows (is_forecast=True) are rendered with a dashed line so the
    projected zone is visually distinct.
    """
    x_labels: list[str] = [str(r.get(x_col, "")) for r in rows]
    actual_data: list[Any] = [r.get(actual_col) for r in rows]
    pred_data: list[Any] = [r.get(predicted_col) for r in rows]

    # Check if any rows are flagged as forecast
    has_forecast = any(r.get("is_forecast") for r in rows)
    pred_label = "Forecast" if has_forecast else "Trend (MA)"

    cfg = _base(title)
    cfg["tooltip"] = {
        "trigger": "axis",
        "backgroundColor": _TOOLTIP_BG,
        "borderColor": _AXIS_LINE,
        "textStyle": {"color": _TEXT, "fontSize": 12},
    }
    cfg["legend"] = {
        "data": ["Actual", pred_label],
        "textStyle": {"color": _TEXT},
        "top": 35,
    }
    cfg["grid"] = {"top": 75, "bottom": 50, "left": 60, "right": 20, "containLabel": True}
    cfg["xAxis"] = {
        "type": "category",
        "data": x_labels,
        "boundaryGap": False,
        "axisLabel": {
            "color": _SUBTEXT,
            "rotate": 30 if len(x_labels) > 10 else 0,
            "interval": max(0, len(x_labels) // 12 - 1),
        },
        "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
    }
    cfg["yAxis"] = {
        "type": "value",
        "axisLabel": {"color": _SUBTEXT},
        "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
        "splitLine": {"lineStyle": {"color": _GRID_LINE}},
    }
    cfg["series"] = [
        {
            "name": "Actual",
            "type": "line",
            "data": actual_data,
            "smooth": False,
            "showSymbol": False,
            "lineStyle": {"color": _ACCENT2, "width": 2},
            "areaStyle": {"color": "rgba(129,140,248,0.08)"},
            "connectNulls": False,
        },
        {
            "name": pred_label,
            "type": "line",
            "data": pred_data,
            "smooth": True,
            "showSymbol": False,
            "lineStyle": {
                "color": _PRIMARY,
                "width": 2,
                "type": "dashed" if has_forecast else "solid",
            },
            "connectNulls": True,
        },
    ]
    cfg.update(_BASE_ANIMATION)
    return cfg


# ─────────────────────────────────────────────────────────────────────────────
# Advanced chart builders
# ─────────────────────────────────────────────────────────────────────────────

def _build_funnel(
    rows: list[dict],
    label_col: str,
    value_col: str,
    title: str,
    subtitle: str | None,
) -> dict:
    """Funnel/pipeline chart — sorted descending by value."""
    data = []
    for r in rows:
        name = str(r.get(label_col, ""))
        raw = r.get(value_col, 0)
        try:
            value = float(raw) if raw is not None else 0.0
        except (ValueError, TypeError):
            value = 0.0
        data.append({"name": name, "value": value})
    data.sort(key=lambda d: d["value"], reverse=True)

    max_val = max((d["value"] for d in data), default=100)
    cfg = _base(title, subtitle)
    cfg["tooltip"] = {
        "trigger": "item",
        "formatter": "{b}: {c} ({d}%)",
        "backgroundColor": _TOOLTIP_BG,
        "borderColor": _AXIS_LINE,
        "textStyle": {"color": _TEXT, "fontSize": 12},
    }
    cfg["legend"] = {**_LEGEND_BASE}
    cfg["series"] = [{
        "name": title,
        "type": "funnel",
        "left": "10%",
        "top": 60,
        "bottom": 30,
        "width": "80%",
        "min": 0,
        "max": max_val,
        "minSize": "0%",
        "maxSize": "100%",
        "sort": "descending",
        "gap": 2,
        "label": {
            "show": True,
            "position": "inside",
            "color": "#fff",
            "fontSize": 12,
            "fontWeight": 600,
            "formatter": "{b}: {c}",
        },
        "labelLine": {"length": 10, "lineStyle": {"width": 1, "type": "solid"}},
        "itemStyle": {"borderWidth": 0},
        "emphasis": {
            "label": {"fontSize": 13, "fontWeight": "bold"},
            "itemStyle": {"shadowBlur": 8, "shadowColor": "rgba(0,0,0,0.3)"},
        },
        "data": [{"name": d["name"], "value": d["value"], "itemStyle": {"color": _PALETTE[i % len(_PALETTE)]}}
                 for i, d in enumerate(data)],
    }]
    cfg.update(_BASE_ANIMATION)
    return cfg


def _build_gauge(
    rows: list[dict],
    value_col: str,
    title: str,
    subtitle: str | None,
    min_val: float = 0,
    max_val: float | None = None,
) -> dict:
    """Single KPI gauge/dial — uses the first row's value_col."""
    raw = rows[0].get(value_col, 0) if rows else 0
    try:
        value = float(raw) if raw is not None else 0.0
    except (ValueError, TypeError):
        value = 0.0

    # Label from first non-value column in the row, or title
    label = title
    if rows and len(rows[0]) > 1:
        for k, v in rows[0].items():
            if k != value_col and v is not None:
                label = str(v)
                break

    # Auto-scale max
    if max_val is None:
        if value <= 1.0:
            max_val = 1.0
        elif value <= 100:
            max_val = 100.0
        else:
            magnitude = 10 ** (len(str(int(abs(value)))) - 1)
            max_val = (int(value * 1.5 / magnitude) + 1) * magnitude

    pct = max(0.0, min(1.0, (value - min_val) / (max_val - min_val))) if max_val != min_val else 0.0
    color = _GREEN if pct >= 0.7 else _ACCENT2 if pct >= 0.4 else _RED

    cfg = _base(title, subtitle)
    cfg["series"] = [{
        "name": title,
        "type": "gauge",
        "min": min_val,
        "max": max_val,
        "splitNumber": 5,
        "radius": "75%",
        "center": ["50%", "60%"],
        "axisLine": {
            "lineStyle": {
                "width": 14,
                "color": [[pct, color], [1, _AXIS_LINE]],
            }
        },
        "pointer": {"itemStyle": {"color": color}, "length": "65%"},
        "axisTick": {"distance": -14, "length": 6, "lineStyle": {"color": "#fff", "width": 1}},
        "splitLine": {"distance": -18, "length": 14, "lineStyle": {"color": "#fff", "width": 2}},
        "axisLabel": {"color": _SUBTEXT, "distance": 18, "fontSize": 10},
        "detail": {
            "valueAnimation": True,
            "formatter": "{value}",
            "color": _TEXT,
            "fontSize": 24,
            "fontWeight": "bold",
            "offsetCenter": [0, "75%"],
        },
        "title": {"color": _SUBTEXT, "fontSize": 12, "offsetCenter": [0, "92%"]},
        "data": [{"value": round(value, 2), "name": label}],
    }]
    cfg.update(_BASE_ANIMATION)
    return cfg


def _build_treemap(
    rows: list[dict],
    label_col: str,
    value_col: str,
    title: str,
    subtitle: str | None,
) -> dict:
    """Proportional-area treemap."""
    data = []
    for r in rows:
        name = str(r.get(label_col, ""))
        raw = r.get(value_col, 0)
        try:
            value = abs(float(raw)) if raw is not None else 0.0
        except (ValueError, TypeError):
            value = 0.0
        if name and value > 0:
            data.append({"name": name, "value": value})

    cfg = _base(title, subtitle)
    cfg["tooltip"] = {
        "trigger": "item",
        "backgroundColor": _TOOLTIP_BG,
        "borderColor": _AXIS_LINE,
        "textStyle": {"color": _TEXT, "fontSize": 12},
        "formatter": "{b}: {c}",
    }
    cfg["series"] = [{
        "name": title,
        "type": "treemap",
        "top": 50,
        "left": 0,
        "right": 0,
        "bottom": 0,
        "visibleMin": 0,
        "label": {
            "show": True,
            "formatter": "{b}\n{c}",
            "color": "#fff",
            "fontSize": 12,
        },
        "upperLabel": {
            "show": True,
            "height": 28,
            "color": "#fff",
            "fontSize": 12,
            "fontWeight": 600,
            "borderColor": "#1E293B",
            "borderWidth": 1,
        },
        "itemStyle": {
            "borderWidth": 1,
            "borderColor": "#0f1117",
            "gapWidth": 2,
            "borderColorSaturation": 0.7,
        },
        "breadcrumb": {"show": False},
        "levels": [{
            "itemStyle": {"borderColor": "#1E293B", "borderWidth": 2, "gapWidth": 2},
            "upperLabel": {"show": False},
        }],
        "data": [
            {**d, "itemStyle": {"color": _PALETTE[i % len(_PALETTE)]}}
            for i, d in enumerate(data)
        ],
    }]
    cfg.update(_BASE_ANIMATION)
    return cfg


def _build_radar(
    rows: list[dict],
    x_col: str,
    y_cols: list[str],
    title: str,
    subtitle: str | None,
) -> dict:
    """Radar/spider chart.

    If y_cols has ≥3 entries: each y_col is one radar axis; each row is one series entity.
    Otherwise: x_col = dimension name per row, y_cols[0] = metric.
    """
    if not y_cols:
        return _build_bar(rows, x_col, [], None, title, subtitle)

    cfg = _base(title, subtitle)
    cfg["tooltip"] = {
        "trigger": "item",
        "backgroundColor": _TOOLTIP_BG,
        "borderColor": _AXIS_LINE,
        "textStyle": {"color": _TEXT, "fontSize": 12},
    }

    if len(y_cols) >= 3:
        # Multi-series mode: each y_col becomes a radar axis; each row is a series entity
        max_per_col: dict[str, float] = {}
        for y in y_cols:
            vals = [float(r.get(y, 0)) for r in rows if r.get(y) is not None]
            max_per_col[y] = max(vals) if vals else 1.0

        cfg["legend"] = {**_LEGEND_BASE}
        cfg["radar"] = {
            "indicator": [{"name": y, "max": max_per_col[y]} for y in y_cols],
            "axisName": {"color": _SUBTEXT, "fontSize": 11},
            "splitLine": {"lineStyle": {"color": _AXIS_LINE}},
            "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
            "splitArea": {"areaStyle": {"color": ["rgba(91,106,240,0.02)", "rgba(91,106,240,0.05)"]}},
        }
        series_data = []
        for i, r in enumerate(rows):
            name = str(r.get(x_col, f"Series {i+1}"))
            vals = [float(r.get(y, 0)) for y in y_cols]
            color = _PALETTE[i % len(_PALETTE)]
            series_data.append({
                "name": name,
                "value": vals,
                "areaStyle": {"color": color + "33"},
                "lineStyle": {"color": color, "width": 2},
                "itemStyle": {"color": color},
            })
        cfg["series"] = [{"type": "radar", "data": series_data}]
    else:
        # Single y_col mode: x_col = indicator name, y_col = value
        y_col = y_cols[0]
        indicators = [str(r.get(x_col, "")) for r in rows]
        vals = [float(r.get(y_col, 0)) for r in rows]
        max_val = max(vals) if vals else 1.0

        cfg["radar"] = {
            "indicator": [{"name": ind, "max": max_val} for ind in indicators],
            "axisName": {"color": _SUBTEXT, "fontSize": 11},
            "splitLine": {"lineStyle": {"color": _AXIS_LINE}},
            "axisLine": {"lineStyle": {"color": _AXIS_LINE}},
            "splitArea": {"areaStyle": {"color": ["rgba(91,106,240,0.02)", "rgba(91,106,240,0.05)"]}},
        }
        cfg["series"] = [{
            "type": "radar",
            "data": [{
                "name": title,
                "value": vals,
                "areaStyle": {"color": _PRIMARY + "33"},
                "lineStyle": {"color": _PRIMARY, "width": 2},
                "itemStyle": {"color": _PRIMARY},
            }],
        }]

    cfg.update(_BASE_ANIMATION)
    return cfg


def _build_dual_axis(
    rows: list[dict],
    x_col: str,
    y_cols: list[str],
    title: str,
    subtitle: str | None,
) -> dict:
    """Dual y-axis combo: first y_col as bar (left axis), remaining y_cols as lines (right axis)."""
    if len(y_cols) < 2:
        return _build_bar(rows, x_col, y_cols, None, title, subtitle)

    x_labels = [str(r.get(x_col, "")) for r in rows]
    cfg = _base(title, subtitle)
    cfg["legend"] = {**_LEGEND_BASE}
    cfg["tooltip"] = {**_TOOLTIP_BASE, "trigger": "axis"}
    cfg["grid"] = {"top": 70, "bottom": 60, "left": 70, "right": 70, "containLabel": True}
    cfg["xAxis"] = _x_axis(x_labels, x_col)
    cfg["yAxis"] = [
        {**_value_axis(y_cols[0])},
        {**_value_axis(y_cols[1]), "splitLine": {"show": False}},
    ]

    series = []
    for i, y in enumerate(y_cols):
        data = [r.get(y, 0) for r in rows]
        color = _PALETTE[i % len(_PALETTE)]
        if i == 0:
            series.append({
                "name": y,
                "type": "bar",
                "yAxisIndex": 0,
                "data": data,
                "barMaxWidth": 40,
                "itemStyle": {"color": color, "borderRadius": [3, 3, 0, 0]},
                "emphasis": {"itemStyle": {"shadowBlur": 8, "shadowColor": "rgba(0,0,0,0.4)"}},
            })
        else:
            series.append({
                "name": y,
                "type": "line",
                "yAxisIndex": 1,
                "data": data,
                "smooth": True,
                "symbol": "circle",
                "symbolSize": 6,
                "lineStyle": {"color": color, "width": 2},
                "itemStyle": {"color": color},
            })

    cfg["series"] = series
    cfg.update(_BASE_ANIMATION)
    return cfg


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

    # Funnel / pipeline / conversion
    if any(k in ctx for k in ("funnel", "pipeline", "conversion", "stage", "dropout", "drop-off", "dropoff", "drop off")):
        return "funnel", ["bar", "pie"]

    # Gauge / single KPI dial
    if any(k in ctx for k in ("gauge", "dial", "meter", "speedometer")):
        return "gauge", ["metric", "bar"]
    if row_count == 1 and len(num_cols) == 1 and any(k in ctx for k in ("kpi", "target", "rate", "ratio", "score", "progress")):
        return "gauge", ["metric", "table"]

    # Treemap / hierarchy
    if any(k in ctx for k in ("treemap", "tree map", "hierarchical", "nested", "breakdown by size")):
        return "treemap", ["bar", "pie"]

    # Radar / spider / multi-dimensional comparison
    if any(k in ctx for k in ("radar", "spider", "spider web", "radial comparison", "multi-dimensional")):
        if len(num_cols) >= 2:
            return "radar", ["bar", "table"]

    # Dual-axis / combo chart
    if any(k in ctx for k in ("dual axis", "dual-axis", "secondary axis", "twin axis", "two axis", "combo", "bar and line")):
        if len(num_cols) >= 2:
            return "dual_axis", ["bar", "line"]

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
