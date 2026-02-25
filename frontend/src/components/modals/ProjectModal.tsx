import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Project } from "../../contexts/WorkspaceContext";

interface ProjectModalProps {
  open: boolean;
  workspaceId: string;
  onSelect: (project: Project) => void;
  onClose: () => void;
}

type ApiProject = {
  id: string;
  name: string;
  member_count?: number;
  description?: string;
  color?: string;
};

export function ProjectModal({ open, workspaceId, onSelect, onClose }: ProjectModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        const response = await api.get<ApiProject[]>(`/workspaces/${workspaceId}/projects`);
        const mapped = response.data.map((project) => ({
          id: project.id,
          name: project.name,
          color: project.color ?? "#5b6af0",
          initial: project.name.slice(0, 1).toUpperCase(),
          workspaceId,
          memberCount: project.member_count ?? 0,
          description: project.description,
        }));
        setProjects(mapped);
      } catch {
        setProjects([]);
      }
    };
    void load();
  }, [open, workspaceId]);

  if (!open) return null;

  const createProject = async () => {
    if (!name.trim()) return;
    try {
      const response = await api.post(`/workspaces/${workspaceId}/projects`, { name, description });
      const created = response.data as ApiProject;
      setProjects([
        ...projects,
        {
          id: created.id ?? crypto.randomUUID(),
          name,
          color: created.color ?? "#5b6af0",
          initial: name.slice(0, 1).toUpperCase(),
          workspaceId,
          memberCount: created.member_count ?? 0,
          description,
        },
      ]);
    } catch {
      setProjects([
        ...projects,
        {
          id: crypto.randomUUID(),
          name,
          color: "#5b6af0",
          initial: name.slice(0, 1).toUpperCase(),
          workspaceId,
          memberCount: 1,
          description,
        },
      ]);
    }
    setName("");
    setDescription("");
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={{ marginBottom: 10 }}>Projects</h3>
        <div style={{ display: "grid", gap: 8, maxHeight: 240, overflow: "auto" }}>
          {projects.map((project) => (
            <button key={project.id} className="btn" style={{ justifyContent: "space-between", display: "flex", height: 36 }} onClick={() => { onSelect(project); onClose(); }}>
              <span>{project.name}</span>
              <span style={{ color: "var(--tx1)", fontSize: 12 }}>{project.memberCount ?? 0} members</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, borderTop: "1px solid var(--bd)", paddingTop: 12 }}>
          <p style={{ marginBottom: 8 }}>+ New project</p>
          <div style={{ display: "grid", gap: 8 }}>
            <input className="auth-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" />
            <input className="auth-input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button className="btn" onClick={onClose}>Close</button>
              <button className="btn btn-primary" onClick={() => void createProject()}>Create</button>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  width: "min(560px, 92vw)",
  background: "var(--bg1)",
  border: "1px solid var(--bd2)",
  borderRadius: "var(--r12)",
  padding: 14,
};
