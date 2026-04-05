import { useEffect, useState } from "react";
import {
  fetchWorkspaceMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  type WorkspaceMemberOut,
} from "../api";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import "./TeamPanel.css";

interface TeamPanelProps {
  workspaceId: string;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`team-role-badge team-role-${role}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`team-status-badge team-status-${status}`}>
      {status === "pending" ? "Pending" : "Active"}
    </span>
  );
}

export function TeamPanel({ workspaceId, onClose }: TeamPanelProps) {
  const { workspaceMembers, refreshMembers } = useWorkspaceContext();
  const [members, setMembers] = useState<WorkspaceMemberOut[]>(workspaceMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    if (!workspaceId || workspaceId === "default") return;
    fetchWorkspaceMembers(workspaceId)
      .then(setMembers)
      .catch(() => { /* non-fatal */ });
  }, [workspaceId]);

  const handleInvite = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) { setError("Email is required."); return; }
    if (!/\S+@\S+\.\S+/.test(trimmed)) { setError("Enter a valid email address."); return; }
    setInviting(true);
    try {
      const newMember = await inviteMember(workspaceId, trimmed, role);
      setMembers((prev) => [...prev.filter((m) => m.email !== trimmed), newMember]);
      await refreshMembers(workspaceId);
      setEmail("");
      showToast(`Invite sent to ${trimmed}`);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      const detail = e.response?.data?.detail ?? e.message ?? "Invite failed";
      if (detail.includes("upgrade") || detail.includes("limit")) {
        window.dispatchEvent(new CustomEvent("datahub:plan-upgrade-required", { detail: { feature: "team_members" } }));
      } else {
        setError(detail);
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (member: WorkspaceMemberOut, newRole: "admin" | "editor" | "viewer") => {
    setUpdatingId(member.id);
    try {
      const updated = await updateMemberRole(workspaceId, member.id, newRole);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
      await refreshMembers(workspaceId);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      showToast(e.response?.data?.detail ?? "Could not update role");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (member: WorkspaceMemberOut) => {
    if (!window.confirm(`Remove ${member.email} from workspace?`)) return;
    try {
      await removeMember(workspaceId, member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      await refreshMembers(workspaceId);
      showToast("Member removed");
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      showToast(e.response?.data?.detail ?? "Could not remove member");
    }
  };

  const activeCount = members.filter((m) => m.status === "active").length;
  const pendingCount = members.filter((m) => m.status === "pending").length;

  return (
    <div
      className="team-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside className="team-panel">
        {/* Header */}
        <div className="team-panel-header">
          <span className="team-panel-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "middle", marginRight: 6 }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Team
          </span>
          <span className="team-panel-meta">
            {activeCount} active{pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
          </span>
          <button className="team-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="team-panel-body">
          {/* Invite form */}
          <section className="team-invite-section">
            <div className="team-invite-row">
              <input
                className="team-invite-input"
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleInvite()}
              />
              <select
                className="team-role-select"
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "editor" | "viewer")}
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            {error && <div className="team-error">{error}</div>}
            <button
              className="team-invite-btn"
              onClick={() => void handleInvite()}
              disabled={inviting}
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </section>

          <div className="team-divider" />

          {/* Role legend */}
          <div className="team-legend">
            <span><RoleBadge role="admin" /> can invite, manage members, run everything</span>
            <span><RoleBadge role="editor" /> create &amp; edit data, pipelines, dashboards</span>
            <span><RoleBadge role="viewer" /> read-only access</span>
          </div>

          {/* Member list */}
          <div className="team-member-list">
            {members.length === 0 && (
              <div className="team-empty">No members yet. Invite your team above.</div>
            )}
            {members.map((m) => (
              <div key={m.id} className={`team-member-row ${m.status === "pending" ? "team-member-pending" : ""}`}>
                <div className="team-member-avatar">
                  {m.email.slice(0, 1).toUpperCase()}
                  {m.status === "active" && <span className="team-online-dot" />}
                </div>
                <div className="team-member-info">
                  <div className="team-member-email">{m.email}</div>
                  <div className="team-member-sub">
                    <StatusBadge status={m.status} />
                    {m.status === "pending" && (
                      <span className="team-invited-by">invited by {m.invited_by}</span>
                    )}
                  </div>
                </div>
                <div className="team-member-actions">
                  <select
                    className="team-role-select team-role-select-sm"
                    value={m.role}
                    onChange={(e) => void handleRoleChange(m, e.target.value as "admin" | "editor" | "viewer")}
                    disabled={updatingId === m.id}
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    className="team-remove-btn"
                    onClick={() => void handleRemove(m)}
                    title="Remove member"
                    aria-label={`Remove ${m.email}`}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Toast */}
        {toast && <div className="team-toast">{toast}</div>}
      </aside>
    </div>
  );
}
