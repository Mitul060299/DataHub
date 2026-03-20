import { useState } from "react";
import type { Project } from "../../contexts/WorkspaceContext";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";
import { NewProjectModal } from "./NewProjectModal";

interface ProjectModalProps {
  open: boolean;
  workspaceId: string;
  onSelect: (project: Project) => void;
  onClose: () => void;
}

export function ProjectModal({ open, onSelect, onClose }: ProjectModalProps) {
  const { projects, projectsLoading } = useWorkspaceContext();
  const [newOpen, setNewOpen] = useState(false);

  if (!open) return null;

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
              <button
                key={project.id}
                className="btn"
                style={{ justifyContent: "flex-start", display: "flex", height: 36, gap: 8 }}
                onClick={() => { onSelect(project); onClose(); }}
              >
                <span>{project.icon}</span>
                <span>{project.name}</span>
              </button>
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
