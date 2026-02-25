import { useState } from "react";
import { api } from "../../api";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";

interface MembersModalProps {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
}

export function MembersModal({ open, workspaceId, onClose }: MembersModalProps) {
  const { members, setMembers } = useWorkspaceContext();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"Admin" | "Editor" | "Viewer">("Viewer");

  if (!open) return null;

  const invite = async () => {
    if (!email.trim()) return;
    try {
      await api.post(`/workspaces/${workspaceId}/members`, { email, role: role.toLowerCase() });
    } catch {
      await Promise.resolve();
    }
    setMembers([
      ...members,
      { id: crypto.randomUUID(), name: email.split("@")[0], email, role },
    ]);
    setEmail("");
  };

  const updateRole = (memberId: string, nextRole: "Admin" | "Editor" | "Viewer") => {
    setMembers(members.map((member) => (member.id === memberId ? { ...member, role: nextRole } : member)));
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={title}>Members</h3>
        <div style={row}>
          <input className="auth-input" placeholder="member@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <select className="auth-select" value={role} onChange={(event) => setRole(event.target.value as "Admin" | "Editor" | "Viewer")}>
            <option>Admin</option>
            <option>Editor</option>
            <option>Viewer</option>
          </select>
          <button className="btn btn-primary" onClick={() => void invite()}>Invite</button>
        </div>
        <div style={{ display: "grid", gap: 8, maxHeight: 260, overflow: "auto" }}>
          {members.map((member) => (
            <div key={member.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 90px", gap: 10, alignItems: "center", border: "1px solid var(--bd)", borderRadius: "var(--r6)", padding: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 999, background: "var(--acg)", display: "grid", placeItems: "center" }}>{member.name.slice(0, 1).toUpperCase()}</div>
              <div>
                <p>{member.name}</p>
                <p style={{ color: "var(--tx1)", fontSize: 12 }}>{member.email}</p>
              </div>
              <select className="auth-select" value={member.role} onChange={(event) => updateRole(member.id, event.target.value as "Admin" | "Editor" | "Viewer")}> 
                <option>Admin</option>
                <option>Editor</option>
                <option>Viewer</option>
              </select>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, color: "var(--tx1)", fontSize: 12 }}>
          <span>Admin — can invite, delete, run pipelines, edit all data</span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Close</button>
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
  width: "min(720px, 92vw)",
  background: "var(--bg1)",
  border: "1px solid var(--bd2)",
  borderRadius: "var(--r12)",
  padding: 14,
};

const title: React.CSSProperties = { marginBottom: 10, fontSize: 16 };

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 130px 90px",
  gap: 8,
  marginBottom: 12,
};
