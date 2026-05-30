/**
 * echartsBuilder.ts — client-side ECharts option builder.
 *
 * Mirrors the core of backend/app/services/echarts_builder.py so dashboard
 * tiles can be refreshed entirely in-browser (Phase S2 DuckDB-WASM).
 *
 * Only implements chart types that the AI generates for dashboard tiles:
 * bar, line, pie, scatter.  Other types fall back gracefully.
 */

// ── Theme constants (matching the Python backend) ────────────────────────────
const _PRIMARY = "#5B6AF0";
const _PALETTE = [
  "#5B6AF0", "#818CF8", "#A5B4FC",
  "#34D399", "#10B981", "#6EE7B7",
  "#F59E0B", "#FBBF24", "#FCD34D",
  "#F87171", "#EF4444", "#FCA5A5",
];
const _TEXT = "#E2E8F0";
const _SUBTEXT = "#94A3B8";
const _AXIS_LINE = "#2D3748";
const _TOOLTIP_BG = "#1E2130";
const _GRID_LINE = "#1E293B";

function _xAxis(categories: string[], name = "") {
  return {
    type: "category" as const,
    data: categories,
    name,
    nameTextStyle: { color: _SUBTEXT },
    axisLabel: { color: _SUBTEXT, rotate: categories.length > 8 ? 30 : 0 },
    axisLine: { lineStyle: { color: _AXIS_LINE } },
    splitLine: { lineStyle: { color: _GRID_LINE } },
  };
}

function _valueAxis(name = "") {
  return {
    type: "value" as const,
    name,
    nameTextStyle: { color: _SUBTEXT },
    axisLabel: { color: _SUBTEXT },
    axisLine: { show: false },
    splitLine: { lineStyle: { color: _GRID_LINE } },
  };
}

function _tooltip() {
  return {
    trigger: "axis",
    backgroundColor: _TOOLTIP_BG,
    borderColor: _AXIS_LINE,
    borderWidth: 1,
    textStyle: { color: _TEXT, fontSize: 12 },
    axisPointer: {
      type: "cross",
      lineStyle: { color: _AXIS_LINE },
      crossStyle: { color: _AXIS_LINE },
    },
  };
}

