/**
 * CanvasGrid
 * ───────────
 * react-grid-layout drop zone for canvas tiles.
 * External visualizations can be dragged from VisualizationsSection and
 * dropped here; the component emits the updated layout via `onChange`.
 */
import { useState } from "react";
import ReactGridLayout, { type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { CanvasTileItem, SavedVisualization } from "../api";
import { EChartsRenderer } from "./EChartsRenderer";

// pixels per column / row unit
const COLS = 12;
const ROW_H = 80;

interface CanvasGridProps {
  tiles: CanvasTileItem[];
  onChange: (tiles: CanvasTileItem[]) => void;
}

// Describe the ghost item shown while dragging an external viz over the grid
const DROPPING_ITEM = { i: "__dropping__", w: 4, h: 4, minW: 2, minH: 2 };

export function CanvasGrid({ tiles, onChange }: CanvasGridProps) {
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
  const containerWidth = containerRef?.offsetWidth ?? 900;

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

  const handleDrop = (_layout: Layout[], item: Layout, e: DragEvent) => {
    const raw = e.dataTransfer?.getData("viz_config");
    if (!raw) return;
    try {
      const viz: SavedVisualization = JSON.parse(raw);
      const newTile: CanvasTileItem = {
        id: crypto.randomUUID(),
        viz_id: viz.id,
        x: item.x,
        y: item.y,
        w: item.w || 4,
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

  return (
    <div
      ref={setContainerRef}
      style={{ flex: 1, minHeight: 0, overflow: "auto", background: "var(--bg1)" }}
    >
      {tiles.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 12,
            color: "var(--tx1)",
            userSelect: "none",
          }}
        >
          <span style={{ fontSize: 32 }}>🖼</span>
          <p style={{ fontSize: 13, fontWeight: 600 }}>Drop visualizations here</p>
          <p style={{ fontSize: 11 }}>
            Drag charts from the Visualizations panel on the left
          </p>
        </div>
      ) : null}

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
        style={{ minHeight: tiles.length === 0 ? "100%" : undefined }}
      >
        {tiles.map((tile) => (
          <div
            key={tile.id}
            style={{
              background: "var(--bg2)",
              border: "1px solid var(--bd)",
              borderRadius: 8,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* tile header */}
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

            {/* tile body */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              {tile.type === "text" ? (
                <p style={{ padding: 8, fontSize: 12, color: "var(--tx)" }}>
                  {tile.text_content ?? ""}
                </p>
              ) : tile.echarts_config ? (
                <EChartsRenderer
                  config={tile.echarts_config}
                  height="100%"
                />
              ) : (
                <p style={{ padding: 8, fontSize: 11, color: "var(--tx1)" }}>
                  No chart config
                </p>
              )}
            </div>
          </div>
        ))}
      </ReactGridLayout>
    </div>
  );
}
