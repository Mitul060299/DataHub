/**
 * CanvasView
 * ───────────
 * Top-level canvas state container.
 *
 *  ┌──────────────────────┐
 *  │  Canvas list         │  (when no canvas is open)
 *  │  + New Canvas        │  (gated by plan limit)
 *  └──────────────────────┘
 *  ┌──────────────────────┐
 *  │  CanvasToolbar       │  (when a canvas is open)
 *  │  CanvasGrid          │
 *  └──────────────────────┘
 */
import { useCallback, useEffect, useState } from "react";
import {
  createCanvasLayout,
  deleteCanvasLayout,
  getCanvasLimitStatus,
  listCanvasLayouts,
  type CanvasLayout,
  type CanvasLimitStatus,
  type CanvasTileItem,
} from "../api";
import { CanvasGrid } from "./CanvasGrid";
import { CanvasToolbar } from "./CanvasToolbar";
import { IconX } from "./Icons";

interface CanvasViewProps {
  workspaceId: string;
  projectId: string;
}

export function CanvasView({ workspaceId, projectId }: CanvasViewProps) {
  const [canvases, setCanvases] = useState<CanvasLayout[]>([]);
  const [limitStatus, setLimitStatus] = useState<CanvasLimitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  // currently open canvas
  const [activeCanvas, setActiveCanvas] = useState<CanvasLayout | null>(null);
  // local tile state (unsynced until Save)
  const [tiles, setTiles] = useState<CanvasTileItem[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, status] = await Promise.all([
        listCanvasLayouts(projectId || undefined),
        getCanvasLimitStatus(),
      ]);
      setCanvases(list);
      setLimitStatus(status);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // Open a canvas and load its tiles
  const openCanvas = (canvas: CanvasLayout) => {
    setActiveCanvas(canvas);
    setTiles(canvas.layout ?? []);
  };

  const handleBack = () => {
    setActiveCanvas(null);
    setTiles([]);
    void fetchAll();
  };

  const handleSaved = (updated: CanvasLayout) => {
    setActiveCanvas(updated);
    setCanvases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleCreate = async () => {
    if (!limitStatus?.can_create) return;
    setCreating(true);
    try {
      const canvas = await createCanvasLayout({
        name: "Untitled Canvas",
        project_id: projectId || undefined,
        workspace_id: workspaceId,
      });
      setCanvases((prev) => [canvas, ...prev]);
      openCanvas(canvas);
      // refresh limit status
      const status = await getCanvasLimitStatus();
      setLimitStatus(status);
    } catch (err: unknown) {
      const maybeErr = err as { response?: { data?: { error?: string } } };
      if (maybeErr?.response?.data?.error === "canvas_limit_reached") {
        // refresh so UI shows correct count
        void fetchAll();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setCanvases((prev) => prev.filter((c) => c.id !== id));
    try {
      await deleteCanvasLayout(id);
      const status = await getCanvasLimitStatus();
      setLimitStatus(status);
    } catch {
      void fetchAll();
    }
  };

  // ── render open canvas ────────────────────────────────────────────────────
  if (activeCanvas) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <CanvasToolbar
          canvas={activeCanvas}
          tiles={tiles}
          onBack={handleBack}
          onSaved={handleSaved}
        />
        <CanvasGrid tiles={tiles} onChange={setTiles} />
      </div>
    );
  }

  // ── render canvas list ────────────────────────────────────────────────────
  const limitLabel =
    limitStatus && limitStatus.limit !== null
      ? `${limitStatus.count} / ${limitStatus.limit} used`
      : limitStatus
        ? `${limitStatus.count} canvas${limitStatus.count !== 1 ? "es" : ""}`
        : "";

  const atLimit = limitStatus ? !limitStatus.can_create : false;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: 16 }}>
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Canvases</h2>
          {limitStatus && (
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--tx1)" }}>{limitLabel}</p>
          )}
        </div>

        <div style={{ position: "relative" }}>
          <button
            className="btn"
            disabled={creating || atLimit}
            onClick={() => void handleCreate()}
            title={
              atLimit
                ? `You've reached the canvas limit for your plan (${limitStatus?.limit}). Upgrade to create more.`
                : "Create a new canvas"
            }
            style={{
              background: "var(--ac)",
              color: "#fff",
              borderColor: "var(--ac)",
              opacity: atLimit ? 0.45 : 1,
              cursor: atLimit ? "not-allowed" : "pointer",
              fontSize: 12,
            }}
          >
            {creating ? "Creating…" : "+ New Canvas"}
          </button>
          {atLimit && limitStatus?.limit !== null && (
            <span
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                whiteSpace: "nowrap",
                background: "#1a1a2e",
                color: "#fff",
                padding: "4px 8px",
                borderRadius: 6,
                fontSize: 10,
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              Limit reached · Upgrade to {limitStatus?.plan === "free" ? "Pro" : "Team"}
            </span>
          )}
        </div>
      </div>

      {/* canvas list */}
      {loading && canvases.length === 0 ? (
        <p style={{ color: "var(--tx1)", fontSize: 12 }}>Loading…</p>
      ) : canvases.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            color: "var(--tx1)",
          }}
        >
          <span style={{ fontSize: 40 }}>🖼</span>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>No canvases yet</p>
          <p style={{ fontSize: 11, margin: 0 }}>
            Create your first canvas and drag in charts from the sidebar.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {canvases.map((canvas) => (
            <div
              key={canvas.id}
              style={{
                background: "var(--bg2)",
                border: "1px solid var(--bd)",
                borderRadius: 10,
                overflow: "hidden",
                cursor: "pointer",
                transition: "box-shadow .15s",
                boxShadow: hoveredCardId === canvas.id ? "0 4px 16px rgba(0,0,0,.18)" : "none",
              }}
              onClick={() => openCanvas(canvas)}
              onMouseEnter={() => setHoveredCardId(canvas.id)}
              onMouseLeave={() => setHoveredCardId((cur) => (cur === canvas.id ? null : cur))}
            >
              {/* thumbnail area */}
              <div
                style={{
                  height: 110,
                  background: "var(--bg3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--tx2)",
                  fontSize: 28,
                }}
              >
                🖼
              </div>

              {/* info row */}
              <div
                style={{
                  padding: "8px 10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 160,
                    }}
                  >
                    {canvas.name}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--tx1)" }}>
                    {canvas.layout?.length ?? 0} tile{canvas.layout?.length !== 1 ? "s" : ""}
                  </p>
                </div>

                <button
                  className="btn"
                  style={{
                    width: 22,
                    height: 22,
                    padding: 0,
                    color: "#ef4444",
                    background: "none",
                    border: "none",
                    opacity: hoveredCardId === canvas.id ? 1 : 0,
                    pointerEvents: hoveredCardId === canvas.id ? "auto" : "none",
                    transition: "opacity 120ms ease",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(canvas.id);
                  }}
                  title="Delete canvas"
                >
                  <IconX size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
