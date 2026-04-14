import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteProject, fetchWorkspaceRecent, updateProject } from "../api";
import type { WorkspaceRecentOut } from "../api";
import { NewProjectModal } from "../components/modals/NewProjectModal";
import { WorkspaceSwitcher } from "../components/WorkspaceSwitcher";
import type { Project } from "../contexts/WorkspaceContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";

function Skeleton({ width, height = 14, style }: { width: string | number; height?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ width, height, borderRadius: 6, background: "var(--bg3)", animation: "pulse 1.4s ease-in-out infinite", ...style }} />
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

export function WorkspaceHomePage() {
  const navigate = useNavigate();
  const { projects, projectsLoading, setActiveProject, refreshProjects, activeWorkspaceId, workspaces } = useWorkspaceContext();
  const [recent, setRecent] = useState<WorkspaceRecentOut | null>(null);
  const [recentLoading, setRecentLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [renameModal, setRenameModal] = useState<{ projectId: string; value: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentLoading(true);
    fetchWorkspaceRecent()
      .then((data) => setRecent(data))
      .catch(() => setRecent(null))
      .finally(() => setRecentLoading(false));
  }, []);

  // Filter projects to only those belonging to the active workspace
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const workspaceProjects = projects.filter((p) => {
    if (!activeWorkspaceId || activeWorkspaceId === "default") return true;
    return p.workspaceId === activeWorkspaceId || p.workspaceId === "default";
  });

  const filteredProjects = workspaceProjects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleOpenProject = (project: Project) => {
    setActiveProject(project);
    navigate(`/workspace/project/${project.id}/pipeline/new`);
  };

  const handleProjectCreated = (project: Project) => {
    setActiveProject(project);
    navigate(`/workspace/project/${project.id}/pipeline/new`);
  };

  const handleDeleteProject = async (project: Project) => {
    setMenuProjectId(null);
    if (!window.confirm(`Delete project "${project.name}"? Pipelines and dashboards will not be deleted, but they will be unlinked.`)) return;
    setActionLoading(true);
    try {
      await deleteProject(project.id);
      await refreshProjects();
    } catch {
      alert("Failed to delete project.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenameSubmit = async () => {
    if (!renameModal || !renameModal.value.trim()) return;
    setActionLoading(true);
    try {
      await updateProject(renameModal.projectId, { name: renameModal.value.trim() });
      await refreshProjects();
      setRenameModal(null);
    } catch {
      alert("Failed to rename project.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, overflow: "hidden", background: "var(--bg0)", display: "flex", flexDirection: "row" }}>

      {/* ── Left sidebar: workspace switcher ──────────────── */}
      <div style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid var(--bd)",
        background: "var(--bg1)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 0",
        overflowY: "auto",
      }}>
        <div style={{ padding: "0 16px 12px", fontSize: 11, fontWeight: 600, color: "var(--tx2, #888)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Workspaces
        </div>
        <WorkspaceSwitcher />
      </div>

      {/* ── Main content ──────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Page header */}
        <div style={{ padding: "28px 32px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--tx0)", letterSpacing: "-0.02em" }}>
              {activeWorkspace ? activeWorkspace.name : "Workspace"}
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--tx1)" }}>
              {activeWorkspace?.workspace_type === "collab" ? "Collab workspace · shared projects" : "Your personal workspace"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            style={{
              background: "var(--bg2)",
              border: "1px solid var(--bd2)",
              borderRadius: 8,
              padding: "7px 12px",
              fontSize: 13,
              color: "var(--tx0)",
              outline: "none",
              width: 200,
            }}
          />
          <button
            onClick={() => setNewProjectOpen(true)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: "var(--ac)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New Project
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 36 }}>
        {/* ── Projects grid ─────────────────────────────────── */}
        <section>
          <h2 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "var(--tx1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Projects {!projectsLoading && `(${filteredProjects.length})`}
          </h2>

          {projectsLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} style={{ background: "var(--bg2)", borderRadius: 12, padding: 18, border: "1px solid var(--bd)", height: 120, display: "flex", flexDirection: "column", gap: 10 }}>
                  <Skeleton width={40} height={40} style={{ borderRadius: 10 }} />
                  <Skeleton width="60%" />
                  <Skeleton width="40%" height={11} />
                </div>
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--tx1)", fontSize: 14 }}>
              {search ? "No projects match your search." : "No projects yet."}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {filteredProjects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleOpenProject(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") handleOpenProject(p); }}
                  style={{
                    background: "var(--bg2)",
                    borderRadius: 12,
                    padding: "16px 18px",
                    border: "1px solid var(--bd)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    transition: "border-color 0.15s, background 0.15s",
                    borderLeft: `3px solid ${p.colour}`,
                    position: "relative",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg3)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg2)"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{p.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--tx0)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuProjectId(menuProjectId === p.id ? null : p.id); }}
                      onKeyDown={(e) => e.stopPropagation()}
                      title="Project options"
                      style={{ background: "none", border: "none", color: "var(--tx2, #888)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 4px", borderRadius: 4, flexShrink: 0, opacity: 0.7 }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; (e.currentTarget as HTMLButtonElement).style.background = "var(--bg4)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                    >⋯</button>
                  </div>
                  {menuProjectId === p.id && (
                    <>
                      {/* Backdrop — closes menu without triggering tile click */}
                      <div
                        style={{ position: "fixed", inset: 0, zIndex: 99 }}
                        onClick={(e) => { e.stopPropagation(); setMenuProjectId(null); }}
                      />
                      <div style={{
                        position: "absolute", top: 44, right: 8, zIndex: 100,
                        background: "var(--bg2)", border: "1px solid var(--bd2)",
                        borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                        minWidth: 140, overflow: "hidden",
                      }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setRenameModal({ projectId: p.id, value: p.name }); setMenuProjectId(null); }}
                          style={{ display: "block", width: "100%", padding: "9px 14px", textAlign: "left", background: "none", border: "none", color: "var(--tx0)", fontSize: 13, cursor: "pointer" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg3)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                        >Rename</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); void handleDeleteProject(p); }}
                          disabled={actionLoading}
                          style={{ display: "block", width: "100%", padding: "9px 14px", textAlign: "left", background: "none", border: "none", color: "#fca5a5", fontSize: 13, cursor: "pointer" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg3)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                        >Delete</button>
                      </div>
                    </>
                  )}
                  {p.description && (
                    <p style={{ margin: 0, fontSize: 12, color: "var(--tx1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</p>
                  )}
                  <div style={{ display: "flex", gap: 14, marginTop: 4, fontSize: 12, color: "var(--tx1)" }}>
                    <span>{p.pipelineCount} pipeline{p.pipelineCount !== 1 ? "s" : ""}</span>
                    <span>{p.dashboardCount} dashboard{p.dashboardCount !== 1 ? "s" : ""}</span>
                    <span>{relativeTime(p.updatedAt)}</span>
                  </div>
                </div>
              ))}

              {/* "+ New Project" dashed card */}
              <div
                onClick={() => setNewProjectOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") setNewProjectOpen(true); }}
                style={{
                  background: "transparent",
                  borderRadius: 12,
                  padding: "16px 18px",
                  border: "2px dashed var(--bd2)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontSize: 13,
                  color: "var(--tx1)",
                  minHeight: 100,
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = "var(--ac)";
                  el.style.color = "var(--ac)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = "var(--bd2)";
                  el.style.color = "var(--tx1)";
                }}
              >
                <span style={{ fontSize: 20 }}>+</span> New Project
              </div>
            </div>
          )}
        </section>

        {/* ── Recent Pipelines ──────────────────────────────── */}
        <section>
          <h2 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "var(--tx1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Recent Pipelines
          </h2>
          <div style={{ background: "var(--bg2)", borderRadius: 12, border: "1px solid var(--bd)", overflow: "hidden" }}>
            {recentLoading ? (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {[...Array(3)].map((_, i) => <Skeleton key={i} width="100%" height={16} />)}
              </div>
            ) : (recent?.recent_pipelines ?? []).length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--tx1)" }}>No pipelines yet.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--bd)" }}>
                    {["Name", "Project", "Last Run", "Status"].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--tx1)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(recent?.recent_pipelines ?? []).map((pl) => (
                    <tr
                      key={pl.id}
                      style={{ borderBottom: "1px solid var(--bd)", cursor: "pointer" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg3)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                      onClick={() => pl.project_id && navigate(`/workspace/project/${pl.project_id}/pipeline/${pl.id}`)}
                    >
                      <td style={{ padding: "10px 16px", color: "var(--tx0)", fontWeight: 500 }}>{pl.name}</td>
                      <td style={{ padding: "10px 16px", color: "var(--tx1)" }}>{pl.project_name ?? "—"}</td>
                      <td style={{ padding: "10px 16px", color: "var(--tx1)" }}>{relativeTime(pl.last_run_at)}</td>
                      <td style={{ padding: "10px 16px" }}><StatusChip status={pl.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ── Recent Dashboards ─────────────────────────────── */}
        <section>
          <h2 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "var(--tx1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Recent Dashboards
          </h2>
          {recentLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
              {[...Array(4)].map((_, i) => <Skeleton key={i} width="100%" height={80} style={{ borderRadius: 12 }} />)}
            </div>
          ) : (recent?.recent_dashboards ?? []).length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "var(--tx1)" }}>No dashboards yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
              {(recent?.recent_dashboards ?? []).map((db) => (
                <div
                  key={db.id}
                  onClick={() => navigate(`/dashboard/${db.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") navigate(`/dashboard/${db.id}`); }}
                  style={{
                    background: "var(--bg2)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    border: "1px solid var(--bd)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg3)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg2)"; }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--tx0)" }}>{db.name}</span>
                  <div style={{ display: "flex", gap: 10, fontSize: 12, color: "var(--tx1)" }}>
                    <span>{db.tile_count} tile{db.tile_count !== 1 ? "s" : ""}</span>
                    {db.is_published && <span style={{ color: "#10b981" }}>Published</span>}
                    <span>{relativeTime(db.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      </div>{/* end main content */}

      {renameModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)" }}
          onClick={() => setRenameModal(null)}
        >
          <div style={{ background: "var(--bg1)", border: "1px solid var(--bd2)", borderRadius: 12, padding: "24px 28px", minWidth: 340, display: "flex", flexDirection: "column", gap: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--tx0)" }}>Rename project</h3>
            <input
              ref={renameInputRef}
              autoFocus
              value={renameModal.value}
              onChange={(e) => setRenameModal((prev) => prev ? { ...prev, value: e.target.value } : null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRenameSubmit();
                if (e.key === "Escape") setRenameModal(null);
              }}
              placeholder="Project name"
              style={{ background: "var(--bg2)", border: "1px solid var(--bd2)", borderRadius: 8, padding: "8px 12px", fontSize: 14, color: "var(--tx0)", outline: "none", width: "100%", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setRenameModal(null)}
                style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid var(--bd2)", background: "var(--bg3)", color: "var(--tx1)", fontSize: 13, cursor: "pointer" }}
              >Cancel</button>
              <button
                onClick={() => void handleRenameSubmit()}
                disabled={actionLoading || !renameModal.value.trim()}
                style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--ac)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: (actionLoading || !renameModal.value.trim()) ? 0.6 : 1 }}
              >{actionLoading ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={handleProjectCreated}
      />

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
