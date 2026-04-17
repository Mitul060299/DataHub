/**
 * CanvasGrid — react-grid-layout drop zone for canvas tiles.
 *
 * Fixes:
 *  1. Empty-state overlay uses position:absolute + pointerEvents:none so
 *     drag events still reach ReactGridLayout underneath.
 *  2. ReactGridLayout always has minHeight:600px so there is always a
 *     droppable hit-area even when the tile list is empty.
 *  3. Chart height is computed in pixels (tile.h * ROW_H - HEADER_H) so
 *     ECharts canvas gets a concrete size, not "100%" which resolves to 0
 *     inside a flex child with minHeight:0.
 *  4. handleDrop computes nextY so new drops never stack on row 0.
 *  5. Text tiles have a formatting toolbar (size, bold, italic, color).
 *  6. KPI and Slicer tiles are inline-editable.
 */
import { useEffect, useRef, useState } from "react";
import ReactGridLayout, { type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { CanvasTileItem, SavedVisualization } from "../api";
import { fetchTileData } from "../api";
import type { DatasetMeta } from "../types";
import { EChartsRenderer } from "./EChartsRenderer";
import { ErrorBoundary } from "./ErrorBoundary";

const COLS = 12;
const ROW_H = 80;
const HEADER_H = 28;
const MIN_GRID_H = 1200;

interface CanvasGridProps {
  tiles: CanvasTileItem[];
  onChange: (tiles: CanvasTileItem[]) => void;
  availableDatasets: DatasetMeta[];
}

const selectStyle: React.CSSProperties = {
  background: "var(--bg1)",
  border: "1px solid var(--bd)",
  borderRadius: 6,
  color: "var(--tx)",
  padding: "4px 6px",
  fontSize: 11,
  width: "100%",
  cursor: "pointer",
};

// Describe the ghost item shown while dragging an external viz over the grid
const DROPPING_ITEM = { i: "__dropping__", w: 6, h: 4, minW: 2, minH: 2 };

export function CanvasGrid({ tiles, onChange, availableDatasets }: CanvasGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  // Use ResizeObserver so RGL always gets a real pixel width, not a stale snapshot
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth || 900);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Convert tiles to react-grid-layout Layout items
  const layout: Layout[] = tiles.map((t) => ({
    i: t.id,
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
    minW: 2,
    minH: 2,
  }));

  const handleLayoutChange = (newLayout: Layout[]) => {
    const updated = tiles.map((tile) => {
      const item = newLayout.find((l) => l.i === tile.id);
      if (!item) return tile;
      return { ...tile, x: item.x, y: item.y, w: item.w, h: item.h };
    });
    onChange(updated);
  };

  const handleDrop = (_layout: Layout[], item: Layout, e: Event) => {
    const de = e as DragEvent;
    const raw = de.dataTransfer?.getData("viz_config");
    if (!raw) return;
    try {
      const viz: SavedVisualization = JSON.parse(raw);
      // Compute next available y so tiles don't stack on row 0
      const nextY = tiles.length > 0
        ? Math.max(...tiles.map((t) => t.y + t.h))
        : 0;
      const dropY = (item.y != null && item.y > 0) ? item.y : nextY;
      const newTile: CanvasTileItem = {
        id: crypto.randomUUID(),
        viz_id: viz.id,
        x: item.x ?? 0,
        y: dropY,
        w: item.w || 6,
        h: item.h || 4,
        type: "chart",
        title: viz.name,
        chart_type: viz.chart_type,
        echarts_config: viz.echarts_config,
      };
      onChange([...tiles, newTile]);
    } catch {
      // malformed drag data — ignore
    }
  };

  const removeTile = (id: string) => {
    onChange(tiles.filter((t) => t.id !== id));
  };

  // Live KPI values, slicer options, and per-tile errors
  const [kpiValues, setKpiValues] = useState<Record<string, string>>({});
  const [slicerOptions, setSlicerOptions] = useState<Record<string, string[]>>({});
  const [tileErrors, setTileErrors] = useState<Record<string, string>>({});

  const setError = (id: string, msg: string) =>
    setTileErrors((prev) => ({ ...prev, [id]: msg }));
  const clearError = (id: string) =>
    setTileErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });

  // Re-fetch only when the set of fully-configured KPI/Slicer tiles changes
  const configuredTileKey = tiles
    .filter(
      (t) =>
        (t.type === "kpi" && t.kpi_dataset_id && t.kpi_column && t.kpi_aggregation) ||
        (t.type === "slicer" && t.slicer_dataset_id && t.slicer_column),
    )
    .map((t) => `${t.id}:${t.kpi_dataset_id ?? ""}:${t.kpi_column ?? ""}:${t.kpi_aggregation ?? ""}:${t.slicer_dataset_id ?? ""}:${t.slicer_column ?? ""}`)
    .join("|");

  useEffect(() => {
    tiles.forEach((tile) => {
      if (tile.type === "kpi" && tile.kpi_dataset_id && tile.kpi_column && tile.kpi_aggregation) {
        clearError(tile.id);
        fetchTileData(tile.kpi_dataset_id, tile.kpi_column, tile.kpi_aggregation)
          .then((result) => {
            if (result.type === "aggregate") {
              setKpiValues((prev) => ({ ...prev, [tile.id]: result.value }));
            }
          })
          .catch((err: unknown) => {
            const msg =
              (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
              "Failed to load value";
            setKpiValues((prev) => ({ ...prev, [tile.id]: "—" }));
            setError(tile.id, msg);
          });
      }
      if (tile.type === "slicer" && tile.slicer_dataset_id && tile.slicer_column) {
        clearError(tile.id);
        fetchTileData(tile.slicer_dataset_id, tile.slicer_column, "DISTINCT")
          .then((result) => {
            if (result.type === "distinct") {
              setSlicerOptions((prev) => ({ ...prev, [tile.id]: result.values }));
              // Persist fetched options so Save Layout captures them
              const existing = tiles.find((t) => t.id === tile.id);
              if (
                existing &&
                JSON.stringify(existing.slicer_options) !== JSON.stringify(result.values)
              ) {
                onChange(
                  tiles.map((t) =>
                    t.id === tile.id ? { ...t, slicer_options: result.values } : t,
                  ),
                );
              }
            }
          })
          .catch((err: unknown) => {
            const msg =
              (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
              "Failed to load options";
            setError(tile.id, msg);
          });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredTileKey]);

  return (
    <>
    <style>{`.text-tile:hover .text-tile-handle { opacity: 1 !important; }`}</style>
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        height: "100%",
        overflow: "auto",
        background: "var(--bg1)",
        position: "relative",
      }}
    >
      {/* Empty-state hint — pointer-events:none lets drags reach RGL underneath */}
      {tiles.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            color: "var(--tx1)",
            userSelect: "none",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <span style={{ fontSize: 32 }}>🖼</span>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Drop visualizations here</p>
          <p style={{ margin: 0, fontSize: 11 }}>Drag charts from the Visualizations panel on the left</p>
        </div>
      )}

      <ReactGridLayout
        className="layout"
        layout={layout}
        cols={COLS}
        rowHeight={ROW_H}
        width={containerWidth}
        isDraggable
        isResizable
        isDroppable
        droppingItem={DROPPING_ITEM}
        onLayoutChange={handleLayoutChange}
        onDrop={handleDrop}
        style={{ minHeight: MIN_GRID_H, paddingBottom: 200 }}
      >
        {tiles.map((tile) => {
          // Explicit pixel height so ECharts canvas gets a real size
          const chartH = Math.max(60, tile.h * ROW_H - HEADER_H);

          return (
          <div
            key={tile.id}
            className={tile.type === "text" ? "text-tile" : undefined}
            style={{
              background: tile.type === "text" ? "transparent" : "var(--bg2)",
              border: tile.type === "text" ? "none" : "1px solid var(--bd)",
              borderRadius: 8,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {tile.type === "text" ? (
              /* invisible drag handle for text tiles — reveals on hover via CSS */
              <div
                className="text-tile-handle"
                style={{
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  padding: "0 4px",
                  opacity: 0,
                  transition: "opacity 120ms",
                  flexShrink: 0,
                  cursor: "move",
                }}
              >
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => removeTile(tile.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--tx1)",
                    fontSize: 13,
                    padding: "2px 4px",
                  }}
                >×</button>
              </div>
            ) : (
              /* standard tile header for chart / kpi / slicer */
              <div
                style={{
                  height: 28,
                  padding: "0 8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid var(--bd)",
                  background: "var(--bg1)",
                  flexShrink: 0,
                  cursor: "move",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--tx)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {tile.title ?? "Chart"}
                </span>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => removeTile(tile.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--tx1)",
                    fontSize: 13,
                    lineHeight: 1,
                    padding: "2px 4px",
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            )}

            {/* tile body — explicit pixel height so ECharts can size its canvas */}
            <div style={{ height: chartH, overflow: "hidden", flexShrink: 0 }}>
              {tile.type === "text" ? (
                <div style={{ padding: "0 10px 8px", height: "100%", display: "flex", flexDirection: "column", gap: 4 }}>
                  {/* formatting toolbar */}
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}
                  >
                    <select
                      defaultValue={tile.text_size ?? "body"}
                      onChange={(e) => {
                        const updated = tiles.map((t) =>
                          t.id === tile.id ? { ...t, text_size: e.target.value } : t
                        );
                        onChange(updated);
                      }}
                      style={{
                        background: "var(--bg1)", border: "1px solid var(--bd)", borderRadius: 4,
                        color: "var(--tx)", fontSize: 10, padding: "2px 4px", cursor: "pointer",
                      }}
                    >
                      <option value="h1">H1</option>
                      <option value="h2">H2</option>
                      <option value="h3">H3</option>
                      <option value="body">Body</option>
                      <option value="small">Small</option>
                    </select>
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        const updated = tiles.map((t) =>
                          t.id === tile.id ? { ...t, text_bold: !t.text_bold } : t
                        );
                        onChange(updated);
                      }}
                      style={{
                        background: tile.text_bold ? "var(--ac)" : "var(--bg1)",
                        border: "1px solid var(--bd)", borderRadius: 4,
                        color: tile.text_bold ? "#fff" : "var(--tx)",
                        fontWeight: 700, fontSize: 11, width: 22, height: 22,
                        cursor: "pointer", padding: 0,
                      }}
                    >B</button>
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        const updated = tiles.map((t) =>
                          t.id === tile.id ? { ...t, text_italic: !t.text_italic } : t
                        );
                        onChange(updated);
                      }}
                      style={{
                        background: tile.text_italic ? "var(--ac)" : "var(--bg1)",
                        border: "1px solid var(--bd)", borderRadius: 4,
                        color: tile.text_italic ? "#fff" : "var(--tx)",
                        fontStyle: "italic", fontSize: 11, width: 22, height: 22,
                        cursor: "pointer", padding: 0,
                      }}
                    >I</button>
                    <input
                      type="color"
                      defaultValue={tile.text_color ?? "#F0F2FF"}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const updated = tiles.map((t) =>
                          t.id === tile.id ? { ...t, text_color: e.target.value } : t
                        );
                        onChange(updated);
                      }}
                      style={{
                        width: 22, height: 22, border: "1px solid var(--bd)",
                        borderRadius: 4, background: "none", padding: 1, cursor: "pointer",
                      }}
                      title="Text color"
                    />
                  </div>
                  <textarea
                    defaultValue={tile.text_content ?? ""}
                    onMouseDown={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      const updated = tiles.map((t) =>
                        t.id === tile.id ? { ...t, text_content: e.target.value } : t
                      );
                      onChange(updated);
                    }}
                    placeholder="Type heading or label…"
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      resize: "none",
                      color: tile.text_color ?? "var(--tx)",
                      fontSize: tile.text_size === "h1" ? 28
                        : tile.text_size === "h2" ? 22
                        : tile.text_size === "h3" ? 17
                        : tile.text_size === "small" ? 10
                        : 13,
                      fontWeight: tile.text_bold ? 700 : 400,
                      fontStyle: tile.text_italic ? "italic" : "normal",
                      fontFamily: "inherit",
                      lineHeight: 1.4,
                    }}
                  />
                </div>
              ) : tile.type === "kpi" ? (
                /* KPI — config panel until dataset + column + aggregation are all chosen */
                (!tile.kpi_dataset_id || !tile.kpi_column || !tile.kpi_aggregation) ? (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6, overflow: "auto", height: "100%" }}
                  >
                    <span style={{ fontSize: 10, color: "var(--tx1)", fontWeight: 600 }}>Configure KPI</span>
                    <select
                      value={tile.kpi_dataset_id ?? ""}
                      onChange={(e) => {
                        onChange(tiles.map((t) =>
                          t.id === tile.id ? { ...t, kpi_dataset_id: e.target.value || undefined, kpi_column: undefined, kpi_aggregation: undefined } : t
                        ));
                      }}
                      style={selectStyle}
                    >
                      <option value="">Select dataset…</option>
                      {availableDatasets.map((ds) => (
                        <option key={ds.dataset_id} value={ds.dataset_id}>{ds.name ?? ds.dataset_id}</option>
                      ))}
                    </select>
                    {tile.kpi_dataset_id && (
                      <select
                        value={tile.kpi_column ?? ""}
                        onChange={(e) => {
                          // auto-default aggregation to SUM so tile is ready to display immediately
                          onChange(tiles.map((t) =>
                            t.id === tile.id
                              ? { ...t, kpi_column: e.target.value || undefined, kpi_aggregation: (e.target.value ? (t.kpi_aggregation ?? "SUM") : undefined) as "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | undefined }
                              : t
                          ));
                        }}
                        style={selectStyle}
                      >
                        <option value="">Select column…</option>
                        {(availableDatasets.find((d) => d.dataset_id === tile.kpi_dataset_id)?.columns ?? []).map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    )}
                    {tile.kpi_column && (
                      <select
                        value={tile.kpi_aggregation ?? "SUM"}
                        onChange={(e) => {
                          onChange(tiles.map((t) =>
                            t.id === tile.id
                              ? { ...t, kpi_aggregation: e.target.value as "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" }
                              : t
                          ));
                        }}
                        style={selectStyle}
                      >
                        <option value="SUM">SUM — total</option>
                        <option value="AVG">AVG — average</option>
                        <option value="COUNT">COUNT — row count</option>
                        <option value="MIN">MIN — minimum</option>
                        <option value="MAX">MAX — maximum</option>
                      </select>
                    )}
                  </div>
                ) : (
                  /* KPI — live display */
                  <div
                    style={{
                      height: "100%", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", padding: 12, gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 32, fontWeight: 700, color: tileErrors[tile.id] ? "#ef4444" : "#5B6AF0", lineHeight: 1 }}>
                      {kpiValues[tile.id] ?? "…"}
                    </span>
                    {tileErrors[tile.id] ? (
                      <span style={{ fontSize: 10, color: "#ef4444", textAlign: "center" }}>
                        {tileErrors[tile.id]}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--tx1)", textAlign: "center" }}>
                        {tile.kpi_aggregation} of {tile.kpi_column}
                      </span>
                    )}
                    {tile.kpi_label && !tileErrors[tile.id] && (
                      <span style={{ fontSize: 10, color: "var(--tx1)", opacity: 0.6 }}>
                        {tile.kpi_label}
                      </span>
                    )}
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        onChange(tiles.map((t) =>
                          t.id === tile.id ? { ...t, kpi_dataset_id: undefined, kpi_column: undefined, kpi_aggregation: undefined } : t
                        ));
                        clearError(tile.id);
                      }}
                      style={{
                        marginTop: 4, background: "none", border: "1px solid var(--bd)",
                        borderRadius: 4, color: "var(--tx1)", fontSize: 9,
                        padding: "2px 6px", cursor: "pointer",
                      }}
                    >✎ reconfigure</button>
                  </div>
                )
              ) : tile.type === "slicer" ? (
                /* Slicer — config panel until dataset + column are chosen */
                (!tile.slicer_dataset_id || !tile.slicer_column) ? (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6, overflow: "auto", height: "100%" }}
                  >
                    <span style={{ fontSize: 10, color: "var(--tx1)", fontWeight: 600 }}>Configure Filter</span>
                    <select
                      value={tile.slicer_dataset_id ?? ""}
                      onChange={(e) => {
                        onChange(tiles.map((t) =>
                          t.id === tile.id ? { ...t, slicer_dataset_id: e.target.value || undefined, slicer_column: undefined } : t
                        ));
                      }}
                      style={selectStyle}
                    >
                      <option value="">Select dataset…</option>
                      {availableDatasets.map((ds) => (
                        <option key={ds.dataset_id} value={ds.dataset_id}>{ds.name ?? ds.dataset_id}</option>
                      ))}
                    </select>
                    {tile.slicer_dataset_id && (
                      <select
                        value={tile.slicer_column ?? ""}
                        onChange={(e) => {
                          onChange(tiles.map((t) =>
                            t.id === tile.id ? { ...t, slicer_column: e.target.value || undefined } : t
                          ));
                        }}
                        style={selectStyle}
                      >
                        <option value="">Select column to filter by…</option>
                        {(availableDatasets.find((d) => d.dataset_id === tile.slicer_dataset_id)?.columns ?? []).map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  /* Slicer — live dropdown with auto-populated options */
                  <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
                    <span style={{ fontSize: 11, color: "var(--tx1)", fontWeight: 600 }}>
                      {tile.slicer_label || `Filter by ${tile.slicer_column}`}
                    </span>
                    {tileErrors[tile.id] ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 10, color: "#ef4444" }}>{tileErrors[tile.id]}</span>
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            clearError(tile.id);
                            if (tile.slicer_dataset_id && tile.slicer_column) {
                              fetchTileData(tile.slicer_dataset_id, tile.slicer_column, "DISTINCT")
                                .then((result) => {
                                  if (result.type === "distinct") {
                                    setSlicerOptions((prev) => ({ ...prev, [tile.id]: result.values }));
                                  }
                                })
                                .catch((err: unknown) => {
                                  const msg =
                                    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
                                    "Failed to load options";
                                  setError(tile.id, msg);
                                });
                            }
                          }}
                          style={{
                            background: "none", border: "1px solid var(--bd)", borderRadius: 4,
                            color: "var(--tx1)", fontSize: 9, padding: "2px 6px", cursor: "pointer", width: "fit-content",
                          }}
                        >↺ Retry</button>
                      </div>
                    ) : (
                      <select
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          window.dispatchEvent(
                            new CustomEvent("datahub:canvas:filter", {
                              detail: {
                                field: tile.slicer_column,
                                value: e.target.value,
                                dataset_id: tile.slicer_dataset_id,
                              },
                            }),
                          );
                        }}
                        style={{
                          background: "var(--bg1)", border: "1px solid var(--bd)",
                          borderRadius: 6, color: "var(--tx)", padding: "6px 8px",
                          fontSize: 12, width: "100%", cursor: "pointer",
                        }}
                      >
                        <option value="">All</option>
                        {(slicerOptions[tile.id] ?? tile.slicer_options ?? []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        onChange(tiles.map((t) =>
                          t.id === tile.id ? { ...t, slicer_dataset_id: undefined, slicer_column: undefined } : t
                        ));
                        clearError(tile.id);
                      }}
                      style={{
                        background: "none", border: "none", color: "var(--tx1)",
                        fontSize: 9, cursor: "pointer", padding: 0, textAlign: "left",
                      }}
                    >✎ reconfigure</button>
                  </div>
                )
              ) : tile.echarts_config ? (
                <ErrorBoundary fallback={<p style={{ padding: 8, fontSize: 11, color: "var(--rd, #f87171)" }}>Chart render failed</p>}>
                  <EChartsRenderer config={tile.echarts_config} height={chartH} />
                </ErrorBoundary>
              ) : (
                <p style={{ padding: 8, fontSize: 11, color: "var(--tx1)" }}>
                  No chart config
                </p>
              )}
            </div>
          </div>
          );
        })}
      </ReactGridLayout>
    </div>
    </>
  );
}
