import { useState } from "react";
import type { Project } from "../../contexts/WorkspaceContext";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";
import { deleteProject } from "../../api";
import { NewProjectModal } from "./NewProjectModal";

interface ProjectModalProps {
  open: boolean;
  onSelect: (project: Project) => void;
  onClose: () => void;
}

export function ProjectModal({ open, onSelect, onClose }: ProjectModalProps) {
  const { projects, projectsLoading, refreshProjects, activeProject, setActiveProject } = useWorkspaceContext();
  const [newOpen, setNewOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!open) return null;

  async function handleDelete(project: Project, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Delete project "${project.name}"? This cannot be undone.`)) return;
    setDeletingId(project.id);
    try {
      await deleteProject(project.id);
      if (activeProject?.id === project.id) setActiveProject(null);
      await refreshProjects();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div style={overlay}>
        <div style={modal}>
          <h3 style={{ marginBottom: 10, fontSize: 15, fontWeight: 600, color: "var(--tx0)" }}>Select Project</h3>
          <div style={{ display: "grid", gap: 8, maxHeight: 240, overflow: "auto" }}>
            {projectsLoading && <p style={{ fontSize: 13, color: "var(--tx1)" }}>Loading…</p>}
            {!projectsLoading && projects.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--tx1)" }}>No projects yet.</p>
            )}
            {projects.map((project) => (
              <div key={project.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  className="btn"
                  style={{ justifyContent: "flex-start", display: "flex", height: 36, gap: 8, flex: 1, minWidth: 0 }}
                  onClick={() => { onSelect(project); onClose(); }}
                >
                  <span>{project.icon}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
                </button>
                <button
                  title="Delete project"
                  disabled={deletingId === project.id}
                  onClick={(e) => void handleDelete(project, e)}
                  style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 6, border: "1px solid var(--bd2)", background: "none", cursor: "pointer", color: "var(--tx2)", fontSize: 14, display: "grid", placeItems: "center", opacity: deletingId === project.id ? 0.4 : 1 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, borderTop: "1px solid var(--bd)", paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
            <button className="btn" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}>+ New Project</button>
          </div>
        </div>
      </div>

      <NewProjectModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(project) => { onSelect(project); onClose(); }}
      />
    </>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#00000080",
  display: "grid",
  placeItems: "center",
  zIndex: 40,
};

const modal: React.CSSProperties = {
  background: "var(--bg2)",
  border: "1px solid var(--bd2)",
  borderRadius: 12,
  padding: "24px 24px 20px",
  width: 360,
  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
};
