/**
 * DashboardCanvas
 * ───────────────
 * Inline chart canvas shown inside CanvasPanel when mode === "dashboard".
 * Fetches saved visualizations for the project, renders them as draggable
 * and resizable tiles using react-grid-layout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  listVisualizations,
  deleteVisualization,
  type SavedVisualization,
} from "../api";
import { EChartsRenderer } from "./EChartsRenderer";
import { ErrorBoundary } from "./ErrorBoundary";
import { IconBarChart, IconX } from "./Icons";

const ResponsiveGridLayout = WidthProvider(GridLayout);

const LS_KEY = (projectId: string) => `dh:dashboard:layout:${projectId}`;

function buildDefaultLayout(items: SavedVisualization[]): Layout[] {
  return items.map((item, i) => ({
    i: item.id,
    x: (i % 2) * 6,
    y: Math.floor(i / 2) * 5,
    w: 6,
    h: 5,
    minW: 3,
    minH: 3,
  }));
}

interface DashboardCanvasProps {
  projectId: string;
  /** Called when user clicks "Ask AI to create a visualisation" CTA */
  onAskAi?: () => void;
}

export function DashboardCanvas({ projectId, onAskAi }: DashboardCanvasProps) {
  const [items, setItems] = useState<SavedVisualization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY(projectId));
      if (!raw) return [];
      return JSON.parse(raw) as Layout[];
    } catch {
      return [];
    }
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Refs for each tile so we can scroll-to-focus from the left panel list
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    function handleFocusViz(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      const el = tileRefs.current.get(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    window.addEventListener("datahub:dashboard:focus-viz", handleFocusViz);
    return () => window.removeEventListener("datahub:dashboard:focus-viz", handleFocusViz);
  }, []);

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listVisualizations(projectId);
      setItems(data);
      // If no stored layout, build a default one
      setLayout((prev) => {
        if (prev.length > 0) return prev;
        return buildDefaultLayout(data);
      });
    } catch {
      setError("Failed to load visualizations");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // Re-load when AIPanel saves a new chart
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("datahub:visualizations:refresh", handler);
    return () => window.removeEventListener("datahub:visualizations:refresh", handler);
  }, [load]);

  // ── persist layout ─────────────────────────────────────────────────────────
  const persistLayout = useCallback((next: Layout[]) => {
    setLayout(next);
    try { localStorage.setItem(LS_KEY(projectId), JSON.stringify(next)); } catch { /* noop */ }
  }, [projectId]);

  // ── delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this visualization?")) return;
    setDeletingId(id);
    try {
      await deleteVisualization(id);
      setItems((prev) => prev.filter((v) => v.id !== id));
      persistLayout(layout.filter((l) => l.i !== id));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 12, color: "var(--tx2)" }}>Loading visualizations…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <div style={{ fontSize: 12, color: "#f87171" }}>{error}</div>
        <button className="btn" onClick={() => void load()} style={{ fontSize: 11 }}>Retry</button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--bg2)", display: "grid", placeItems: "center", color: "var(--tx2)" }}>
          <IconBarChart size={28} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tx0)", marginBottom: 4 }}>No visualizations yet</div>
          <div style={{ fontSize: 12, color: "var(--tx2)" }}>Ask the AI agent to create one for you</div>
        </div>
        {onAskAi && (
          <button
            className="btn"
            onClick={onAskAi}
            style={{ background: "var(--ac)", color: "#fff", borderColor: "var(--ac)", fontSize: 12, padding: "7px 16px" }}
          >
            Ask AI to create a visualisation
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg1)" }}>
      <ResponsiveGridLayout
        layout={layout}
        cols={12}
        rowHeight={60}
        margin={[8, 8]}
        isDraggable
        isResizable
        onLayoutChange={persistLayout}
        draggableHandle=".canvas-drag-handle"
      >
        {items.map((viz) => (
          <div
            key={viz.id}
            ref={(el) => { if (el) tileRefs.current.set(viz.id, el); else tileRefs.current.delete(viz.id); }}
            style={{
              background: "var(--bg2)",
              border: "1px solid var(--bd)",
              borderRadius: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,.2)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Tile header — drag handle */}
            <div
              className="canvas-drag-handle"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 10px 4px",
                borderBottom: "1px solid var(--bd2)",
                cursor: "grab",
                userSelect: "none",
              }}
            >
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--tx0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {viz.name}
              </span>
              <button
                onClick={() => void handleDelete(viz.id)}
                disabled={deletingId === viz.id}
                title="Delete"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx2)", padding: "2px 4px", lineHeight: 1, borderRadius: 4 }}
              >
                <IconX size={12} />
              </button>
            </div>
            {/* Chart */}
            <div style={{ flex: 1, padding: 10, minHeight: 0 }}>
              <ErrorBoundary fallback={<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--tx2)" }}>Chart unavailable</div>}>
                <EChartsRenderer config={viz.echarts_config} height="100%" />
              </ErrorBoundary>
            </div>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}


const LS_KEY = (projectId: string) => `dh:dashboard:positions:${projectId}`;

