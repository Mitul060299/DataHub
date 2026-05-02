import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import { ProjectMemberSettings } from "./ProjectMemberSettings";

/**
 * TeamSettings � project-scoped team management.
 * Delegates to ProjectMemberSettings using the currently active project.
 */
export function TeamSettings() {
  const { activeProject } = useWorkspaceContext();

  if (!activeProject) {
    return (
      <section style={{ display: "grid", gap: 8 }}>
        <h2 style={{ fontSize: 18, color: "#e8e8f0" }}>Team Members</h2>
        <p style={{ color: "#64748b", fontSize: 13 }}>Select a project to manage its members.</p>
      </section>
    );
  }

  return <ProjectMemberSettings projectId={activeProject.id} isOwner={true} />;
}
