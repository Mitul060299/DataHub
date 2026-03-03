import { useEffect, useMemo, useState } from "react";
import { addDashboardTile, createDashboardV2, listDashboardsV2, publishDashboardV2, unpublishDashboardV2 } from "../api";
import type { DashboardV2 } from "../types";

interface ChartViewProps {
  workspaceId: string;
  datasetId?: string;
}

export function ChartView({ workspaceId, datasetId }: ChartViewProps) {
  const [dashboards, setDashboards] = useState<DashboardV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardName, setDashboardName] = useState("");
  const [tileTitle, setTileTitle] = useState("");
  const [tileChartType, setTileChartType] = useState("bar");
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>("");
  const [publicUrl, setPublicUrl] = useState<string>("");

  const selectedDashboard = useMemo(
    () => dashboards.find((dashboard) => dashboard.id === selectedDashboardId) ?? dashboards[0] ?? null,
    [dashboards, selectedDashboardId]
  );

  const loadDashboards = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listDashboardsV2(workspaceId);
      setDashboards(result);
      if (result.length && !result.some((dashboard) => dashboard.id === selectedDashboardId)) {
        setSelectedDashboardId(result[0].id);
      }
    } catch (err) {
      const maybeError = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(maybeError.response?.data?.detail ?? maybeError.message ?? "Failed to load dashboards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboards();
  }, [workspaceId]);

  useEffect(() => {
    const refreshHandler = () => {
      void loadDashboards();
    };
    window.addEventListener("datahub:dashboard:refresh", refreshHandler);
    return () => {
      window.removeEventListener("datahub:dashboard:refresh", refreshHandler);
    };
  }, [workspaceId, selectedDashboardId]);

  const createDashboard = async () => {
    const name = dashboardName.trim();
    if (!name) return;
    try {
      await createDashboardV2({
        workspace_id: workspaceId,
        dataset_id: datasetId,
        name,
      });
      setDashboardName("");
      await loadDashboards();
    } catch (err) {
      const maybeError = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(maybeError.response?.data?.detail ?? maybeError.message ?? "Failed to create dashboard");
    }
  };

  const createTile = async () => {
    if (!selectedDashboard) return;
    const title = tileTitle.trim();
    if (!title) return;
    try {
      await addDashboardTile({
        dashboard_id: selectedDashboard.id,
        dataset_id: datasetId,
        title,
        chart_type: tileChartType,
      });
      setTileTitle("");
      await loadDashboards();
    } catch (err) {
      const maybeError = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(maybeError.response?.data?.detail ?? maybeError.message ?? "Failed to add tile");
    }
  };

  const publishSelected = async () => {
    if (!selectedDashboard) return;
    try {
      const published = await publishDashboardV2(selectedDashboard.id);
      setPublicUrl(published.public_url || `${window.location.origin}/public-dashboard/${published.publish_token}`);
    } catch (err) {
      const maybeError = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(maybeError.response?.data?.detail ?? maybeError.message ?? "Failed to publish dashboard");
    }
  };

  const unpublishSelected = async () => {
    if (!selectedDashboard) return;
    try {
      await unpublishDashboardV2(selectedDashboard.id);
      setPublicUrl("");
    } catch (err) {
      const maybeError = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(maybeError.response?.data?.detail ?? maybeError.message ?? "Failed to unpublish dashboard");
    }
  };

  return (
    <div
      className="panel"
      style={{
        height: "100%",
        margin: 8,
        display: "grid",
        placeItems: "center",
        color: "var(--tx1)",
        background: "linear-gradient(180deg, var(--bg1), var(--bg2))",
      }}
    >
      <div style={{ width: "100%", height: "100%", display: "grid", gridTemplateRows: "auto auto 1fr", gap: 8, padding: 10, alignContent: "start" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={dashboardName}
            onChange={(event) => setDashboardName(event.target.value)}
            placeholder="New dashboard name"
            style={{ flex: 1, height: 30, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
          />
          <button className="btn" onClick={() => void createDashboard()} disabled={!dashboardName.trim()}>Create</button>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <select
            value={selectedDashboard?.id ?? ""}
            onChange={(event) => setSelectedDashboardId(event.target.value)}
            style={{ flex: 1, height: 30, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
          >
            {dashboards.map((dashboard) => (
              <option key={dashboard.id} value={dashboard.id}>{dashboard.name}</option>
            ))}
          </select>
          <input
            value={tileTitle}
            onChange={(event) => setTileTitle(event.target.value)}
            placeholder="Tile title"
            style={{ flex: 1, height: 30, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
          />
          <select
            value={tileChartType}
            onChange={(event) => setTileChartType(event.target.value)}
            style={{ height: 30, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
          >
            <option value="bar">bar</option>
            <option value="line">line</option>
            <option value="pie">pie</option>
            <option value="table">table</option>
          </select>
          <button className="btn" onClick={() => void createTile()} disabled={!selectedDashboard || !tileTitle.trim()}>Add tile</button>
          <button className="btn" onClick={() => void publishSelected()} disabled={!selectedDashboard}>Publish</button>
          <button className="btn" onClick={() => void unpublishSelected()} disabled={!selectedDashboard}>Unpublish</button>
        </div>

        {publicUrl ? (
          <div className="mono" style={{ fontSize: 11, color: "var(--tx1)" }}>
            Public URL: <a href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a>
          </div>
        ) : null}

        <div style={{ border: "1px solid var(--bd)", borderRadius: "var(--r8)", padding: 8, overflow: "auto", display: "grid", gap: 6, alignContent: "start" }}>
          {loading ? <p style={{ color: "var(--tx1)" }}>Loading dashboards...</p> : null}
          {!loading && !selectedDashboard ? <p style={{ color: "var(--tx1)" }}>No dashboard yet. Create one to start.</p> : null}
          {selectedDashboard?.tiles.map((tile) => (
            <div key={tile.id} style={{ border: "1px solid var(--bd2)", borderRadius: "var(--r6)", padding: 8, background: "var(--bg2)" }}>
              <div className="mono" style={{ fontSize: 12 }}>{tile.title}</div>
              <div className="mono" style={{ color: "var(--tx1)", fontSize: 11 }}>{tile.chart_type}</div>
            </div>
          ))}
          {error ? <p className="mono" style={{ color: "var(--er)", fontSize: 11 }}>{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
