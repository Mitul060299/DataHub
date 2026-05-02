import { useEffect, useState } from "react";
import {
  fetchOrganization,
  fetchOrgMembers,
  inviteOrgMember,
  removeOrgMember,
  type OrgMemberOut,
  type OrgOut,
} from "../api";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  pending: "#eab308",
};

/**
 * OrgMemberSettings — Settings → Team tab UI.
 *
 * Shows the current user's organization (team account), the seats used vs
 * purchased, and lets the owner invite/remove members. All members share the
 * org owner's plan and quota.
 */
export function OrgMemberSettings() {
  const [org, setOrg] = useState<OrgOut | null>(null);
  const [members, setMembers] = useState<OrgMemberOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planGate, setPlanGate] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const reload = async () => {
    setLoading(true);
    try {
      const [o, ms] = await Promise.all([fetchOrganization(), fetchOrgMembers()]);
      setOrg(o);
      setMembers(ms);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const planAllowsInvites = !!org && /^(team|business|enterprise)$/i.test(org.plan);
  const seatsRemaining = org ? Math.max(0, org.seats_purchased - org.seats_used) : 0;

  const handleInvite = async () => {
    if (!org?.is_owner) return;
    setError(null);
    setPlanGate(null);
    const trimmed = email.trim();
    if (!trimmed) { setError("Email is required."); return; }
    if (!/\S+@\S+\.\S+/.test(trimmed)) { setError("Enter a valid email address."); return; }
    setInviting(true);
    try {
      const m = await inviteOrgMember(trimmed);
      setMembers((prev) => [...prev.filter((x) => x.email.toLowerCase() !== trimmed.toLowerCase() || x.is_owner), m]);
      setEmail("");
      showToast(`Invite sent to ${trimmed}`);
      // Refresh seat usage
      try { setOrg(await fetchOrganization()); } catch { /* ignore */ }
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string | { code?: string; message?: string } } }; message?: string };
      const detail = e.response?.data?.detail;
      if (detail && typeof detail === "object") {
        const code = detail.code;
        const message = detail.message ?? "Invite failed";
        if (code === "team_plan_required" || code === "seat_limit_reached") {
          setPlanGate(message);
        } else {
          setError(message);
        }
      } else {
        const msg = (typeof detail === "string" ? detail : null) ?? e.message ?? "Invite failed";
        setError(msg);
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (member: OrgMemberOut) => {
    if (member.is_owner) return;
    if (!window.confirm(`Remove ${member.email} from your team?`)) return;
    try {
      await removeOrgMember(member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      showToast("Member removed");
      try { setOrg(await fetchOrganization()); } catch { /* ignore */ }
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      showToast(e.response?.data?.detail ?? "Could not remove member");
    }
  };

  if (loading) {
    return (
      <section style={{ display: "grid", gap: 8 }}>
        <h2 style={{ fontSize: 18, color: "#e8e8f0" }}>Team Members</h2>
        <p style={{ color: "#64748b", fontSize: 13 }}>Loading…</p>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 18, color: "#e8e8f0", marginBottom: 6 }}>Team Members</h2>
        <p style={{ color: "#64748b", fontSize: 13 }}>
          Invite teammates to join your account. Each invitee gets their own login and projects, and you all
          share the same plan, quota, and bill. Available on Team and above.
        </p>
      </div>

      {/* Org summary */}
      {org && (
        <div
          style={{
            background: "#0f1117",
            border: "1px solid #1e293b",
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
            <div style={{ color: "#e8e8f0", fontWeight: 600, fontSize: 14 }}>{org.name}</div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
              Plan: <strong style={{ color: "#e8e8f0" }}>{org.plan}</strong> ·{" "}
              Seats: <strong style={{ color: "#e8e8f0" }}>{org.seats_used}</strong> / {org.seats_purchased}
              {seatsRemaining > 0 && (
                <span style={{ color: "#22c55e", marginLeft: 8 }}>
                  ({seatsRemaining} available)
                </span>
              )}
            </div>
          </div>
          {org.is_owner && (
            <a
              href="/settings/billing"
              style={{
                background: "transparent",
                color: "#5b6af0",
                textDecoration: "none",
                padding: "6px 12px",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12,
                border: "1px solid #5b6af0",
              }}
            >
              Manage seats
            </a>
          )}
        </div>
      )}

      {/* Plan gate (Free / Starter / Pro) */}
      {org?.is_owner && !planAllowsInvites && (
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
              Team accounts are a Team-tier feature
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>
              Upgrade to Team to invite up to 2 colleagues into your account (3 seats total) and
              share one bill, plan, and quota.
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
      {org?.is_owner && planAllowsInvites && (
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
              disabled={inviting || seatsRemaining === 0}
              style={{
                flex: "1 1 200px",
                height: 36,
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "0 12px",
                color: "#e8e8f0",
                fontSize: 13,
              }}
            />
            <button
              type="button"
              onClick={() => void handleInvite()}
              disabled={inviting || seatsRemaining === 0}
              style={{
                background: seatsRemaining === 0 ? "#334155" : "#5b6af0",
                color: "#fff",
                border: "none",
                padding: "0 18px",
                height: 36,
                borderRadius: 8,
                cursor: inviting || seatsRemaining === 0 ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </div>
          {seatsRemaining === 0 && (
            <div style={{ color: "#eab308", fontSize: 12 }}>
              No seats remaining. Add seats from{" "}
              <a href="/settings/billing" style={{ color: "#5b6af0" }}>Billing</a> to invite more.
            </div>
          )}
          {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
          {planGate && (
            <div style={{ color: "#eab308", fontSize: 12 }}>
              {planGate}{" "}
              <a href="/settings/billing" style={{ color: "#5b6af0" }}>Manage plan</a>
            </div>
          )}
        </div>
      )}

      {/* Members table */}
      <div
        style={{
          background: "#0f1117",
          border: "1px solid #1e293b",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1e293b" }}>
              <th style={{ textAlign: "left", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Email</th>
              <th style={{ textAlign: "left", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Role</th>
              <th style={{ textAlign: "left", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}>Status</th>
              <th style={{ textAlign: "right", padding: "10px 16px", color: "#94a3b8", fontWeight: 600 }}></th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                  No members yet.
                </td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id} style={{ borderTop: "1px solid #1e293b" }}>
                <td style={{ padding: "12px 16px", color: "#e8e8f0" }}>{m.email}</td>
                <td style={{ padding: "12px 16px", color: m.is_owner ? "#5b6af0" : "#94a3b8" }}>
                  {m.is_owner ? "Owner" : "Member"}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      borderRadius: 999,
                      background: `${STATUS_COLORS[m.status] ?? "#334155"}22`,
                      color: STATUS_COLORS[m.status] ?? "#94a3b8",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {m.status}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  {!m.is_owner && org?.is_owner && (
                    <button
                      type="button"
                      onClick={() => void handleRemove(m)}
                      style={{
                        background: "transparent",
                        color: "#ef4444",
                        border: "1px solid #ef4444",
                        padding: "4px 12px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#1e293b",
            color: "#e8e8f0",
            padding: "12px 18px",
            borderRadius: 8,
            border: "1px solid #334155",
            fontSize: 13,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {toast}
        </div>
      )}
    </section>
  );
}

export default OrgMemberSettings;
