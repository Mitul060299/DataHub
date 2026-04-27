import { useEffect, useState } from "react";
import {
  fetchProjectMembers,
  inviteProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
  type ProjectMemberOut,
} from "../api";

const ROLE_COLORS: Record<string, string> = {
  owner: "#5b6af0",
  editor: "#a78bfa",
  viewer: "#94a3b8",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  pending: "#eab308",
};

export interface ProjectMemberSettingsProps {
  projectId: string;
  /** Whether the calling user owns the project. Disables invite/role/remove actions when false. */
  isOwner: boolean;
  /** Optional plan label for the inline upgrade gate when on Free / Professional. */
  callerPlan?: string;
}

/**
 * ProjectMemberSettings — inline invite + manage UI for project-level
 * collaboration. Renders inside Project Settings → Members tab.
 *
 * Replaces the workspace-scoped TeamSettings component. Plan-gated states
 * (Free/Pro -> upgrade card, at-cap -> at-cap pill) appear inline rather
 * than as 403 dialogs.
 */
export function ProjectMemberSettings({ projectId, isOwner, callerPlan }: ProjectMemberSettingsProps) {
  const [members, setMembers] = useState<ProjectMemberOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [planGate, setPlanGate] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetchProjectMembers(projectId)
      .then(setMembers)
      .catch(() => { /* non-fatal */ })
      .finally(() => setLoading(false));
  }, [projectId]);

  const planIsFreeOrPro = !!callerPlan && /^(free|professional|pro)$/i.test(callerPlan);

  const handleInvite = async () => {
    if (!projectId || !isOwner) return;
    setError(null);
    setPlanGate(null);
    const trimmed = email.trim();
    if (!trimmed) { setError("Email is required."); return; }
    if (!/\S+@\S+\.\S+/.test(trimmed)) { setError("Enter a valid email address."); return; }
    setInviting(true);
    try {
      const m = await inviteProjectMember(projectId, trimmed, role);
      setMembers((prev) => [...prev.filter((x) => x.email.toLowerCase() !== trimmed.toLowerCase()), m]);
      setEmail("");
      showToast(`Invite sent to ${trimmed}`);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string | { code?: string; message?: string } } }; message?: string };
      const detail = e.response?.data?.detail;
      if (detail && typeof detail === "object") {
        const code = detail.code;
        const message = detail.message ?? "Invite failed";
        if (code === "member_limit_reached" || code === "collaborative_project_limit_reached") {
          setPlanGate(message);
        } else {
          setError(message);
        }
      } else {
        const msg = (typeof detail === "string" ? detail : null) ?? e.message ?? "Invite failed";
        if (msg.toLowerCase().includes("upgrade") || msg.toLowerCase().includes("limit")) {
          setPlanGate(msg);
        } else {
          setError(msg);
        }
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (member: ProjectMemberOut, newRole: "editor" | "viewer") => {
    if (!projectId || !isOwner) return;
    try {
      const updated = await updateProjectMemberRole(projectId, member.id, newRole);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      showToast(e.response?.data?.detail ?? "Could not update role");
    }
  };

  const handleRemove = async (member: ProjectMemberOut) => {
    if (!projectId) return;
    if (!window.confirm(`Remove ${member.email}?`)) return;
    try {
      await removeProjectMember(projectId, member.id);
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
        <h2 style={{ fontSize: 18, color: "#e8e8f0", marginBottom: 6 }}>Project Members</h2>
        <p style={{ color: "#64748b", fontSize: 13 }}>
          Invite collaborators to this project. They'll see its data sources, pipelines, and dashboards.
          All usage runs against the project owner's plan.
        </p>
      </div>

      {/* Free / Pro plan gate */}
      {isOwner && planIsFreeOrPro && (
        <div
          style={{
            background: "linear-gradient(135deg, rgba(91,106,240,0.12), rgba(167,139,250,0.08))",
            border: "1px solid #5b6af0",
            borderRadius: 10,
            padding: "16px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ color: "#e8e8f0", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              Project members are a Team feature
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>
              Upgrade to Team to invite collaborators (10 members / project, 5 collaborative projects).
            </div>
          </div>
          <a
            href="/settings/billing"
            style={{
              background: "#5b6af0",
              color: "#fff",
              textDecoration: "none",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Upgrade to Team
          </a>
        </div>
      )}

      {/* Invite form (owner only, plan permitting) */}
      {isOwner && !planIsFreeOrPro && (
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
            Invite a project member
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
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
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
          {planGate && (
            <div
              style={{
                background: "rgba(91,106,240,0.08)",
                border: "1px solid rgba(91,106,240,0.4)",
                borderRadius: 8,
                padding: "10px 12px",
                color: "#c8c8d8",
                fontSize: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span>{planGate}</span>
              <a
                href="/settings/billing"
                style={{ color: "#5b6af0", fontWeight: 600, textDecoration: "none", fontSize: 12 }}
              >
                Upgrade →
              </a>
            </div>
          )}
        </div>
      )}

      {/* Member table */}
      <div
        style={{
          background: "#0f1117",
          border: "1px solid #1e293b",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isOwner ? "1fr 110px 90px 48px" : "1fr 110px 90px",
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
          {isOwner && <span></span>}
        </div>

        {loading && (
          <div style={{ padding: "24px 20px", color: "#475569", fontSize: 13 }}>Loading…</div>
        )}

        {!loading && members.length === 0 && (
          <div style={{ padding: "24px 20px", color: "#475569", fontSize: 13 }}>
            No members yet. {isOwner ? "Invite your team above." : "The project owner hasn't invited anyone."}
          </div>
        )}

        {!loading && members.map((m) => (
          <div
            key={m.id}
            style={{
              display: "grid",
              gridTemplateColumns: isOwner ? "1fr 110px 90px 48px" : "1fr 110px 90px",
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
            {isOwner ? (
              <select
                value={m.role === "owner" ? "editor" : m.role}
                onChange={(e) => void handleRoleChange(m, e.target.value as "editor" | "viewer")}
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
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 600, color: ROLE_COLORS[m.role] ?? "#94a3b8", textTransform: "capitalize" }}>
                {m.role}
              </span>
            )}
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
            {isOwner && (
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
            )}
          </div>
        ))}
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "10px 16px",
            color: "#e2e8f0",
            fontSize: 13,
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
            zIndex: 1000,
          }}
        >
          {toast}
        </div>
      )}
    </section>
  );
}

export default ProjectMemberSettings;
