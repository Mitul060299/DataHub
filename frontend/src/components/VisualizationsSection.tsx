/**
 * VisualizationsSection
 * ──────────────────────
 * Left-sidebar panel showing all user-saved visualizations.
 * Items are draggable onto the Canvas drop zone.
 *
 * Refreshes on mount and whenever `datahub:visualizations:refresh` is
 * dispatched (e.g. after AIPanel saves a new chart).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listVisualizations,
  renameVisualization,
  deleteVisualization,
  type SavedVisualization,
} from "../api";
import { EChartsRenderer } from "./EChartsRenderer";
import { ErrorBoundary } from "./ErrorBoundary";
import { IconBarChart, IconX } from "./Icons";

// ── helpers ──────────────────────────────────────────────────────────────────

function chartTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

// ── sub-components ────────────────────────────────────────────────────────────

interface PreviewPopoverProps {
  viz: SavedVisualization;
  anchorRect: DOMRect;
  onClose: () => void;
}

function PreviewPopover({ viz, anchorRect, onClose }: PreviewPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const top = anchorRect.top;
  const left = anchorRect.right + 8;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top,
        left,
        width: 320,
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,.25)",
        zIndex: 9999,
        padding: 12,
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontWeight: 600,
          fontSize: 12,
          color: "var(--tx)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {viz.name}
      </p>
      <ErrorBoundary fallback={<p style={{ fontSize: 11, color: "var(--tx2)" }}>Preview unavailable</p>}>
        <EChartsRenderer config={viz.echarts_config} height={220} />
      </ErrorBoundary>
      <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--tx1)" }}>
        {chartTypeLabel(viz.chart_type)} · Drag onto Canvas to add
      </p>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function VisualizationsSection() {
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<SavedVisualization[]>([]);
  const [loading, setLoading] = useState(false);

  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<{
    viz: SavedVisualization;
    rect: DOMRect;
  } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listVisualizations();
      setItems(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const handler = () => void fetchAll();
    window.addEventListener("datahub:visualizations:refresh", handler);
    return () => window.removeEventListener("datahub:visualizations:refresh", handler);
  }, [fetchAll]);

  // commit rename
  const commitRename = useCallback(async () => {
    if (!editingId || !editingName.trim()) { setEditingId(null); return; }
    const newName = editingName.trim();
    setItems((prev) => prev.map((v) => (v.id === editingId ? { ...v, name: newName } : v)));
    setEditingId(null);
    try {
      await renameVisualization(editingId, newName);
    } catch {
      void fetchAll();
    }
  }, [editingId, editingName, fetchAll]);

  const startEdit = (viz: SavedVisualization) => {
    setMenuId(null);
    setEditingId(viz.id);
    setEditingName(viz.name);
    setTimeout(() => editRef.current?.focus(), 0);
  };

  const handleDelete = async (id: string) => {
    setMenuId(null);
    setItems((prev) => prev.filter((v) => v.id !== id));
    try {
      await deleteVisualization(id);
    } catch {
      void fetchAll();
    }
  };

  const handleDragStart = (e: React.DragEvent, viz: SavedVisualization) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("viz_id", viz.id);
    e.dataTransfer.setData("viz_config", JSON.stringify(viz));
  };

  return (
    <section style={{ borderTop: "1px solid var(--bd)", marginTop: 8 }}>
      {/* header row */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "6px 0", color: "var(--tx1)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", background: "none", border: "none", cursor: "pointer" }}
        >
          <IconBarChart size={13} color="var(--tx2)" />
          VISUALIZATIONS
          {items.length > 0 && (
            <span style={{ background: "var(--bg3)", borderRadius: 99, padding: "1px 6px", fontSize: 10, fontWeight: 400, color: "var(--tx2)", letterSpacing: "normal", lineHeight: "16px" }}>
              {items.length}
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--tx2)" }}>{open ? "▾" : "▸"}</span>
        </button>
      </div>

      {open && (
        <div style={{ paddingBottom: 4 }}>
          {loading && items.length === 0 ? (
            <p style={{ fontSize: 11, color: "var(--tx1)", padding: "4px 12px" }}>Loading…</p>
          ) : items.length === 0 ? (
            <p style={{ fontSize: 11, color: "var(--tx1)", padding: "4px 12px" }}>
              No saved visualizations yet.
            </p>
          ) : (
            items.map((viz) => (
              <div
                key={viz.id}
                draggable
                onDragStart={(e) => handleDragStart(e, viz)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px 3px 12px",
                  cursor: "grab",
                  borderRadius: 4,
                  position: "relative",
                  userSelect: "none",
                  background: hoveredId === viz.id ? "var(--bg2)" : "transparent",
                }}
                onMouseEnter={() => setHoveredId(viz.id)}
                onMouseLeave={() => setHoveredId((cur) => (cur === viz.id ? null : cur))}
              >
                {/* drag handle dots */}
                <span style={{ color: "var(--tx2)", fontSize: 10, flexShrink: 0 }}>⠿</span>

                {/* name / rename input */}
                {editingId === viz.id ? (
                  <input
                    ref={editRef}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    style={{
                      flex: 1,
                      fontSize: 11,
                      padding: "1px 4px",
                      border: "1px solid var(--ac)",
                      borderRadius: 4,
                      background: "var(--bg1)",
                      color: "var(--tx)",
                    }}
                  />
                ) : (
                  <span
                    title={viz.name}
                    onClick={(e) => {
                      const rect = e.currentTarget.closest("div")!.getBoundingClientRect();
                      setPreview({ viz, rect });
                      setMenuId(null);
                    }}
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 11,
                      color: "var(--tx)",
                      cursor: "pointer",
                    }}
                  >
                    {viz.name}
                  </span>
                )}

                {/* inline delete button — visible on hover */}
                <button
                  className="btn"
                  style={{
                    width: 18,
                    height: 18,
                    padding: 0,
                    flexShrink: 0,
                    background: "none",
                    border: "none",
                    color: "#ef4444",
                    opacity: hoveredId === viz.id && editingId !== viz.id ? 1 : 0,
                    pointerEvents: hoveredId === viz.id && editingId !== viz.id ? "auto" : "none",
                    transition: "opacity 120ms ease",
                  }}
                  title="Delete visualization"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(viz.id);
                  }}
                >
                  <IconX size={11} />
                </button>

                {/* type badge */}
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 99,
                    background: "var(--bg1)",
                    border: "1px solid var(--bd)",
                    color: "var(--tx1)",
                  }}
                >
                  {viz.chart_type}
                </span>

                {/* ⋯ menu button */}
                <button
                  className="btn"
                  style={{
                    width: 20,
                    height: 20,
                    padding: 0,
                    fontSize: 12,
                    flexShrink: 0,
                    lineHeight: 1,
                    background: "none",
                    border: "none",
                    color: "var(--tx1)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId((prev) => (prev === viz.id ? null : viz.id));
                    setPreview(null);
                  }}
                >
                  ⋯
                </button>

                {/* dropdown menu */}
                {menuId === viz.id && (
                  <div
                    style={{
                      position: "absolute",
                      right: 4,
                      top: 24,
                      background: "var(--bg2)",
                      border: "1px solid var(--bd)",
                      borderRadius: 6,
                      boxShadow: "0 4px 12px rgba(0,0,0,.2)",
                      zIndex: 1000,
                      minWidth: 120,
                    }}
                  >
                    <button
                      className="btn"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 12px",
                        fontSize: 11,
                        background: "none",
                        border: "none",
                        color: "var(--tx)",
                      }}
                      onClick={() => startEdit(viz)}
                    >
                      Rename
                    </button>
                    <button
                      className="btn"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 12px",
                        fontSize: 11,
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                      }}
                      onClick={() => void handleDelete(viz.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* preview popover */}
      {preview && (
        <PreviewPopover
          viz={preview.viz}
          anchorRect={preview.rect}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}
