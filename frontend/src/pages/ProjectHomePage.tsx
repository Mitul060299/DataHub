import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteProject, fetchProjectDetail } from "../api";
import type { ProjectDetailOut, ProjectDashboardOut, ProjectPipelineOut, ProjectSourceOut } from "../api";
import { Breadcrumb } from "../components/Breadcrumb";

function Skeleton({ width, height = 14 }: { width: string | number; height?: number }) {
  return (
    <div style={{ width, height, borderRadius: 6, background: "var(--bg3)", animation: "pulse 1.4s ease-in-out infinite" }} />
  );
}

function StatusChip({ status }: { status?: string | null }) {
  const s = status ?? "idle";
  const configs: Record<string, { bg: string; color: string }> = {
    success: { bg: "#10b98122", color: "#6ee7b7" },
    running: { bg: "#0ea5e922", color: "#38bdf8" },
    failed: { bg: "#ef444422", color: "#fca5a5" },
    idle: { bg: "var(--bg4)", color: "var(--tx2, #888)" },
  };
  const cfg = configs[s.toLowerCase()] ?? configs.idle;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: cfg.bg, color: cfg.color }}>
      {s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()}
    </span>
  );
}

function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function SectionHeader({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--tx1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title} {count !== undefined && <span style={{ color: "var(--tx2, #888)", textTransform: "none", letterSpacing: 0 }}>({count})</span>}
      </h2>
      {action}
    </div>
  );
}

