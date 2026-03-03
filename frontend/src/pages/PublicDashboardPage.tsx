import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPublicDashboard, fetchPublicDashboardTiles } from "../api";
import type { DashboardV2, DashboardV2Tile } from "../types";

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
          fetchPublicDashboard(token),
          fetchPublicDashboardTiles(token),
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

  return (
    <main style={{ minHeight: "100%", background: "var(--bg0)", color: "var(--tx0)", padding: 16 }}>
      <section className="panel" style={{ maxWidth: 960, margin: "0 auto", padding: 12, display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>{dashboard?.name ?? "Public dashboard"}</h1>
        {dashboard?.description ? <p style={{ margin: 0, color: "var(--tx1)" }}>{dashboard.description}</p> : null}
        {loading ? <p style={{ margin: 0, color: "var(--tx1)" }}>Loading…</p> : null}
        {error ? <p className="mono" style={{ margin: 0, color: "var(--er)" }}>{error}</p> : null}

        <div style={{ display: "grid", gap: 8 }}>
          {tiles.map((tile) => (
            <article key={tile.id} style={{ border: "1px solid var(--bd2)", borderRadius: "var(--r8)", padding: 10, background: "var(--bg2)" }}>
              <div className="mono" style={{ fontSize: 12 }}>{tile.title}</div>
              <div className="mono" style={{ color: "var(--tx1)", fontSize: 11 }}>{tile.chart_type}</div>
            </article>
          ))}
          {!loading && !error && !tiles.length ? <p style={{ margin: 0, color: "var(--tx1)" }}>No tiles published.</p> : null}
        </div>
      </section>
    </main>
  );
}