type Position = { x: number; y: number };

/** Sanitize a parsed value to a valid Position — guards against tampered localStorage. */
function toPosition(v: unknown): Position {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const p = v as Record<string, unknown>;
    const x = Number(p.x);
    const y = Number(p.y);
    if (isFinite(x) && isFinite(y)) return { x, y };
  }
  return { x: 20, y: 20 };
}

interface DashboardCanvasProps {
  projectId: string;
  /** Called when user clicks "Ask AI to create a visualisation" CTA */
  onAskAi?: () => void;
}

export function DashboardCanvas({ projectId, onAskAi }: DashboardCanvasProps) {
  const [items, setItems] = useState<SavedVisualization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, Position>>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY(projectId));
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const result: Record<string, Position> = {};
      for (const [k, v] of Object.entries(parsed)) {
        result[k] = toPosition(v);
      }
      return result;
    } catch {
      return {};
    }
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Refs for each tile so we can scroll-to-focus from the left panel list
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    function handleFocusViz(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      const el = tileRefs.current.get(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    window.addEventListener("datahub:dashboard:focus-viz", handleFocusViz);
    return () => window.removeEventListener("datahub:dashboard:focus-viz", handleFocusViz);
  }, []);

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listVisualizations(projectId);
      setItems(data);
    } catch {
      setError("Failed to load visualizations");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // Re-load when AIPanel saves a new chart
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("datahub:visualizations:refresh", handler);
    return () => window.removeEventListener("datahub:visualizations:refresh", handler);
  }, [load]);

  // ── drag ──────────────────────────────────────────────────────────────────
  const dragging = useRef<{ id: string; startMouse: Position; startPos: Position } | null>(null);

  const persistPositions = useCallback((next: Record<string, Position>) => {
    setPositions(next);
    try { localStorage.setItem(LS_KEY(projectId), JSON.stringify(next)); } catch { /* noop */ }
  }, [projectId]);

  const handleMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const current = positions[id] ?? { x: 20, y: 20 };
    dragging.current = { id, startMouse: { x: e.clientX, y: e.clientY }, startPos: current };

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - dragging.current.startMouse.x;
      const dy = ev.clientY - dragging.current.startMouse.y;
      const next = {
        ...positions,
        [dragging.current.id]: {
          x: dragging.current.startPos.x + dx,
          y: dragging.current.startPos.y + dy,
        },
      };
      persistPositions(next);
    };
    const onUp = () => {
      dragging.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [positions, persistPositions]);

  // ── delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this visualization?")) return;
    setDeletingId(id);
    try {
      await deleteVisualization(id);
      setItems((prev) => prev.filter((v) => v.id !== id));
      const { [id]: _, ...rest } = positions;
      persistPositions(rest);
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 12, color: "var(--tx2)" }}>Loading visualizations…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <div style={{ fontSize: 12, color: "#f87171" }}>{error}</div>
        <button className="btn" onClick={() => void load()} style={{ fontSize: 11 }}>Retry</button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--bg2)", display: "grid", placeItems: "center", color: "var(--tx2)" }}>
          <IconBarChart size={28} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tx0)", marginBottom: 4 }}>No visualizations yet</div>
          <div style={{ fontSize: 12, color: "var(--tx2)" }}>Ask the AI agent to create one for you</div>
        </div>
        {onAskAi && (
          <button
            className="btn"
            onClick={onAskAi}
            style={{ background: "var(--ac)", color: "#fff", borderColor: "var(--ac)", fontSize: 12, padding: "7px 16px" }}
          >
            Ask AI to create a visualisation
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ flex: 1, position: "relative", overflow: "hidden", background: "var(--bg1)" }}
    >
      {items.map((viz) => {
        const pos = positions[viz.id] ?? { x: 20, y: 20 };
        return (
          <div
            key={viz.id}
            ref={(el) => { if (el) tileRefs.current.set(viz.id, el); else tileRefs.current.delete(viz.id); }}
            onMouseDown={(e) => handleMouseDown(e, viz.id)}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              width: 340,
              background: "var(--bg2)",
              border: "1px solid var(--bd)",
              borderRadius: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,.2)",
              cursor: "grab",
              userSelect: "none",
              zIndex: dragging.current?.id === viz.id ? 10 : 1,
            }}
          >
            {/* Tile header */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px 4px", borderBottom: "1px solid var(--bd2)" }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--tx0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {viz.name}
              </span>
              <button
                onClick={() => void handleDelete(viz.id)}
                disabled={deletingId === viz.id}
                title="Delete"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx2)", padding: "2px 4px", lineHeight: 1, borderRadius: 4 }}
              >
                <IconX size={12} />
              </button>
            </div>
            {/* Chart */}
            <div style={{ padding: 10, pointerEvents: "none" }}>
              <ErrorBoundary fallback={<div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--tx2)" }}>Chart unavailable</div>}>
                <EChartsRenderer config={viz.echarts_config} height={200} />
              </ErrorBoundary>
            </div>
          </div>
        );
      })}
    </div>
  );
}