function ActionBtn({ label, onClick, variant = "ghost" }: { label: string; onClick?: () => void; variant?: "ghost" | "primary" | "danger" }) {
  const styles: Record<string, React.CSSProperties> = {
    ghost: { background: "var(--bg3)", color: "var(--tx1)", border: "1px solid var(--bd2)" },
    primary: { background: "var(--ac)", color: "#fff", border: "none" },
    danger: { background: "#ef444420", color: "#fca5a5", border: "1px solid #ef444430" },
  };
  return (
    <button
      onClick={onClick}
      style={{ padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", ...styles[variant] }}
    >
      {label}
    </button>
  );
}

export function ProjectHomePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ProjectDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    fetchProjectDetail(projectId)
      .then((d) => setDetail(d))
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        setError(status === 404 ? "Project not found." : "Failed to load project.");
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleDeleteProject = async () => {
    if (!projectId) return;
    const name = detail?.project.name ?? "this project";
    if (!window.confirm(`Delete project "${name}"? Pipelines and dashboards will not be deleted, but they will be unlinked.`)) return;
    setDeleting(true);
    try {
      await deleteProject(projectId);
      navigate("/workspace", { replace: true });
    } catch {
      alert("Failed to delete project.");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, overflow: "auto", background: "var(--bg0)", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 36, background: "var(--bg1)", borderBottom: "1px solid var(--bd)" }} />
        <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 32 }}>
          <Skeleton width="30%" height={26} />
          <Skeleton width="100%" height={120} />
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, background: "var(--bg0)", color: "var(--tx1)" }}>
        <p style={{ fontSize: 16, margin: 0 }}>{error ?? "Project not found."}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => navigate("/workspace")} style={{ padding: "8px 18px", borderRadius: 8, background: "var(--ac)", border: "none", color: "#fff", cursor: "pointer" }}>
            Back to Workspace
          </button>
          {projectId && (
            <button
              onClick={() => void handleDeleteProject()}
              disabled={deleting}
              style={{ padding: "8px 18px", borderRadius: 8, background: "#c0392b", border: "none", color: "#fff", cursor: "pointer", opacity: deleting ? 0.6 : 1 }}
            >
              {deleting ? "Deleting…" : "Delete Project"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const { project, pipelines, dashboards, sources } = detail;

  return (
    <div style={{ flex: 1, overflow: "auto", background: "var(--bg0)", display: "flex", flexDirection: "column" }}>
      {/* Breadcrumb */}
      <Breadcrumb
        segments={[
          { label: "Workspace", href: "/workspace" },
          { label: project.name },
        ]}
      />

      {/* Page header */}
      <div style={{ padding: "24px 32px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: `${project.colour}22`, border: `2px solid ${project.colour}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
            {project.icon}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--tx0)", letterSpacing: "-0.01em" }}>{project.name}</h1>
            {project.description && <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--tx1)" }}>{project.description}</p>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, marginTop: 4 }}>
          <ActionBtn label={deleting ? "Deleting…" : "Delete Project"} onClick={() => void handleDeleteProject()} variant="danger" />
        </div>
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 36 }}>

        {/* ── Pipelines ─────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Pipelines"
            count={pipelines.length}
            action={
              <ActionBtn
                label="+ New Pipeline"
                variant="primary"
                onClick={() => navigate(`/workspace/project/${projectId}/pipeline/new`)}
              />
            }
          />
          {pipelines.length === 0 ? (
            <EmptyState
              icon="🔧"
              message="No pipelines in this project yet."
              action={<ActionBtn label="+ New Pipeline" variant="primary" onClick={() => navigate(`/workspace/project/${projectId}/pipeline/new`)} />}
            />
          ) : (
            <div style={{ background: "var(--bg2)", borderRadius: 12, border: "1px solid var(--bd)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--bd)" }}>
                    {["Name", "Steps", "Schedule", "Last Run", "Status", ""].map((h, i) => (
                      <th key={i} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--tx1)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pipelines.map((pl: ProjectPipelineOut) => (
                    <tr
                      key={pl.id}
                      style={{ borderBottom: "1px solid var(--bd)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg3)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                    >
                      <td style={{ padding: "10px 16px", color: "var(--tx0)", fontWeight: 500 }}>{pl.name}</td>
                      <td style={{ padding: "10px 16px", color: "var(--tx1)" }}>{pl.step_count}</td>
                      <td style={{ padding: "10px 16px", color: "var(--tx1)", fontFamily: "monospace", fontSize: 11 }}>
                        {pl.cron_expression ?? <span style={{ color: "var(--tx2, #888)" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 16px", color: "var(--tx1)" }}>{relativeTime(pl.last_run_at)}</td>
                      <td style={{ padding: "10px 16px" }}><StatusChip status={pl.last_run_status ?? pl.status} /></td>
                      <td style={{ padding: "10px 16px" }}>
                        <button
                          onClick={() => navigate(`/workspace/project/${projectId}/pipeline/${pl.id}`)}
                          style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, background: "var(--bg4)", border: "1px solid var(--bd2)", color: "var(--tx1)", cursor: "pointer" }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Dashboards ────────────────────────────────────── */}
        <section>
          <SectionHeader title="Dashboards" count={dashboards.length} />
          {dashboards.length === 0 ? (
            <EmptyState icon="📊" message="No dashboards in this project." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {dashboards.map((db: ProjectDashboardOut) => (
                <div
                  key={db.id}
                  style={{ background: "var(--bg2)", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--bd)", display: "flex", flexDirection: "column", gap: 8 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg3)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg2)"; }}
                >
                  <span style={{ fontWeight: 600, fontSize: 14, color: "var(--tx0)" }}>{db.name}</span>
                  <div style={{ fontSize: 12, color: "var(--tx1)", display: "flex", gap: 10 }}>
                    <span>{db.tile_count} tile{db.tile_count !== 1 ? "s" : ""}</span>
                    {db.is_published && <span style={{ color: "#10b981" }}>Published</span>}
                    <span>{relativeTime(db.updated_at)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button onClick={() => navigate(`/dashboard/${db.id}`)} style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: "1px solid var(--bd2)", background: "var(--bg4)", color: "var(--tx1)", fontSize: 12, cursor: "pointer" }}>Open</button>
                    {db.is_published && db.share_token && (
                      <button
                        onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/public-dashboard/${db.share_token}`); }}
                        style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: "1px solid var(--bd2)", background: "var(--bg4)", color: "var(--tx1)", fontSize: 12, cursor: "pointer" }}
                      >
                        Copy Link
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Data Sources ──────────────────────────────────── */}
        <section>
          <SectionHeader title="Data Sources" count={sources.length} />
          {sources.length === 0 ? (
            <EmptyState icon="🔌" message="No data sources connected to this project." action={<ActionBtn label="+ Add Source" variant="primary" onClick={() => navigate("/sources")} />} />
          ) : (
            <div style={{ background: "var(--bg2)", borderRadius: 12, border: "1px solid var(--bd)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--bd)" }}>
                    {["Name", "Type", "Status", "Last Pulled"].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--tx1)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sources.map((src: ProjectSourceOut) => (
                    <tr
                      key={src.id}
                      style={{ borderBottom: "1px solid var(--bd)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg3)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                    >
                      <td style={{ padding: "10px 16px", color: "var(--tx0)", fontWeight: 500 }}>{src.name}</td>
                      <td style={{ padding: "10px 16px", color: "var(--tx1)" }}>{src.source_type ?? "—"}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: src.is_active ? "#10b98122" : "var(--bg4)", color: src.is_active ? "#6ee7b7" : "var(--tx2, #888)" }}>
                          {src.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", color: "var(--tx1)" }}>{relativeTime(src.last_pulled_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

function EmptyState({ icon, message, action }: { icon: string; message: string; action?: React.ReactNode }) {
  return (
    <div style={{
      border: "1px dashed var(--bd2)",
      borderRadius: 12,
      padding: "32px 24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      color: "var(--tx1)",
      textAlign: "center",
    }}>
      <span style={{ fontSize: 28 }}>{icon}</span>
      <p style={{ margin: 0, fontSize: 13 }}>{message}</p>
      {action}
    </div>
  );
}
