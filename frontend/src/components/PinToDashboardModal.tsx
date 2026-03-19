import { useEffect, useRef, useState } from "react";
import { createDashboardV2, addDashboardTile, listDashboardsV2 } from "../api";

interface TileCreated {
  id: string;
  dashboard_id: string;
  title: string;
  chart_type: string;
  echarts_config: Record<string, unknown> | null;
  source_table?: string;
  saveable?: boolean;
}

interface PinToDashboardModalProps {
  tileCreated: TileCreated;
  workspaceId: string;
  onClose: () => void;
}

interface DashboardOption {
  id: string;
  name: string;
}

export function PinToDashboardModal({ tileCreated, workspaceId, onClose }: PinToDashboardModalProps) {
  const [dashboards, setDashboards] = useState<DashboardOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [createNew, setCreateNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [tileTitle, setTileTitle] = useState(tileCreated.title || "Chart");
  const [loading, setLoading] = useState(false);
  const [fetchingDashboards, setFetchingDashboards] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listDashboardsV2(workspaceId);
        const opts = data.map((d) => ({ id: d.id, name: d.name }));
        setDashboards(opts);
        if (opts.length === 0) setCreateNew(true);
        else setSelectedId(opts[0].id);
      } catch {
        setCreateNew(true);
      } finally {
        setFetchingDashboards(false);
      }
    };
    void load();
  }, [workspaceId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast(null);
      onClose();
    }, 1800);
  };

  const handleConfirm = async () => {
    setError(null);
    if (!tileTitle.trim()) {
      setError("Tile title is required.");
      return;
    }
    setLoading(true);
    try {
      let dashboardId = selectedId;
      let dashboardName = dashboards.find((d) => d.id === selectedId)?.name ?? "";

      if (createNew) {
        if (!newName.trim()) {
          setError("Dashboard name is required.");
          setLoading(false);
          return;
        }
        const created = await createDashboardV2({
          workspace_id: workspaceId,
          name: newName.trim(),
        });
        dashboardId = created.id;
        dashboardName = created.name;
      }

      await addDashboardTile({
        dashboard_id: dashboardId,
        title: tileTitle.trim(),
        chart_type: tileCreated.chart_type,
        query_spec: {
          echarts_config: tileCreated.echarts_config,
          source_table: tileCreated.source_table,
        },
        layout: {},
      });

      showToast(`Pinned to "${dashboardName}"`);
    } catch (err) {
      const maybeError = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(maybeError.response?.data?.detail ?? maybeError.message ?? "Failed to pin tile.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#0F1117",
          border: "1px solid #1E293B",
          borderRadius: 12,
          width: 440,
          maxWidth: "calc(100vw - 32px)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#E2E8F0" }}>📌 Pin to Dashboard</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Tile title */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>Tile title</label>
          <input
            value={tileTitle}
            onChange={(e) => setTileTitle(e.target.value)}
            style={{
              border: "1px solid #1E293B",
              borderRadius: 8,
              background: "#121827",
              color: "#E2E8F0",
              padding: "8px 10px",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>

        {/* Dashboard picker */}
        {!fetchingDashboards && dashboards.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>Add to dashboard</label>
            <select
              value={createNew ? "__new__" : selectedId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setCreateNew(true);
                  setSelectedId("");
                } else {
                  setCreateNew(false);
                  setSelectedId(e.target.value);
                }
              }}
              style={{
                border: "1px solid #1E293B",
                borderRadius: 8,
                background: "#121827",
                color: "#E2E8F0",
                padding: "8px 10px",
                fontSize: 13,
                outline: "none",
              }}
            >
              {dashboards.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
              <option value="__new__">+ Create new dashboard…</option>
            </select>
          </div>
        )}

        {/* New dashboard name */}
        {createNew && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>New dashboard name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My Dashboard"
              style={{
                border: "1px solid #1E293B",
                borderRadius: 8,
                background: "#121827",
                color: "#E2E8F0",
                padding: "8px 10px",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>
        )}

        {error && (
          <div style={{ color: "#EF4444", fontSize: 12 }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              border: "1px solid #1E293B",
              borderRadius: 8,
              background: "transparent",
              color: "#94A3B8",
              padding: "8px 16px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={loading || fetchingDashboards}
            style={{
              border: "none",
              borderRadius: 8,
              background: "#5B6AF0",
              color: "#fff",
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Pinning…" : "Pin"}
          </button>
        </div>

        {/* Success toast */}
        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#22C55E",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              borderRadius: 8,
              padding: "10px 20px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              zIndex: 2000,
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
