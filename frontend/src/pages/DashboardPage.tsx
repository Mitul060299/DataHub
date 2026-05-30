import { useEffect, useState, useCallback, useRef, useMemo, type CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  fetchDashboardById,
  updateDashboard,
  deleteDashboardTile,
  updateDashboardTile,
  postDashboardView,
  addDashboardTile,
  refreshDashboardTile,
  autoArrangeDashboard,
} from "../api";
import type { DashboardV2, DashboardV2Tile } from "../types";
import { EChartsRenderer } from "../components/EChartsRenderer";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { MetricTile } from "../components/MetricTile";
import { SharePanel } from "../components/SharePanel";
import { DashboardComments } from "../components/DashboardComments";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";
import { useDuckDB } from "../hooks/useDuckDB";
import { buildEChartsConfig, extractMetricValue } from "../lib/echartsBuilder";
import { ContentTileEditor } from "../components/ContentTileEditor";
import { DashboardGenerateModal } from "../components/DashboardGenerateModal";
import { DashboardFilterBar, type ActiveFilter } from "../components/DashboardFilterBar";

const ResponsiveGridLayout = WidthProvider(GridLayout);

// ---------- helpers ----------

function buildAutoLayout(tiles: DashboardV2Tile[]): Layout[] {
  let x = 0, y = 0, rowH = 0;
  return tiles.map((tile) => {
    const tt = tile.tile_type ?? "chart";
    const w = (tt === "heading" || tt === "divider") ? 12 : tt === "metric" ? 3 : 6;
    const h = tt === "divider" ? 1 : tt === "heading" ? 2 : tt === "metric" ? 3 : (tt === "text" || tt === "image") ? 4 : 6;
    if (x + w > 12) { x = 0; y += rowH; rowH = 0; }
    const entry: Layout = { i: tile.id, x, y, w, h };
    x += w;
    rowH = Math.max(rowH, h);
    return entry;
  });
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------- CSV export ----------

function tileToCSVBlock(tile: DashboardV2Tile): string | null {
  const tt = tile.tile_type ?? "chart";
  const rows: string[] = [`# ${tile.title}`];

  if (tt === "metric") {
    rows.push("Label,Value");
    rows.push(`"${(tile.metric_label ?? tile.title).replace(/"/g, '""')}","${(tile.metric_value ?? "").replace(/"/g, '""')}"`);
    return rows.join("\n");
  }

  if (tt === "table") {
    const td = tile.table_data as { columns?: string[]; rows?: unknown[][] } | null;
    if (!td?.columns?.length) return null;
    rows.push(td.columns.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    for (const row of td.rows ?? []) {
      rows.push((row as unknown[]).map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    }
    return rows.join("\n");
  }

  if (tt === "chart") {
    const cfg = tile.echarts_config as Record<string, unknown> | null;
    if (!cfg) return null;
    const xAxisRaw = cfg.xAxis;
    const categories: unknown[] = Array.isArray(xAxisRaw)
      ? ((xAxisRaw[0] as Record<string, unknown>)?.data as unknown[]) ?? []
      : ((xAxisRaw as Record<string, unknown>)?.data as unknown[]) ?? [];
    const seriesRaw = cfg.series as unknown[];
    if (!Array.isArray(seriesRaw) || seriesRaw.length === 0) return null;

    // Pie / scatter / no-xAxis: name,value format
    const firstSeries = seriesRaw[0] as Record<string, unknown>;
    const firstData = firstSeries?.data as unknown[];
    if (categories.length === 0 && Array.isArray(firstData) && firstData.length > 0 && typeof firstData[0] === "object") {
      // Pie style: [{name, value}]
      rows.push("Name,Value");
      for (const pt of firstData) {
        const p = pt as Record<string, unknown>;
        rows.push(`"${String(p.name ?? "").replace(/"/g, '""')}","${String(p.value ?? "")}"`);
      }
      return rows.join("\n");
    }

    // Category + series columns
    const seriesNames = seriesRaw.map((s) => String((s as Record<string, unknown>).name ?? "Series"));
    rows.push(["Category", ...seriesNames].map((h) => `"${h.replace(/"/g, '""')}"`).join(","));
    const len = categories.length || ((firstSeries?.data as unknown[])?.length ?? 0);
    for (let i = 0; i < len; i++) {
      const cat = categories.length > 0 ? String(categories[i] ?? i) : String(i);
      const vals = seriesRaw.map((s) => {
        const d = (s as Record<string, unknown>).data as unknown[];
        const v = d?.[i];
        return v == null ? "" : String(v);
      });
      rows.push([`"${cat.replace(/"/g, '""')}"`, ...vals].join(","));
    }
    return rows.join("\n");
  }

  return null;
}

function exportDashboardCSV(name: string, tiles: DashboardV2Tile[]) {
  const blocks: string[] = [];
  for (const tile of tiles) {
    const block = tileToCSVBlock(tile);
    if (block) blocks.push(block);
  }
  if (blocks.length === 0) {
    alert("No exportable chart data found. Populate chart tiles first via the AI chat.");
    return;
  }
  const content = blocks.join("\n\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9_-]/gi, "_")}_export.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Tile card ----------

function applyFilterToConfig(
  cfg: Record<string, unknown>,
  filterValue: string,
): Record<string, unknown> {
  const seriesRaw = cfg.series;
  if (!Array.isArray(seriesRaw)) return cfg;
  const series = seriesRaw.map((s) => {
    const ser = s as Record<string, unknown>;
    const data = ser.data as unknown[] | undefined;
    if (!Array.isArray(data)) return ser;
    const mappedData = data.map((d) => {
      const item = typeof d === "object" && d !== null ? (d as Record<string, unknown>) : { value: d, name: String(d) };
      const name = String(item.name ?? "");
      return { ...item, itemStyle: { opacity: name === filterValue ? 1 : 0.2 } };
    });
    return { ...ser, data: mappedData };
  });
  return { ...cfg, series };
}

function applyDashFilters(
  cfg: Record<string, unknown>,
  filters: ActiveFilter[],
): Record<string, unknown> {
  if (filters.length === 0) return cfg;
  const seriesRaw = cfg.series;
  if (!Array.isArray(seriesRaw)) return cfg;
  const xAxisRaw = cfg.xAxis;
  const categories: string[] = Array.isArray(xAxisRaw)
    ? ((xAxisRaw[0] as Record<string, unknown>)?.data as string[] | undefined) ?? []
    : ((xAxisRaw as Record<string, unknown>)?.data as string[] | undefined) ?? [];

  const passes = (name: string): boolean =>
    filters.every((f) => {
      const fv = f.value.toLowerCase();
      const nv = name.toLowerCase();
      switch (f.operator) {
        case "=": return nv === fv;
        case "!=": return nv !== fv;
        case "contains": return nv.includes(fv);
        case ">": return parseFloat(nv) > parseFloat(fv);
        case "<": return parseFloat(nv) < parseFloat(fv);
        default: return true;
      }
    });

  const series = seriesRaw.map((s) => {
    const ser = s as Record<string, unknown>;
    const data = ser.data as unknown[] | undefined;
    if (!Array.isArray(data)) return ser;
    const mappedData = data.map((d, i) => {
      const item =
        typeof d === "object" && d !== null
          ? (d as Record<string, unknown>)
          : { value: d, name: categories[i] ?? String(d) };
      const name = String(item.name ?? categories[i] ?? "");
      return { ...item, itemStyle: { opacity: passes(name) ? 1 : 0.08 } };
    });
    return { ...ser, data: mappedData };
  });
  return { ...cfg, series };
}

// ---------- Chart type picker ----------

const CHART_TYPES = [
  { type: "bar", label: "Bar" },
  { type: "horizontal_bar", label: "H.Bar" },
  { type: "line", label: "Line" },
  { type: "area", label: "Area" },
  { type: "scatter", label: "Scatter" },
  { type: "pie", label: "Pie" },
  { type: "donut", label: "Donut" },
  { type: "heatmap", label: "Heatmap" },
  { type: "waterfall", label: "Waterfall" },
  { type: "funnel", label: "Funnel" },
  { type: "gauge", label: "Gauge" },
  { type: "treemap", label: "Treemap" },
  { type: "radar", label: "Radar" },
  { type: "dual_axis", label: "Dual Axis" },
  { type: "table", label: "Table" },
];

// ---------- Tile card ----------

function TileCard({
  tile,
  editMode,
  onDelete,
  onTitleEdit,
  onRefresh,
  onEdit,
  onChartTypeChange,
  refreshing,
  crossFilter,
  onCrossFilter,
  activeFilters,
}: {
  tile: DashboardV2Tile;
  editMode: boolean;
  onDelete: (id: string) => void;
  onTitleEdit: (id: string, newTitle: string) => void;
  onRefresh: (id: string) => void;
  onEdit: (tile: DashboardV2Tile) => void;
  onChartTypeChange: (id: string, chartType: string) => void;
  refreshing: boolean;
  crossFilter: { value: string; sourceTileId: string } | null;
  onCrossFilter: (value: string, tileId: string) => void;
  activeFilters: ActiveFilter[];
}) {
  const [editing, setEditing] = useState(false);
  const [tempTitle, setTempTitle] = useState(tile.title);
  const [showTypePicker, setShowTypePicker] = useState(false);

  const commitTitle = () => {
    setEditing(false);
    if (tempTitle.trim() && tempTitle !== tile.title) {
      onTitleEdit(tile.id, tempTitle.trim());
    }
  };

  const tileType = tile.tile_type ?? "chart";

  return (
    <div
      style={{
        background: "#0F1117",
        border: "1px solid #1E293B",
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        className="tile-drag-handle"
        style={{          cursor: editMode ? "grab" : "default",
          padding: "8px 12px 4px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          minHeight: 32,
          borderBottom: "1px solid #1E293B",
        }}
      >
        {editing ? (
          <input
            autoFocus
            value={tempTitle}
            onChange={(e) => setTempTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") setEditing(false);
            }}
            style={{
              flex: 1,
              background: "#121827",
              border: "1px solid #5B6AF0",
              borderRadius: 6,
              color: "#E2E8F0",
              fontSize: 12,
              padding: "2px 8px",
              outline: "none",
            }}
          />
        ) : (
          <span
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: 500,
              color: "#94A3B8",
              cursor: editMode ? "pointer" : "default",
            }}
            onClick={() => editMode && setEditing(true)}
            title={editMode ? "Click to edit title" : undefined}
          >
            {tile.title}
          </span>
        )}
        <button
          onClick={() => onRefresh(tile.id)}
          title="Refresh tile"
          disabled={refreshing}
          style={{
            background: "none",
            border: "none",
            color: refreshing ? "#5B6AF0" : "#475569",
            cursor: refreshing ? "default" : "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: "2px 4px",
            flexShrink: 0,
            display: "inline-block",
            animation: refreshing ? "spin 1s linear infinite" : "none",
          }}
        >
          ↻
        </button>
        {editMode && (
          <>
            {(tileType === "chart" || tileType === "table") && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowTypePicker((p) => !p)}
                  title="Change chart type"
                  style={{
                    background: showTypePicker ? "rgba(91,106,240,0.2)" : "none",
                    border: "none",
                    color: "#818CF8",
                    cursor: "pointer",
                    fontSize: 12,
                    lineHeight: 1,
                    padding: "2px 5px",
                    flexShrink: 0,
                    borderRadius: 4,
                  }}
                >
                  ⇄
                </button>
                {showTypePicker && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 49 }}
                      onClick={() => setShowTypePicker(false)}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        right: 0,
                        zIndex: 50,
                        background: "#0F1117",
                        border: "1px solid #1E293B",
                        borderRadius: 10,
                        padding: 8,
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 4,
                        minWidth: 180,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                      }}
                    >
                      {CHART_TYPES.map(({ type, label }) => (
                        <button
                          key={type}
                          onClick={() => {
                            setShowTypePicker(false);
                            onChartTypeChange(tile.id, type);
                          }}
                          style={{
                            background:
                              (tile.chart_type ?? "bar") === type
                                ? "rgba(91,106,240,0.2)"
                                : "transparent",
                            border:
                              (tile.chart_type ?? "bar") === type
                                ? "1px solid rgba(91,106,240,0.4)"
                                : "1px solid transparent",
                            borderRadius: 6,
                            color: (tile.chart_type ?? "bar") === type ? "#818CF8" : "#94A3B8",
                            cursor: "pointer",
                            fontSize: 10,
                            padding: "4px 6px",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => onEdit(tile)}
              title="Edit tile"
              style={{
                background: "none",
                border: "none",
                color: "#818CF8",
                cursor: "pointer",
                fontSize: 13,
                lineHeight: 1,
                padding: "2px 4px",
                flexShrink: 0,
              }}
            >
              ✎
            </button>
            <button
              onClick={() => onDelete(tile.id)}
              title="Remove tile"
              style={{
                background: "none",
                border: "none",
                color: "#EF4444",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                padding: "2px 4px",
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {tileType === "metric" ? (
          <MetricTile
            label={tile.metric_label ?? tile.title}
            value={tile.metric_value ?? "—"}
            trend={tile.metric_trend as "up" | "down" | "neutral" | undefined}
            threshold={
              tile.metric_threshold
                ? { value: Number((tile.metric_threshold as Record<string, unknown>).value ?? 0) }
                : undefined
            }
            sparkline_data={Array.isArray(tile.sparkline_data) ? (tile.sparkline_data as number[]) : undefined}
            delta_pct={typeof tile.delta_pct === "number" ? tile.delta_pct : undefined}
            style={{ height: "100%", borderRadius: 0, border: "none" }}
          />
        ) : tileType === "heading" ? (
          <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", height: "100%" }}>
            <span
              style={{
                fontSize:
                  Number((tile.query_spec as Record<string, unknown>).level ?? 1) === 1 ? 28
                  : Number((tile.query_spec as Record<string, unknown>).level ?? 1) === 2 ? 22 : 17,
                fontWeight: 700,
                color: "#E2E8F0",
                lineHeight: 1.2,
              }}
            >
              {String((tile.query_spec as Record<string, unknown>).text ?? tile.title)}
            </span>
          </div>
        ) : tileType === "image" ? (
          <div style={{ padding: 8, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <img
              src={String((tile.query_spec as Record<string, unknown>).url ?? "")}
              alt={tile.title}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6 }}
            />
          </div>
        ) : tileType === "divider" ? (
          <div style={{ padding: "0 16px", display: "flex", alignItems: "center", height: "100%" }}>
            <hr style={{ width: "100%", border: "none", borderTop: "1px solid #334155" }} />
          </div>
        ) : tileType === "text" ? (
          <div
            style={{
              padding: 16,
              fontSize: 13,
              color: "#E2E8F0",
              lineHeight: 1.6,
              overflow: "auto",
              height: "100%",
            }}
          >
            {String((tile.query_spec as Record<string, unknown>).text ?? "")}
          </div>
        ) : (
          (() => {
            const cfg = (tile.echarts_config as Record<string, unknown> | null) ?? null;
            const hint = String((tile.query_spec as Record<string, unknown>).query_hint ?? "");
            if (!cfg || Object.keys(cfg).length === 0) {
              return (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    padding: 20,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 28, opacity: 0.25 }}>📊</div>
                  <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, maxWidth: 240 }}>
                    {hint || "No chart data yet"}
                  </div>
                  <div style={{ fontSize: 11, color: "#334155" }}>
                    Use the AI chat to query your dataset and pin the result here
                  </div>
                </div>
              );
            }
            const isSource = crossFilter?.sourceTileId === tile.id;
            let displayCfg = crossFilter && !isSource ? applyFilterToConfig(cfg, crossFilter.value) : cfg;
            if (activeFilters.length > 0) {
              displayCfg = applyDashFilters(displayCfg, activeFilters);
            }
            const handleClick = (params: unknown) => {
              const p = params as { name?: string; data?: { name?: string } };
              const clickedVal = p?.name ?? (p?.data as Record<string, unknown> | undefined)?.name as string | undefined;
              if (!clickedVal) return;
              // Toggle off if clicking the same value on the source tile
              if (isSource && crossFilter?.value === clickedVal) {
                onCrossFilter("", tile.id); // clear
              } else {
                onCrossFilter(String(clickedVal), tile.id);
              }
            };
            return <ErrorBoundary fallback={<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#475569" }}>⚠ Chart render failed</div>}><EChartsRenderer config={displayCfg} height={260} onChartClick={handleClick} /></ErrorBoundary>;
          })()
        )}
      </div>
    </div>
  );
}

// ---------- Settings slide-over ----------

function SettingsOverlay({
  dashboard,
  onSave,
  onClose,
}: {
  dashboard: DashboardV2;
  onSave: (update: { name: string; description: string; theme: Record<string, unknown> }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(dashboard.name);
  const [description, setDescription] = useState(dashboard.description ?? "");
  const [primaryColor, setPrimaryColor] = useState(
    String((dashboard.theme as Record<string, unknown> | undefined)?.primary ?? "#5B6AF0")
  );
  const [showBranding, setShowBranding] = useState(
    (dashboard.theme as Record<string, unknown> | undefined)?.show_branding !== false
  );
  const [refreshIntervalMins, setRefreshIntervalMins] = useState(
    Number((dashboard.theme as Record<string, unknown> | undefined)?.refresh_interval_mins ?? 0)
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        display: "flex",
        justifyContent: "flex-end",
        background: "rgba(0,0,0,0.4)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        style={{
          width: 360,
          background: "#0F1117",
          borderLeft: "1px solid #1E293B",
          height: "100%",
          overflowY: "auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#E2E8F0" }}>Dashboard settings</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }}>×</button>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>Title</span>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>Accent colour</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              style={{ width: 44, height: 36, border: "1px solid #1E293B", borderRadius: 6, background: "transparent", cursor: "pointer" }}
            />
            <span style={{ fontSize: 12, color: "#64748B", fontFamily: "monospace" }}>{primaryColor}</span>
          </div>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showBranding}
            onChange={(e) => setShowBranding(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "#5B6AF0" }}
          />
          <span style={{ fontSize: 13, color: "#94A3B8" }}>Show datahub.org.in branding</span>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>Auto-refresh interval</span>
          <select
            value={refreshIntervalMins}
            onChange={(e) => setRefreshIntervalMins(Number(e.target.value))}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value={0}>Off</option>
            <option value={1}>Every 1 minute</option>
            <option value={5}>Every 5 minutes</option>
            <option value={15}>Every 15 minutes</option>
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every 60 minutes</option>
          </select>
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={() => onSave({ name, description, theme: { primary: primaryColor, show_branding: showBranding, refresh_interval_mins: refreshIntervalMins } })}
            style={primaryBtnStyle}
          >
            Save
          </button>
        </div>
      </aside>
    </div>
  );
}

// ---------- Shared styles ----------

const inputStyle: CSSProperties = {
  border: "1px solid #1E293B",
  borderRadius: 8,
  background: "#121827",
  color: "#E2E8F0",
  padding: "8px 10px",
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const cancelBtnStyle: CSSProperties = {
  flex: 1,
  border: "1px solid #1E293B",
  borderRadius: 8,
  background: "transparent",
  color: "#94A3B8",
  padding: "8px 0",
  fontSize: 13,
  cursor: "pointer",
};

const primaryBtnStyle: CSSProperties = {
  flex: 1,
  border: "none",
  borderRadius: 8,
  background: "#5B6AF0",
  color: "#fff",
  padding: "8px 0",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

// ---------- Main page ----------

export function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardV2 | null>(null);
  const [tiles, setTiles] = useState<DashboardV2Tile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showContentEditor, setShowContentEditor] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [rglLayout, setRglLayout] = useState<Layout[]>([]);
  const [refreshingTiles, setRefreshingTiles] = useState<Set<string>>(new Set());
  const [autoArranging, setAutoArranging] = useState(false);
  const [editingTile, setEditingTile] = useState<DashboardV2Tile | null>(null);
  const [crossFilter, setCrossFilter] = useState<{ value: string; sourceTileId: string } | null>(null);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [filterBarVisible, setFilterBarVisible] = useState(false);
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCrossFilter = useCallback((value: string, sourceTileId: string) => {
    if (!value) { setCrossFilter(null); return; }
    setCrossFilter((prev) => (prev?.value === value && prev.sourceTileId === sourceTileId ? null : { value, sourceTileId }));
  }, []);

  const onTilesRefresh = useCallback(async (_tileIds: string[]) => {
    if (!id) return;
    const dash = await fetchDashboardById(id);
    setTiles(dash.tiles);
  }, [id]);

  const { toastMessage, refreshFailed } = useRealtimeDashboard(id, onTilesRefresh);
  const { isReady: isDuckReady, runQuery: duckQuery } = useDuckDB();

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const dash = await fetchDashboardById(id);
        setDashboard(dash);
        setTiles(dash.tiles);
        const stored = (dash.layout as { rgl?: Layout[] }).rgl;
        setRglLayout(stored && stored.length > 0 ? stored : buildAutoLayout(dash.tiles));
        void postDashboardView(id);
      } catch (err) {
        const maybeError = err as { response?: { data?: { detail?: string } }; message?: string };
        setError(maybeError.response?.data?.detail ?? maybeError.message ?? "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  // Keep rglLayout in sync when tiles are added externally (e.g. via Pin to Dashboard)
  useEffect(() => {
    setRglLayout((prev) => {
      const prevIds = new Set(prev.map((l) => l.i));
      const newTiles = tiles.filter((t) => !prevIds.has(t.id));
      if (newTiles.length === 0) return prev;
      const maxY = prev.reduce((m, l) => Math.max(m, l.y + l.h), 0);
      return [...prev, ...buildAutoLayout(newTiles).map((e) => ({ ...e, y: e.y + maxY }))];
    });
  }, [tiles]);

  const handleDeleteTile = async (tileId: string) => {
    if (!id) return;
    try {
      await deleteDashboardTile(id, tileId);
      setTiles((prev) => prev.filter((t) => t.id !== tileId));
      setRglLayout((prev) => prev.filter((l) => l.i !== tileId));
    } catch (err) {
      console.error("Delete tile failed:", err);
    }
  };

  const handleTitleEdit = async (tileId: string, newTitle: string) => {
    if (!id) return;
    try {
      const updated = await updateDashboardTile(id, tileId, { title: newTitle });
      setTiles((prev) => prev.map((t) => (t.id === tileId ? { ...t, title: updated.title } : t)));
    } catch (err) {
      console.error("Update tile title failed:", err);
    }
  };

  const handleSaveSettings = async (update: { name: string; description: string; theme: Record<string, unknown> }) => {
    if (!id) return;
    try {
      const updated = await updateDashboard(id, update);
      setDashboard(updated);
      setShowSettings(false);
    } catch (err) {
      console.error("Update dashboard failed:", err);
    }
  };

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    if (newLayout.length === 0) return;
    setRglLayout(newLayout);
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(() => {
      if (!id) return;
      void updateDashboard(id, { layout: { rgl: newLayout } });
    }, 800);
  }, [id]);

  const handleTileRefresh = async (tileId: string) => {
    if (!id) return;
    setRefreshingTiles((prev) => { const s = new Set(prev); s.add(tileId); return s; });
    try {
      const tile = tiles.find((t) => t.id === tileId);
      const sql = String((tile?.query_spec as Record<string, unknown>)?.sql ?? "").trim();

      // Phase S2: try client-side DuckDB-WASM first when available
      if (isDuckReady && tile?.dataset_id && sql && tile.tile_type !== "metric") {
        try {
          const rows = await duckQuery(tile.dataset_id, sql);
          const qs = tile.query_spec as Record<string, unknown>;
          const xCol = String(qs.x_col ?? (rows[0] ? Object.keys(rows[0])[0] : ""));
          const rawYCol = qs.y_col;
          const yCol = Array.isArray(rawYCol)
            ? (rawYCol as string[])
            : rawYCol
              ? [String(rawYCol)]
              : rows[0]
                ? Object.keys(rows[0]).slice(1)
                : [];
          if (rows.length > 0 && xCol && yCol.length > 0) {
            const cfg = buildEChartsConfig(
              tile.chart_type || "bar",
              rows,
              xCol,
              yCol.length === 1 ? yCol[0] : yCol,
              tile.title,
            );
            setTiles((prev) =>
              prev.map((t) =>
                t.id === tileId ? { ...t, echarts_config: cfg } : t,
              ),
            );
            return;
          }
        } catch {
          // fall through to server-side refresh
        }
      }

      // Metric tiles or fallback: server-side refresh
      if (isDuckReady && tile?.dataset_id && sql && tile.tile_type === "metric") {
        try {
          const rows = await duckQuery(tile.dataset_id, sql);
          const val = extractMetricValue(rows);
          if (val !== null) {
            setTiles((prev) =>
              prev.map((t) =>
                t.id === tileId ? { ...t, metric_value: val } : t,
              ),
            );
            return;
          }
        } catch {
          // fall through
        }
      }

      const refreshed = await refreshDashboardTile(id, tileId);
      setTiles((prev) => prev.map((t) => (t.id === tileId ? refreshed : t)));
    } catch (err) {
      console.error("Tile refresh failed:", err);
    } finally {
      setRefreshingTiles((prev) => { const s = new Set(prev); s.delete(tileId); return s; });
    }
  };

  const handleAddContent = async (tileData: {
    title: string;
    tile_type: string;
    query_spec: Record<string, unknown>;
  }) => {
    if (!id) return;
    try {
      const tile = await addDashboardTile({
        dashboard_id: id,
        title: tileData.title,
        chart_type: "none",
        tile_type: tileData.tile_type,
        query_spec: tileData.query_spec,
      });
      setTiles((prev) => [...prev, tile]);
      const tt = tileData.tile_type;
      const w = (tt === "heading" || tt === "divider") ? 12 : 6;
      const h = tt === "divider" ? 1 : tt === "heading" ? 2 : 4;
      const maxY = rglLayout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
      setRglLayout((prev) => [...prev, { i: tile.id, x: 0, y: maxY, w, h }]);
      setShowContentEditor(false);
    } catch (err) {
      console.error("Add content tile failed:", err);
    }
  };

  const handleTileEdit = async (tileId: string, patch: Partial<DashboardV2Tile>) => {
    if (!id) return;
    try {
      const payload: Parameters<typeof updateDashboardTile>[2] = {};
      if (patch.title != null) payload.title = patch.title;
      if (patch.query_spec != null) payload.query_spec = patch.query_spec as Record<string, unknown>;
      if (patch.metric_label != null) payload.metric_label = patch.metric_label;
      if (patch.metric_value != null) payload.metric_value = patch.metric_value;
      if (patch.metric_trend != null) payload.metric_trend = patch.metric_trend;
      if ("sparkline_data" in patch) payload.sparkline_data = patch.sparkline_data as number[] | undefined;
      if ("delta_pct" in patch) payload.delta_pct = patch.delta_pct as number | null | undefined;
      const updated = await updateDashboardTile(id, tileId, payload);
      setTiles((prev) => prev.map((t) => (t.id === tileId ? { ...t, ...updated } : t)));
      setEditingTile(null);
    } catch (err) {
      console.error("Tile edit failed:", err);
    }
  };

  const handleAutoArrange = async () => {
    if (!id || tiles.length === 0) return;
    setAutoArranging(true);
    try {
      const updated = await autoArrangeDashboard(id);
      const stored = (updated.layout as { rgl?: Layout[] }).rgl;
      if (stored && stored.length > 0) setRglLayout(stored);
    } catch (err) {
      console.error("Auto-arrange failed:", err);
    } finally {
      setAutoArranging(false);
    }
  };

  // ── Chart type switcher ──────────────────────────────────────────────────
  const handleChartTypeChange = async (tileId: string, chartType: string) => {
    if (!id) return;
    try {
      const updated = await updateDashboardTile(id, tileId, { chart_type: chartType });
      setTiles((prev) => prev.map((t) => (t.id === tileId ? { ...t, ...updated } : t)));
      // Trigger a server-side refresh to rebuild echarts_config for the new type
      void handleTileRefresh(tileId);
    } catch (err) {
      console.error("Chart type change failed:", err);
    }
  };

  // ── Available filter columns ─────────────────────────────────────────────
  const availableColumns = useMemo(() => {
    const cols = new Set<string>();
    for (const tile of tiles) {
      if (tile.tile_type !== "chart" && tile.tile_type !== "table") continue;
      const qs = tile.query_spec as Record<string, unknown> | null;
      if (qs?.x_col) cols.add(String(qs.x_col));
    }
    return Array.from(cols);
  }, [tiles]);

  // ── Auto-refresh ─────────────────────────────────────────────────────────
  const refreshIntervalMins = Number(
    (dashboard?.theme as Record<string, unknown> | undefined)?.refresh_interval_mins ?? 0
  );
  useEffect(() => {
    if (!refreshIntervalMins || refreshIntervalMins <= 0) return;
    const ms = refreshIntervalMins * 60 * 1000;
    const timer = setInterval(() => {
      tiles
        .filter((t) => t.tile_type === "chart" || t.tile_type === "metric")
        .forEach((t) => void handleTileRefresh(t.id));
    }, ms);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshIntervalMins, id]);

  const handlePrint = () => {
    // Capture each ECharts canvas in document order, then build a print-optimised
    // popup that replaces charts with their PNG snapshots.  Falls back to
    // window.print() if the popup is blocked.
    const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>(".react-grid-layout canvas"));
    const snapshots = canvases.map((c) => {
      try { return c.toDataURL("image/png"); }
      catch { return null; }
    });

    const primaryCol = primaryColor;
    const dashName = dashboard?.name ?? "Dashboard";

    const tileBlocks = tiles.map((tile) => {
      const tt = tile.tile_type ?? "chart";
      if (tt === "divider") return `<hr style="border:none;border-top:1px solid #ccc;margin:8px 0;">`;
      if (tt === "heading") {
        const lvl = Number((tile.query_spec as Record<string, unknown>).level ?? 1);
        const text = String((tile.query_spec as Record<string, unknown>).text ?? tile.title);
        return `<h${lvl} style="margin:12px 0 4px;color:#1e293b;">${text}</h${lvl}>`;
      }
      if (tt === "text") {
        return `<p style="font-size:13px;color:#334155;margin:0 0 12px;">${String((tile.query_spec as Record<string, unknown>).text ?? "")}</p>`;
      }
      if (tt === "metric") {
        return `<div style="display:inline-block;border:1px solid #e2e8f0;border-radius:8px;padding:12px 20px;margin:4px;min-width:160px;text-align:center;"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">${tile.metric_label ?? tile.title}</div><div style="font-size:24px;font-weight:700;color:#1e293b;margin-top:4px;">${tile.metric_value ?? "—"}</div></div>`;
      }
      // chart or table — try to use captured canvas snapshot
      const cfg = tile.echarts_config as Record<string, unknown> | null;
      if (cfg && Object.keys(cfg).length > 0 && snapshots.length > 0) {
        const img = snapshots.shift() ?? null;
        if (img) return `<div style="margin:8px 0;page-break-inside:avoid;"><div style="font-size:11px;color:#64748b;font-weight:600;margin-bottom:4px;">${tile.title}</div><img src="${img}" style="width:100%;border-radius:6px;border:1px solid #e2e8f0;" /></div>`;
      }
      return `<div style="margin:8px 0;padding:20px;border:1px dashed #e2e8f0;border-radius:6px;font-size:12px;color:#94a3b8;text-align:center;">${tile.title} — chart data not captured</div>`;
    });

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${dashName}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#1e293b;max-width:900px;margin:0 auto;} h1{font-size:20px;margin:0 0 4px;} .subtitle{font-size:12px;color:#64748b;margin-bottom:20px;} @media print{@page{margin:16mm;}}</style>
</head><body>
<h1 style="color:${primaryCol};">${dashName}</h1>
<div class="subtitle">Exported ${new Date().toLocaleDateString()}</div>
${tileBlocks.join("\n")}
</body></html>`;

    const win = window.open("", "_blank", "width=960,height=700");
    if (!win) { window.print(); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  if (loading) {
    return (
      <main style={{ padding: 32, color: "#94A3B8", textAlign: "center" }}>Loading dashboard…</main>
    );
  }

  if (error || !dashboard) {
    return (
      <main style={{ padding: 32, color: "#EF4444", textAlign: "center" }}>{error ?? "Dashboard not found"}</main>
    );
  }

  const theme = (dashboard.theme ?? {}) as Record<string, unknown>;
  const primaryColor = String(theme.primary ?? "#5B6AF0");
  const showBranding = theme.show_branding !== false;

  return (
    <>
      {/* Print + RGL CSS */}
      <style>{`
        @media print { .no-print { display: none !important; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .react-resizable-handle { opacity: 0.3; filter: invert(1); }
        .react-resizable-handle:hover { opacity: 0.8; }
        .react-grid-item.react-grid-placeholder { background: #5B6AF0 !important; opacity: 0.12 !important; border-radius: 10px !important; }
      `}</style>

      {/* Realtime toast */}
      {toastMessage && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1e2030", border: "1px solid #5B6AF0", color: "#fff", padding: "10px 20px", borderRadius: 8, fontSize: 13, zIndex: 9999, whiteSpace: "nowrap" }}>
          {toastMessage}
        </div>
      )}
      {refreshFailed && (
        <div style={{ position: "fixed", bottom: 64, left: "50%", transform: "translateX(-50%)", background: "#1e2030", border: "1px solid #f87171", color: "#f87171", padding: "8px 16px", borderRadius: 8, fontSize: 12, zIndex: 9999 }}>
          ⚠ Last pipeline run failed — showing previous data
        </div>
      )}

      <main style={{ minHeight: "100%", background: "var(--bg0)", color: "var(--tx0)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <header
          className="no-print"
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid #1E293B",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          {/* Back to workspace */}
          <button
            onClick={() => navigate(-1)}
            title="Back to workspace"
            style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", padding: "4px 6px", borderRadius: 6, fontSize: 16, lineHeight: 1, flexShrink: 0, display: "flex", alignItems: "center" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#94A3B8"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#475569"; }}
          >
            ←
          </button>

          <div style={{ width: 1, height: 20, background: "#1E293B", flexShrink: 0 }} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#E2E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {dashboard.name}
            </h1>
            {dashboard.description && (
              <p style={{ margin: 0, fontSize: 11, color: "#64748B", marginTop: 1 }}>{dashboard.description}</p>
            )}
          </div>

          {crossFilter && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(91,106,240,0.12)", border: "1px solid rgba(91,106,240,0.35)", borderRadius: 6, padding: "3px 10px", flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "#818CF8" }}>🔍 Filtered: <strong>{crossFilter.value}</strong></span>
              <button onClick={() => setCrossFilter(null)} title="Clear filter" style={{ background: "none", border: "none", color: "#818CF8", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
            </div>
          )}
          {dashboard.updated_at && (
            <span style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap" }}>
              Updated {timeAgo(dashboard.updated_at)}
            </span>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            {/* Export dropdown */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowExportMenu((p) => !p)}
                style={headerBtnStyle}
                title="Export"
              >
                ⬇ Export
              </button>
              {showExportMenu && (
                <>
                  {/* Click-away backdrop */}
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 299 }}
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      zIndex: 300,
                      background: "#0F1117",
                      border: "1px solid #1E293B",
                      borderRadius: 10,
                      padding: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      minWidth: 180,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    <button
                      onClick={() => { setShowExportMenu(false); handlePrint(); }}
                      style={exportMenuItemStyle}
                    >
                      🖨 Print / Save as PDF
                    </button>
                    <button
                      onClick={() => { setShowExportMenu(false); exportDashboardCSV(dashboard.name, tiles); }}
                      style={exportMenuItemStyle}
                    >
                      📊 Export chart data (CSV)
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setFilterBarVisible((p) => !p)}
              style={{
                ...headerBtnStyle,
                background: filterBarVisible ? "rgba(91,106,240,0.15)" : undefined,
                color: filterBarVisible ? "#818CF8" : undefined,
                borderColor: (filterBarVisible || activeFilters.length > 0) ? "rgba(91,106,240,0.4)" : undefined,
              }}
              title="Toggle filter bar"
            >
              {activeFilters.length > 0 ? `⧩ Filters (${activeFilters.length})` : "⧩ Filter"}
            </button>
            <button onClick={() => setShowShare(true)} style={headerBtnStyle} title="Share">🔗 Share</button>
            <button onClick={() => setShowSettings(true)} style={headerBtnStyle} title="Settings">⚙</button>
            <button
              onClick={() => setShowGenerateModal(true)}
              style={{ ...headerBtnStyle, color: "#818CF8", borderColor: "rgba(129,140,248,0.3)" }}
              title="Generate layout with AI"
            >
              ✦ Generate
            </button>
            {editMode && tiles.length > 1 && (
              <button
                onClick={() => void handleAutoArrange()}
                disabled={autoArranging}
                style={{ ...headerBtnStyle, color: autoArranging ? "#5B6AF0" : "#94A3B8" }}
                title="Auto-arrange tiles with AI"
              >
                {autoArranging ? (
                  <span style={{ display: "inline-block", animation: "spin 0.8s linear infinite" }}>⟳</span>
                ) : "⊞ Arrange"}
              </button>
            )}
            {editMode && (
              <button onClick={() => setShowContentEditor(true)} style={{ ...headerBtnStyle, color: "#818CF8" }} title="Add content block">✦ Add</button>
            )}            <button
              onClick={() => setEditMode((p) => !p)}
              style={{ ...headerBtnStyle, background: editMode ? primaryColor : undefined, color: editMode ? "#fff" : undefined }}
            >
              {editMode ? "✓ Done" : "✎ Edit"}
            </button>
          </div>
        </header>

        {/* Filter bar */}
        {filterBarVisible && (
          <DashboardFilterBar
            columns={availableColumns}
            filters={activeFilters}
            onChange={setActiveFilters}
          />
        )}

        {/* Tiles grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {tiles.length === 0 ? (
            <div style={{ maxWidth: 480, margin: "60px auto 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
              {/* Empty illustration */}
              <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(91,106,240,0.1)", border: "1px solid rgba(91,106,240,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
                📊
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#E2E8F0" }}>
                  Dashboard is empty
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>
                  Generate a full layout with AI, pick a template, or add individual tiles manually.
                </p>
              </div>
              {/* Primary CTA */}
              <button
                onClick={() => setShowGenerateModal(true)}
                style={{
                  border: "1px solid rgba(129,140,248,0.4)",
                  borderRadius: 12,
                  background: "rgba(91,106,240,0.1)",
                  color: "#818CF8",
                  padding: "12px 28px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                ✦ Generate with AI
              </button>
              {/* Secondary options */}
              <div style={{ display: "flex", gap: 10, width: "100%" }}>
                <button
                  onClick={() => { setEditMode(true); setShowContentEditor(true); }}
                  style={{ flex: 1, border: "1px solid #1E293B", borderRadius: 10, background: "transparent", color: "#94A3B8", padding: "9px 0", fontSize: 12, cursor: "pointer", fontWeight: 500 }}
                >
                  + Add content tile
                </button>
                <button
                  onClick={() => setEditMode(true)}
                  style={{ flex: 1, border: "1px solid #1E293B", borderRadius: 10, background: "transparent", color: "#94A3B8", padding: "9px 0", fontSize: 12, cursor: "pointer", fontWeight: 500 }}
                >
                  ✎ Edit mode
                </button>
              </div>
            </div>
          ) : (
            <ResponsiveGridLayout
              className="layout"
              layout={rglLayout}
              cols={12}
              rowHeight={60}
              isDraggable={editMode}
              isResizable={editMode}
              onLayoutChange={handleLayoutChange}
              margin={[12, 12]}
              compactType="vertical"
              draggableHandle=".tile-drag-handle"
            >
              {tiles.map((tile) => (
                <div key={tile.id} style={{ overflow: "hidden", borderRadius: 10 }}>
                  <TileCard
                    tile={tile}
                    editMode={editMode}
                    onDelete={(tileId) => void handleDeleteTile(tileId)}
                    onTitleEdit={(tileId, title) => void handleTitleEdit(tileId, title)}
                    onRefresh={(tileId) => void handleTileRefresh(tileId)}
                    onEdit={(t) => setEditingTile(t)}
                    refreshing={refreshingTiles.has(tile.id)}
                    crossFilter={crossFilter}
                    onCrossFilter={handleCrossFilter}
                    onChartTypeChange={(tileId, chartType) => void handleChartTypeChange(tileId, chartType)}
                    activeFilters={activeFilters}
                  />
                </div>
              ))}
            </ResponsiveGridLayout>
          )}

          {showBranding && (
            <footer style={{ textAlign: "center", padding: "12px 0", color: "#334155", fontSize: 11 }}>
              Powered by <strong style={{ color: "#5B6AF0" }}>datahub.org.in</strong>
            </footer>
          )}
        </div>

        {/* Comments thread */}
        {id && <DashboardComments dashboardId={id} />}
      </main>

      {showSettings && (
        <SettingsOverlay
          dashboard={dashboard}
          onSave={(update) => void handleSaveSettings(update)}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showShare && id && (
        <SharePanel
          dashboardId={id}
          shareToken={dashboard.share_token ?? null}
          onClose={() => setShowShare(false)}
        />
      )}

      {showContentEditor && (
        <ContentTileEditor
          onSave={(data) => void handleAddContent(data)}
          onClose={() => setShowContentEditor(false)}
        />
      )}

      {showGenerateModal && id && (
        <DashboardGenerateModal
          dashboardId={id}
          onGenerated={(updatedDashboard) => {
            setTiles(updatedDashboard.tiles);
            setRglLayout(buildAutoLayout(updatedDashboard.tiles));
            setShowGenerateModal(false);
          }}
          onClose={() => setShowGenerateModal(false)}
        />
      )}

      {editingTile && (
        <TileEditModal
          tile={editingTile}
          onSave={(patch) => void handleTileEdit(editingTile.id, patch)}
          onClose={() => setEditingTile(null)}
        />
      )}
    </>
  );
}

const headerBtnStyle: CSSProperties = {
  border: "1px solid #1E293B",
  borderRadius: 8,
  background: "transparent",
  color: "#94A3B8",
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const exportMenuItemStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#94A3B8",
  padding: "8px 12px",
  fontSize: 12,
  cursor: "pointer",
  borderRadius: 7,
  textAlign: "left",
  width: "100%",
  whiteSpace: "nowrap",
};

// ---------- TileEditModal ----------

function TileEditModal({
  tile,
  onSave,
  onClose,
}: {
  tile: DashboardV2Tile;
  onSave: (patch: Partial<DashboardV2Tile>) => void;
  onClose: () => void;
}) {
  const tileType = tile.tile_type ?? "chart";
  const [title, setTitle] = useState(tile.title);

  // metric fields
  const [metricLabel, setMetricLabel] = useState(tile.metric_label ?? "");
  const [metricValue, setMetricValue] = useState(String(tile.metric_value ?? ""));
  const [metricTrend, setMetricTrend] = useState<string>(tile.metric_trend ?? "neutral");
  const [deltaPct, setDeltaPct] = useState(tile.delta_pct != null ? String(tile.delta_pct) : "");
  const [sparklineRaw, setSparklineRaw] = useState(
    Array.isArray(tile.sparkline_data) ? (tile.sparkline_data as number[]).join(", ") : ""
  );

  // text / heading / image fields
  const [contentText, setContentText] = useState(
    String((tile.query_spec as Record<string, unknown> | null)?.text ?? "")
  );
  const [imageUrl, setImageUrl] = useState(
    String((tile.query_spec as Record<string, unknown> | null)?.url ?? "")
  );

  // chart query hint
  const [queryHint, setQueryHint] = useState(
    String((tile.query_spec as Record<string, unknown> | null)?.query_hint ?? "")
  );

  const handleSave = () => {
    const patch: Partial<DashboardV2Tile> = { title: title.trim() || tile.title };

    if (tileType === "metric") {
      if (metricLabel) patch.metric_label = metricLabel;
      if (metricValue) patch.metric_value = metricValue;
      patch.metric_trend = metricTrend;
      const dp = parseFloat(deltaPct);
      patch.delta_pct = isNaN(dp) ? null : dp;
      const spNums = sparklineRaw
        .split(/[,\s]+/)
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n));
      patch.sparkline_data = spNums.length >= 2 ? spNums : undefined;
    } else if (tileType === "text" || tileType === "heading") {
      patch.query_spec = {
        ...((tile.query_spec as Record<string, unknown>) ?? {}),
        text: contentText,
      };
    } else if (tileType === "image") {
      patch.query_spec = {
        ...((tile.query_spec as Record<string, unknown>) ?? {}),
        url: imageUrl,
      };
    } else {
      // chart / table — update query hint only
      patch.query_spec = {
        ...((tile.query_spec as Record<string, unknown>) ?? {}),
        query_hint: queryHint,
      };
    }

    onSave(patch);
  };

  const labelStyle: CSSProperties = { fontSize: 12, color: "#94A3B8", fontWeight: 600, marginBottom: 4 };
  const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: 440,
          maxWidth: "calc(100vw - 32px)",
          background: "#0F1117",
          border: "1px solid #1E293B",
          borderRadius: 14,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#E2E8F0" }}>Edit tile</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Title */}
        <div style={fieldStyle}>
          <span style={labelStyle}>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </div>

        {/* Metric fields */}
        {tileType === "metric" && (
          <>
            <div style={fieldStyle}>
              <span style={labelStyle}>Metric label</span>
              <input value={metricLabel} onChange={(e) => setMetricLabel(e.target.value)} style={inputStyle} placeholder={tile.title} />
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>Value</span>
              <input value={metricValue} onChange={(e) => setMetricValue(e.target.value)} style={inputStyle} placeholder="e.g. 1,234" />
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>Trend</span>
              <select
                value={metricTrend}
                onChange={(e) => setMetricTrend(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="neutral">Neutral →</option>
                <option value="up">Up ↑</option>
                <option value="down">Down ↓</option>
              </select>
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>Delta % (optional)</span>
              <input
                value={deltaPct}
                onChange={(e) => setDeltaPct(e.target.value)}
                style={inputStyle}
                placeholder="e.g. 12.5 for +12.5%"
                type="number"
                step="0.1"
              />
            </div>
            <div style={fieldStyle}>
              <span style={labelStyle}>Sparkline data (comma-separated numbers, min 2)</span>
              <input
                value={sparklineRaw}
                onChange={(e) => setSparklineRaw(e.target.value)}
                style={inputStyle}
                placeholder="e.g. 10, 14, 12, 18, 22"
              />
            </div>
          </>
        )}

        {/* Text / heading */}
        {(tileType === "text" || tileType === "heading") && (
          <div style={fieldStyle}>
            <span style={labelStyle}>Content</span>
            <textarea
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              rows={tileType === "heading" ? 2 : 5}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        )}

        {/* Image */}
        {tileType === "image" && (
          <div style={fieldStyle}>
            <span style={labelStyle}>Image URL</span>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={inputStyle} placeholder="https://..." />
          </div>
        )}

        {/* Chart / table — query hint */}
        {(tileType === "chart" || tileType === "table") && (
          <div style={fieldStyle}>
            <span style={labelStyle}>Query hint (shown when no data)</span>
            <input value={queryHint} onChange={(e) => setQueryHint(e.target.value)} style={inputStyle} placeholder="e.g. Show revenue by month" />
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSave} style={primaryBtnStyle}>Save</button>
        </div>
      </div>
    </div>
  );
}
