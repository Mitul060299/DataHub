import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchSharedDashboard, fetchSharedDashboardTiles } from "../api";
import type { DashboardV2, DashboardV2Tile } from "../types";
import { EChartsRenderer } from "../components/EChartsRenderer";
import { MetricTile } from "../components/MetricTile";

export function PublicDashboardPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardV2 | null>(null);
  const [tiles, setTiles] = useState<DashboardV2Tile[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const [dash, tileRows] = await Promise.all([
          fetchSharedDashboard(token),
          fetchSharedDashboardTiles(token),
        ]);
        setDashboard(dash);
        setTiles(tileRows);
      } catch (err) {
        const maybeError = err as { response?: { data?: { detail?: string } }; message?: string };
        setError(maybeError.response?.data?.detail ?? maybeError.message ?? "Failed to load public dashboard");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [token]);

  const theme = (dashboard?.theme ?? {}) as Record<string, unknown>;
  const showBranding = theme.show_branding !== false;

  return (
    <main style={{ minHeight: "100vh", background: "#070C18", color: "#E2E8F0", padding: "24px 16px" }}>
      <section style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#E2E8F0" }}>
            {dashboard?.name ?? "Public dashboard"}
          </h1>
          {dashboard?.description ? (
            <p style={{ margin: "4px 0 0", color: "#64748B", fontSize: 13 }}>{dashboard.description}</p>
          ) : null}
        </div>

        {loading ? <p style={{ margin: 0, color: "#64748B" }}>Loading…</p> : null}
        {error ? <p style={{ margin: 0, color: "#EF4444", fontSize: 13 }}>{error}</p> : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 12,
          }}
        >
          {tiles.map((tile) => {
            const tileType = tile.tile_type ?? "chart";
            return (
              <article
                key={tile.id}
                style={{
                  border: "1px solid #1E293B",
                  borderRadius: 10,
                  background: "#0F1117",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 280,
                }}
              >
                <div style={{ padding: "8px 12px 4px", borderBottom: "1px solid #1E293B" }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#94A3B8" }}>{tile.title}</span>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
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
                    <div style={{ padding: 16, fontSize: 13, color: "#94A3B8", lineHeight: 1.6 }}>
                      {String((tile.query_spec as Record<string, unknown>).text ?? "")}
                    </div>
                  ) : (
                    <EChartsRenderer
                      config={tile.echarts_config as Record<string, unknown> | null ?? null}
                      height={240}
                    />
                  )}
                </div>
              </article>
            );
          })}
          {!loading && !error && !tiles.length ? (
            <p style={{ color: "#475569" }}>No tiles published.</p>
          ) : null}
        </div>

        {showBranding && (
          <footer style={{ textAlign: "center", color: "#334155", fontSize: 11, paddingTop: 8 }}>
            Powered by <strong style={{ color: "#5B6AF0" }}>datahub.org.in</strong>
          </footer>
        )}
      </section>
    </main>
  );
}
