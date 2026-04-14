import { useEffect, useState } from "react";
import {
  fetchWorkspaceMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  type WorkspaceMemberOut,
} from "../api";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";

const ROLE_COLORS: Record<string, string> = {
  admin: "#5b6af0",
  editor: "#a78bfa",
  viewer: "#94a3b8",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  pending: "#eab308",
};

export function TeamSettings() {
  const { activeWorkspaceId } = useWorkspaceContext();
  const workspaceId = activeWorkspaceId !== "default" ? activeWorkspaceId : null;
  const [members, setMembers] = useState<WorkspaceMemberOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    fetchWorkspaceMembers(workspaceId)
      .then(setMembers)
      .catch(() => { /* non-fatal */ })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleInvite = async () => {
    if (!workspaceId) return;
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) { setError("Email is required."); return; }
    if (!/\S+@\S+\.\S+/.test(trimmed)) { setError("Enter a valid email address."); return; }
    setInviting(true);
    try {
      const m = await inviteMember(workspaceId, trimmed, role);
      setMembers((prev) => [...prev.filter((x) => x.email !== trimmed), m]);
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
    if (!workspaceId) return;
    try {
      const updated = await updateMemberRole(workspaceId, member.id, newRole);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      showToast(e.response?.data?.detail ?? "Could not update role");
    }
  };

  const handleRemove = async (member: WorkspaceMemberOut) => {
    if (!workspaceId || !window.confirm(`Remove ${member.email}?`)) return;
    try {
      await removeMember(workspaceId, member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      showToast("Member removed");
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      showToast(e.response?.data?.detail ?? "Could not remove member");
    }
  };

  return (
    <section style={{ display: "grid", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 18, color: "#e8e8f0", marginBottom: 6 }}>Team Members</h2>
        <p style={{ color: "#64748b", fontSize: 13 }}>
          Invite colleagues to collaborate on your workspace. They'll see shared projects, dashboards,
          and pipelines.
        </p>
      </div>

      {/* Invite form */}
      <div
        style={{
          background: "#0f1117",
          border: "1px solid #1e293b",
          borderRadius: 10,
          padding: "20px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: "#94a3b8", marginBottom: 2 }}>
          Invite a team member
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="email"
            placeholder="colleague@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleInvite()}
            style={{
              flex: "1 1 200px",
              height: 36,
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              color: "#e2e8f0",
              fontSize: 13,
              padding: "0 12px",
              outline: "none",
            }}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "editor" | "viewer")}
            style={{
              height: 36,
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              color: "#e2e8f0",
              fontSize: 13,
              padding: "0 10px",
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            onClick={() => void handleInvite()}
            disabled={inviting}
            style={{
              height: 36,
              background: "#5b6af0",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              padding: "0 18px",
              cursor: inviting ? "not-allowed" : "pointer",
              opacity: inviting ? 0.65 : 1,
            }}
          >
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </div>
        {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
      </div>

      {/* Member table */}
      <div
        style={{
          background: "#0f1117",
          border: "1px solid #1e293b",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 110px 90px 48px",
            gap: 8,
            padding: "10px 20px",
            borderBottom: "1px solid #1e293b",
            fontSize: 11,
            fontWeight: 700,
            color: "#475569",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <span>Email</span>
          <span>Role</span>
          <span>Status</span>
          <span></span>
        </div>

        {loading && (
          <div style={{ padding: "24px 20px", color: "#475569", fontSize: 13 }}>Loading…</div>
        )}

        {!loading && members.length === 0 && (
          <div style={{ padding: "24px 20px", color: "#475569", fontSize: 13 }}>
            No members yet. Invite your team above.
          </div>
        )}

        {!loading &&
          members.map((m) => (
            <div
              key={m.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px 90px 48px",
                gap: 8,
                alignItems: "center",
                padding: "12px 20px",
                borderBottom: "1px solid #1e293b",
                opacity: m.status === "pending" ? 0.75 : 1,
              }}
            >
              <div style={{ fontSize: 13, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.email}
              </div>
              <select
                value={m.role}
                onChange={(e) => void handleRoleChange(m, e.target.value as "admin" | "editor" | "viewer")}
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: `1px solid ${ROLE_COLORS[m.role] ?? "#334155"}40`,
                  borderRadius: 6,
                  color: ROLE_COLORS[m.role] ?? "#94a3b8",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 6px",
                  cursor: "pointer",
                  outline: "none",
                  height: 28,
                }}
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: STATUS_COLORS[m.status] ?? "#94a3b8",
                  textTransform: "capitalize",
                }}
              >
                {m.status}
              </span>
              <button
                onClick={() => void handleRemove(m)}
                title="Remove member"
                style={{
                  background: "none",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  color: "#64748b",
                  width: 30,
                  height: 30,
                  cursor: "pointer",
                  fontSize: 16,
                  display: "grid",
                  placeItems: "center",
                  transition: "all 0.15s",
                }}
                onMouseOver={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#ef4444";
                  (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
                }}
                onMouseOut={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#334155";
                  (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
                }}
              >
                ×
              </button>
            </div>
          ))}
      </div>

      {/* Role legend */}
      <div style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 4 }}>
        <span><b style={{ color: ROLE_COLORS.admin }}>Admin</b> — can invite members, manage workspace settings, run pipelines, edit all data</span>
        <span><b style={{ color: ROLE_COLORS.editor }}>Editor</b> — can create and edit projects, pipelines, and dashboards</span>
        <span><b style={{ color: ROLE_COLORS.viewer }}>Viewer</b> — read-only access to shared resources</span>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "10px 20px",
            fontSize: 13,
            color: "#e2e8f0",
            zIndex: 999,
            pointerEvents: "none",
          }}
        >
          {toast}
        </div>
      )}
    </section>
  );
}
