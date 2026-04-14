import { useEffect, useState, useCallback, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import {
  fetchDashboardById,
  updateDashboard,
  deleteDashboardTile,
  updateDashboardTile,
  postDashboardView,
} from "../api";
import type { DashboardV2, DashboardV2Tile } from "../types";
import { EChartsRenderer } from "../components/EChartsRenderer";
import { MetricTile } from "../components/MetricTile";
import { SharePanel } from "../components/SharePanel";
import { DashboardComments } from "../components/DashboardComments";
import { useRealtimeDashboard } from "../hooks/useRealtimeDashboard";

// ---------- helpers ----------

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------- Tile card ----------

function TileCard({
  tile,
  editMode,
  onDelete,
  onTitleEdit,
}: {
  tile: DashboardV2Tile;
  editMode: boolean;
  onDelete: (id: string) => void;
  onTitleEdit: (id: string, newTitle: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempTitle, setTempTitle] = useState(tile.title);

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
        minHeight: 280,
      }}
    >
      {/* Header */}
      <div
        style={{
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
        {editMode && (
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
            style={{ height: "100%", borderRadius: 0, border: "none" }}
          />
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
          <EChartsRenderer
            config={(tile.echarts_config as Record<string, unknown> | null) ?? null}
            height={260}
          />
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
          <span style={{ fontSize: 13, color: "#94A3B8" }}>Show DataHub branding</span>
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={() => onSave({ name, description, theme: { primary: primaryColor, show_branding: showBranding } })}
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
  const [dashboard, setDashboard] = useState<DashboardV2 | null>(null);
  const [tiles, setTiles] = useState<DashboardV2Tile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const onTilesRefresh = useCallback(async (_tileIds: string[]) => {
    if (!id) return;
    const dash = await fetchDashboardById(id);
    setTiles(dash.tiles);
  }, [id]);

  const { toastMessage, refreshFailed } = useRealtimeDashboard(id, onTilesRefresh);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const dash = await fetchDashboardById(id);
        setDashboard(dash);
        setTiles(dash.tiles);
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

  const handleDeleteTile = async (tileId: string) => {
    if (!id) return;
    try {
      await deleteDashboardTile(id, tileId);
      setTiles((prev) => prev.filter((t) => t.id !== tileId));
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

  const handlePrint = () => window.print();

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
      {/* Print CSS */}
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

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
            padding: "12px 20px",
            borderBottom: "1px solid #1E293B",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#E2E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {dashboard.name}
            </h1>
            {dashboard.description && (
              <p style={{ margin: 0, fontSize: 12, color: "#64748B", marginTop: 2 }}>{dashboard.description}</p>
            )}
          </div>

          {dashboard.updated_at && (
            <span style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap" }}>
              Updated {timeAgo(dashboard.updated_at)}
            </span>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handlePrint} style={headerBtnStyle} title="Export PDF">🖨 Export</button>
            <button onClick={() => setShowShare(true)} style={headerBtnStyle} title="Share">🔗 Share</button>
            <button onClick={() => setShowSettings(true)} style={headerBtnStyle} title="Settings">⚙</button>
            <button
              onClick={() => setEditMode((p) => !p)}
              style={{ ...headerBtnStyle, background: editMode ? primaryColor : undefined, color: editMode ? "#fff" : undefined }}
            >
              {editMode ? "✓ Done" : "✎ Edit"}
            </button>
          </div>
        </header>

        {/* Tiles grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {tiles.length === 0 ? (
            <div style={{ textAlign: "center", color: "#475569", padding: 64 }}>
              No tiles yet. Ask the AI agent to visualise something and pin it here.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
                gap: 12,
              }}
            >
              {tiles.map((tile) => (
                <TileCard
                  key={tile.id}
                  tile={tile}
                  editMode={editMode}
                  onDelete={(tileId) => void handleDeleteTile(tileId)}
                  onTitleEdit={(tileId, title) => void handleTitleEdit(tileId, title)}
                />
              ))}
            </div>
          )}

          {showBranding && (
            <footer style={{ textAlign: "center", padding: "12px 0", color: "#334155", fontSize: 11 }}>
              Powered by <strong style={{ color: "#5B6AF0" }}>DataHub</strong>
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