function _base(title: string) {
  return {
    backgroundColor: "transparent",
    animation: true,
    animationDuration: 500,
    animationEasing: "cubicOut",
    title: {
      text: title,
      textStyle: { color: _TEXT, fontSize: 14, fontWeight: "500" },
      left: "left",
      padding: [8, 0],
    },
    color: _PALETTE,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export type Row = Record<string, unknown>;

/**
 * Build an ECharts `option` object from raw query result rows.
 *
 * @param chartType  "bar" | "line" | "pie" | "scatter" | "area" | "donut" |
 *                   "funnel" | "gauge" | "treemap" | "radar" | "dual_axis"
 * @param rows       Array of plain JS objects from DuckDB result
 * @param xCol       Column name for the category / x-axis
 * @param yCol       Column name (or array of names) for the value / y-axis
 * @param title      Chart title
 */
export function buildEChartsConfig(
  chartType: string,
  rows: Row[],
  xCol: string,
  yCol: string | string[],
  title: string,
): Record<string, unknown> {
  const yCols = Array.isArray(yCol) ? yCol : [yCol];
  const base = _base(title);

  if (chartType === "pie" || chartType === "donut") {
    const yc = yCols[0];
    const radius = chartType === "donut" ? ["40%", "70%"] : "60%";
    return {
      ...base,
      tooltip: { trigger: "item", backgroundColor: _TOOLTIP_BG, borderColor: _AXIS_LINE, borderWidth: 1, textStyle: { color: _TEXT }, formatter: "{b}: {c} ({d}%)" },
      legend: { type: "scroll", orient: "horizontal", bottom: 0, textStyle: { color: _TEXT, fontSize: 12 } },
      series: [{
        type: "pie",
        radius,
        center: ["50%", "55%"],
        label: { color: _TEXT, fontSize: 12 },
        labelLine: { lineStyle: { color: _AXIS_LINE } },
        itemStyle: { borderRadius: 4, borderWidth: 2, borderColor: "transparent" },
        data: rows.map((r) => ({ name: String(r[xCol] ?? ""), value: Number(r[yc] ?? 0) })),
      }],
    };
  }

  if (chartType === "scatter") {
    const yc = yCols[0];
    return {
      ...base,
      grid: { left: 60, right: 20, top: 40, bottom: 40 },
      tooltip: { trigger: "item", backgroundColor: _TOOLTIP_BG, borderColor: _AXIS_LINE, borderWidth: 1, textStyle: { color: _TEXT } },
      xAxis: { type: "value", name: xCol, nameTextStyle: { color: _SUBTEXT }, axisLabel: { color: _SUBTEXT }, axisLine: { lineStyle: { color: _AXIS_LINE } }, splitLine: { lineStyle: { color: _GRID_LINE } } },
      yAxis: { type: "value", name: yc, nameTextStyle: { color: _SUBTEXT }, axisLabel: { color: _SUBTEXT }, axisLine: { show: false }, splitLine: { lineStyle: { color: _GRID_LINE } } },
      series: [{
        type: "scatter",
        data: rows.map((r) => [Number(r[xCol] ?? 0), Number(r[yc] ?? 0)]),
        symbolSize: 8,
        itemStyle: { color: _PRIMARY, opacity: 0.7 },
      }],
    };
  }

  if (chartType === "funnel") {
    const yc = yCols[0];
    const data = rows
      .map((r) => ({ name: String(r[xCol] ?? ""), value: Number(r[yc] ?? 0) }))
      .sort((a, b) => b.value - a.value);
    return {
      ...base,
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)", backgroundColor: _TOOLTIP_BG, borderColor: _AXIS_LINE, textStyle: { color: _TEXT } },
      legend: { type: "scroll", orient: "horizontal", bottom: 0, textStyle: { color: _TEXT, fontSize: 12 } },
      series: [{
        type: "funnel",
        left: "10%",
        top: 60,
        bottom: 30,
        width: "80%",
        min: 0,
        max: data[0]?.value ?? 100,
        sort: "descending",
        gap: 2,
        label: { show: true, position: "inside", color: "#fff", fontSize: 12, fontWeight: 600 },
        itemStyle: { borderWidth: 0 },
        emphasis: { label: { fontSize: 13, fontWeight: "bold" } },
        data: data.map((d, i) => ({ ...d, itemStyle: { color: _PALETTE[i % _PALETTE.length] } })),
      }],
    };
  }

  if (chartType === "gauge") {
    const yc = yCols[0];
    const value = Number(rows[0]?.[yc] ?? 0);
    const maxVal = value <= 1 ? 1 : value <= 100 ? 100 : Math.pow(10, Math.ceil(Math.log10(value * 1.5)));
    const pct = Math.max(0, Math.min(1, value / maxVal));
    const color = pct >= 0.7 ? "#34D399" : pct >= 0.4 ? "#818CF8" : "#F87171";
    return {
      ...base,
      series: [{
        type: "gauge",
        min: 0,
        max: maxVal,
        radius: "75%",
        center: ["50%", "60%"],
        axisLine: { lineStyle: { width: 14, color: [[pct, color], [1, _AXIS_LINE]] } },
        pointer: { itemStyle: { color }, length: "65%" },
        axisTick: { distance: -14, length: 6, lineStyle: { color: "#fff", width: 1 } },
        splitLine: { distance: -18, length: 14, lineStyle: { color: "#fff", width: 2 } },
        axisLabel: { color: _SUBTEXT, distance: 18, fontSize: 10 },
        detail: { valueAnimation: true, formatter: "{value}", color: "#E2E8F0", fontSize: 24, fontWeight: "bold", offsetCenter: [0, "75%"] },
        title: { color: _SUBTEXT, fontSize: 12, offsetCenter: [0, "92%"] },
        data: [{ value: Math.round(value * 100) / 100, name: title }],
      }],
    };
  }

  if (chartType === "treemap") {
    const yc = yCols[0];
    const data = rows
      .map((r, i) => ({ name: String(r[xCol] ?? ""), value: Math.abs(Number(r[yc] ?? 0)), itemStyle: { color: _PALETTE[i % _PALETTE.length] } }))
      .filter((d) => d.value > 0);
    return {
      ...base,
      tooltip: { trigger: "item", formatter: "{b}: {c}", backgroundColor: _TOOLTIP_BG, borderColor: _AXIS_LINE, textStyle: { color: _TEXT } },
      series: [{
        type: "treemap",
        top: 50,
        left: 0, right: 0, bottom: 0,
        label: { show: true, formatter: "{b}\n{c}", color: "#fff", fontSize: 12 },
        upperLabel: { show: true, height: 28, color: "#fff", fontSize: 12, fontWeight: 600 },
        itemStyle: { borderWidth: 1, borderColor: "#0f1117", gapWidth: 2 },
        breadcrumb: { show: false },
        data,
      }],
    };
  }

  if (chartType === "radar") {
    const categories = rows.map((r) => String(r[xCol] ?? ""));
    const maxVal = Math.max(...yCols.flatMap((yc) => rows.map((r) => Number(r[yc] ?? 0))), 1);
    if (yCols.length >= 3) {
      // Each y_col is one radar axis; each row is one entity
      return {
        ...base,
        legend: { type: "scroll", orient: "horizontal", bottom: 0, textStyle: { color: "#E2E8F0", fontSize: 12 } },
        radar: {
          indicator: yCols.map((yc) => ({ name: yc, max: Math.max(...rows.map((r) => Number(r[yc] ?? 0)), 1) })),
          axisName: { color: _SUBTEXT }, splitLine: { lineStyle: { color: _AXIS_LINE } }, axisLine: { lineStyle: { color: _AXIS_LINE } },
        },
        series: [{ type: "radar", data: rows.map((r, i) => ({ name: categories[i], value: yCols.map((yc) => Number(r[yc] ?? 0)), areaStyle: { color: _PALETTE[i % _PALETTE.length] + "33" }, lineStyle: { color: _PALETTE[i % _PALETTE.length] } })) }],
      };
    }
    const yc = yCols[0];
    const vals = rows.map((r) => Number(r[yc] ?? 0));
    return {
      ...base,
      radar: {
        indicator: categories.map((name) => ({ name, max: maxVal })),
        axisName: { color: _SUBTEXT }, splitLine: { lineStyle: { color: _AXIS_LINE } }, axisLine: { lineStyle: { color: _AXIS_LINE } },
      },
      series: [{ type: "radar", data: [{ name: title, value: vals, areaStyle: { color: _PRIMARY + "33" }, lineStyle: { color: _PRIMARY, width: 2 }, itemStyle: { color: _PRIMARY } }] }],
    };
  }

  if (chartType === "dual_axis" || chartType === "combo") {
    const categories = rows.map((r) => String(r[xCol] ?? ""));
    const series = yCols.map((yc, i) => ({
      name: yc,
      type: i === 0 ? "bar" : "line",
      yAxisIndex: i === 0 ? 0 : 1,
      data: rows.map((r) => { const v = r[yc]; return v == null ? null : Number(v); }),
      ...(i === 0 ? { barMaxWidth: 40, itemStyle: { color: _PALETTE[0], borderRadius: [3, 3, 0, 0] } } : { smooth: true, symbol: "circle", symbolSize: 6, lineStyle: { color: _PALETTE[1], width: 2 }, itemStyle: { color: _PALETTE[1] } }),
    }));
    return {
      ...base,
      grid: { left: 70, right: 70, top: 70, bottom: yCols.length > 1 ? 56 : 36 },
      legend: { type: "scroll", orient: "horizontal", bottom: 0, textStyle: { color: "#E2E8F0", fontSize: 12 } },
      tooltip: _tooltip(),
      xAxis: _xAxis(categories, xCol),
      yAxis: [_valueAxis(yCols[0]), { ..._valueAxis(yCols[1]), splitLine: { show: false } }],
      series,
    };
  }

  // bar / line / area (default)
  const categories = rows.map((r) => String(r[xCol] ?? ""));
  const seriesType = chartType === "line" || chartType === "area" ? "line" : "bar";

  const series = yCols.map((yc, i) => ({
    type: seriesType,
    name: yc,
    data: rows.map((r) => {
      const v = r[yc];
      return v === null || v === undefined ? null : Number(v);
    }),
    smooth: seriesType === "line",
    itemStyle: { color: _PALETTE[i % _PALETTE.length] },
    ...(seriesType === "bar" ? { barMaxWidth: 48, barMinWidth: 4 } : {}),
    ...(seriesType === "line" ? {
      areaStyle: (chartType === "area" || yCols.length === 1)
        ? { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: _PALETTE[i % _PALETTE.length] + "55" }, { offset: 1, color: _PALETTE[i % _PALETTE.length] + "00" }] } }
        : undefined,
    } : {}),
  }));

  return {
    ...base,
    grid: { left: 60, right: 20, top: 40, bottom: yCols.length > 1 ? 56 : 36 },
    tooltip: _tooltip(),
    ...(yCols.length > 1 ? { legend: { type: "scroll", orient: "horizontal", bottom: 0, textStyle: { color: _TEXT, fontSize: 12 } } } : {}),
    xAxis: _xAxis(categories, xCol),
    yAxis: _valueAxis(yCols.length === 1 ? yCols[0] : ""),
    series,
  };
}

/** Extract a formatted metric string from the first numeric column in rows. */
export function extractMetricValue(rows: Row[]): string | null {
  if (!rows.length) return null;
  const row = rows[0];
  for (const key of Object.keys(row)) {
    const v = row[key];
    if (v !== null && v !== undefined && typeof v !== "string") {
      const n = Number(v);
      if (!Number.isNaN(n)) {
        if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
        if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
        if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
        return Number.isInteger(n) ? String(n) : n.toFixed(2);
      }
    }
  }
  return null;
}
