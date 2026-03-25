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
 */
import { useEffect, useRef, useState } from "react";
import ReactGridLayout, { type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { CanvasTileItem, SavedVisualization } from "../api";
import { EChartsRenderer } from "./EChartsRenderer";

const COLS = 12;
const ROW_H = 80;
const HEADER_H = 28;
const MIN_GRID_H = 600;

interface CanvasGridProps {
  tiles: CanvasTileItem[];
  onChange: (tiles: CanvasTileItem[]) => void;
}

// Describe the ghost item shown while dragging an external viz over the grid
const DROPPING_ITEM = { i: "__dropping__", w: 4, h: 4, minW: 2, minH: 2 };

export function CanvasGrid({ tiles, onChange }: CanvasGridProps) {
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
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
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
        style={{ minHeight: MIN_GRID_H }}
      >
        {tiles.map((tile) => {
          // Explicit pixel height so ECharts canvas gets a real size
          const chartH = Math.max(60, tile.h * ROW_H - HEADER_H);

          return (
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

            {/* tile body — explicit pixel height so ECharts can size its canvas */}
            <div style={{ height: chartH, overflow: "hidden", flexShrink: 0 }}>
              {tile.type === "text" ? (
                <p style={{ padding: 8, fontSize: 12, color: "var(--tx)" }}>
                  {tile.text_content ?? ""}
                </p>
              ) : tile.echarts_config ? (
                <EChartsRenderer
                  config={tile.echarts_config}
                  height={chartH}
                />
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
  );
}
