import { useState } from "react";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";

export function WorkspaceSwitcher() {
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    createWorkspace,
  } = useWorkspaceContext();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const personal = workspaces.filter((w) => w.workspace_type === "personal");
  const collab = workspaces.filter((w) => w.workspace_type === "collab");

  async function handleCreateCollab(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const ws = await createWorkspace(name, "collab");
      setActiveWorkspaceId(ws.id);
      setNewName("");
      setCreating(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Failed to create workspace.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  }

  return (
    <div className="workspace-switcher">
      {/* Personal workspace */}
      <div className="ws-section-label">Personal</div>
      {personal.map((w) => (
        <button
          key={w.id}
          className={`ws-item ${activeWorkspaceId === w.id ? "ws-item--active" : ""}`}
          onClick={() => setActiveWorkspaceId(w.id)}
          title={w.name}
        >
          <span className="ws-icon">🏠</span>
          <span className="ws-name">{w.name}</span>
        </button>
      ))}

      {/* Collab workspaces */}
      <div className="ws-section-label" style={{ marginTop: "0.75rem" }}>
        Collab Spaces
      </div>
      {collab.map((w) => (
        <button
          key={w.id}
          className={`ws-item ${activeWorkspaceId === w.id ? "ws-item--active" : ""}`}
          onClick={() => setActiveWorkspaceId(w.id)}
          title={w.name}
        >
          <span className="ws-icon">👥</span>
          <span className="ws-name">{w.name}</span>
        </button>
      ))}

      {/* Create collab workspace */}
      {creating ? (
        <form onSubmit={handleCreateCollab} className="ws-create-form">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Workspace name"
            className="ws-create-input"
          />
          <button type="submit" className="ws-create-btn">Create</button>
          <button
            type="button"
            className="ws-create-cancel"
            onClick={() => { setCreating(false); setNewName(""); setError(null); }}
          >
            Cancel
          </button>
          {error && <div className="ws-create-error">{error}</div>}
        </form>
      ) : (
        <button
          className="ws-add-btn"
          onClick={() => setCreating(true)}
          title="Create a new collab workspace (Team plan or higher)"
        >
          + New Collab Space
        </button>
      )}
    </div>
  );
}
