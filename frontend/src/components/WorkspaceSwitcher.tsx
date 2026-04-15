import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";

export function WorkspaceSwitcher() {
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    createWorkspace,
  } = useWorkspaceContext();

  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [planGated, setPlanGated] = useState(false);

  const personal = workspaces.filter((w) => w.workspace_type === "personal");
  const collab = workspaces.filter((w) => w.workspace_type === "collab");

  async function handleCreateCollab(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    setPlanGated(false);
    try {
      const ws = await createWorkspace(name, "collab");
      setActiveWorkspaceId(ws.id);
      setNewName("");
      setCreating(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Failed to create workspace.";
      const msgStr = typeof msg === "string" ? msg : JSON.stringify(msg);
      // Detect plan-gate errors from backend
      if (/plan|upgrade|limit|tier|professional|team|business/i.test(msgStr)) {
        setPlanGated(true);
      } else {
        setError(msgStr);
      }
    }
  }

  return (
    <div className="workspace-switcher">
      {/* Personal workspaces */}
      <div className="ws-section-label">Personal</div>
      {personal.map((w) => (
        <button
          key={w.id}
          className={`ws-item ${activeWorkspaceId === w.id || (activeWorkspaceId === "default" && personal.length > 0 && w.id === personal[0].id) ? "ws-item--active" : ""}`}
          onClick={() => setActiveWorkspaceId(w.id)}
          title={w.name}
        >
          <span className="ws-icon">🏠</span>
          <span className="ws-name">My Workspace</span>
        </button>
      ))}
      {/* Fallback only if no personal workspace exists in DB yet */}
      {personal.length === 0 && (
        <button
          className={`ws-item ${activeWorkspaceId === "default" ? "ws-item--active" : ""}`}
          onClick={() => setActiveWorkspaceId("default")}
          title="My Workspace"
        >
          <span className="ws-icon">🏠</span>
          <span className="ws-name">My Workspace</span>
        </button>
      )}

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
        planGated ? (
          <div className="ws-create-form" style={{ gap: 4 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--tx1)", lineHeight: 1.5 }}>
              Collab workspaces require a <strong>Team plan</strong> or higher.
            </p>
            <button
              type="button"
              onClick={() => navigate("/settings/billing")}
              style={{ background: "var(--ac)", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer", marginBottom: 4 }}
            >
              Upgrade plan
            </button>
            <button
              type="button"
              className="ws-create-cancel"
              onClick={() => { setCreating(false); setNewName(""); setPlanGated(false); }}
            >
              Cancel
            </button>
          </div>
        ) : (
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
        )
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
