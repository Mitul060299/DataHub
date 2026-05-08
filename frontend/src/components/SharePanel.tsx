import { useEffect, useState, type CSSProperties } from "react";
import {
  getDashboardAccessList,
  inviteDashboardAccess,
  revokeDashboardAccess,
  generateShareToken,
  deleteShareToken,
  getDashboardViews,
} from "../api";

interface AccessGrant {
  id: string;
  dashboard_id: string;
  granted_to_user_id?: string | null;
  granted_to_email?: string | null;
  access_level: string;
  granted_by: string;
  expires_at?: string | null;
  token?: string | null;
  created_at: string;
}

interface ViewRecord {
  id: string;
  dashboard_id: string;
  viewed_by_user_id?: string | null;
  viewed_by_email?: string | null;
  viewed_at: string;
  ip_address?: string | null;
}

interface SharePanelProps {
  dashboardId: string;
  shareToken: string | null;
  onClose: () => void;
}

type Tab = "invite" | "public" | "audit";

export function SharePanel({ dashboardId, shareToken: initialToken, onClose }: SharePanelProps) {
  const [tab, setTab] = useState<Tab>("invite");
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [views, setViews] = useState<ViewRecord[]>([]);
  const [shareToken, setShareToken] = useState(initialToken);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [loadingGrants, setLoadingGrants] = useState(true);

  const publicUrl = shareToken
    ? `${window.location.origin}/dashboard/share/${shareToken}`
    : null;

  useEffect(() => {
    const load = async () => {
      setLoadingGrants(true);
      try {
        const data = await getDashboardAccessList(dashboardId);
        setGrants(data);
      } catch { /* ignore */ }
      finally { setLoadingGrants(false); }
    };
    void load();
  }, [dashboardId]);

  useEffect(() => {
    if (tab !== "audit") return;
    const load = async () => {
      try {
        const data = await getDashboardViews(dashboardId);
        setViews(data);
      } catch { /* ignore */ }
    };
    void load();
  }, [tab, dashboardId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleInvite = async () => {
    setError(null);
    if (!email.trim()) { setError("Email is required."); return; }
    setInviting(true);
    try {
      await inviteDashboardAccess(dashboardId, { granted_to_email: email.trim(), access_level: role });
      const data = await getDashboardAccessList(dashboardId);
      setGrants(data);
      setEmail("");
      showToast(`Invited ${email.trim()}`);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e.response?.data?.detail ?? e.message ?? "Invite failed");
    } finally { setInviting(false); }
  };

  const handleRevoke = async (grantId: string) => {
    try {
      await revokeDashboardAccess(dashboardId, grantId);
      setGrants((prev) => prev.filter((g) => g.id !== grantId));
      showToast("Access revoked");
    } catch {
      showToast("Failed to revoke access");
    }
  };

  const handleGenerateToken = async () => {
    setGenLoading(true);
    try {
      const result = await generateShareToken(dashboardId);
      setShareToken(result.share_token);
      showToast("Public link generated");
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      showToast(e.response?.data?.detail ?? "Failed to generate link");
    } finally { setGenLoading(false); }
  };

  const handleDeleteToken = async () => {
    setGenLoading(true);
    try {
      await deleteShareToken(dashboardId);
      setShareToken(null);
      showToast("Public link removed");
    } catch {
      showToast("Failed to remove public link");
    } finally { setGenLoading(false); }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => showToast("Copied!"));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        display: "flex",
        justifyContent: "flex-end",
        background: "rgba(0,0,0,0.4)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        className="share-panel-aside"
        style={{
          width: 400,
          background: "#0F1117",
          borderLeft: "1px solid #1E293B",
          height: "100%",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#E2E8F0" }}>🔗 Share</span>
          <button onClick={onClose} aria-label="Close share panel" style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }}>×</button>
        </div>

        {/* Tabs */}
        <div role="tablist" style={{ display: "flex", borderBottom: "1px solid #1E293B" }}>
          {(["invite", "public", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "10px 0",
                background: "none",
                border: "none",
                borderBottom: tab === t ? "2px solid #5B6AF0" : "2px solid transparent",
                color: tab === t ? "#E2E8F0" : "#64748B",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t === "invite" ? "Invite" : t === "public" ? "Public link" : "Audit log"}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Invite tab ── */}
          {tab === "invite" && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  style={inputStyle}
                />
                <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, width: 100, flexShrink: 0 }}>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
              </div>
              {error && <div style={{ color: "#EF4444", fontSize: 12 }}>{error}</div>}
              <button
                onClick={() => void handleInvite()}
                disabled={inviting}
                style={{ ...primaryBtnStyle, opacity: inviting ? 0.7 : 1 }}
              >
                {inviting ? "Inviting…" : "Send invite"}
              </button>

              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: "#64748B", fontWeight: 600, marginBottom: 8 }}>
                  {loadingGrants ? "Loading…" : `${grants.length} grant${grants.length !== 1 ? "s" : ""}`}
                </div>
                {grants.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid #1E293B",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: "#E2E8F0" }}>
                        {g.granted_to_email ?? g.granted_to_user_id ?? "Unknown"}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748B" }}>{g.access_level}</div>
                    </div>
                    <button
                      onClick={() => void handleRevoke(g.id)}
                      style={{ background: "none", border: "1px solid #EF4444", borderRadius: 6, color: "#EF4444", fontSize: 11, padding: "2px 8px", cursor: "pointer" }}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Public link tab ── */}
          {tab === "public" && (
            <>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>
                Anyone with the link can view this dashboard. No login required.
              </p>

              {publicUrl ? (
                <>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={publicUrl} readOnly style={{ ...inputStyle, flex: 1, fontSize: 11 }} />
                    <button
                      onClick={() => copyToClipboard(publicUrl)}
                      style={{ ...primaryBtnStyle, padding: "0 14px", flexShrink: 0 }}
                    >
                      Copy
                    </button>
                  </div>
                  <button
                    onClick={() => void handleDeleteToken()}
                    disabled={genLoading}
                    style={{ ...cancelBtnStyle, borderColor: "#EF4444", color: "#EF4444" }}
                  >
                    Remove public link
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void handleGenerateToken()}
                  disabled={genLoading}
                  style={{ ...primaryBtnStyle, opacity: genLoading ? 0.7 : 1 }}
                >
                  {genLoading ? "Generating…" : "Generate public link"}
                </button>
              )}
            </>
          )}

          {/* ── Audit log tab ── */}
          {tab === "audit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{ fontSize: 12, color: "#64748B", fontWeight: 600, marginBottom: 8 }}>
                {views.length} view{views.length !== 1 ? "s" : ""}
              </div>
              {views.length === 0 && (
                <p style={{ color: "#475569", fontSize: 13 }}>No views recorded yet.</p>
              )}
              {views.map((v) => (
                <div
                  key={v.id}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid #1E293B",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#94A3B8" }}>{v.viewed_by_email ?? v.viewed_by_user_id ?? v.ip_address ?? "Anonymous"}</div>
                  <div style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap" }}>
                    {new Date(v.viewed_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {toast && (
        <div style={toastStyle}>{toast}</div>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
  border: "1px solid #1E293B",
  borderRadius: 8,
  background: "#121827",
  color: "#E2E8F0",
  padding: "8px 10px",
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const primaryBtnStyle: CSSProperties = {
  border: "none",
  borderRadius: 8,
  background: "#5B6AF0",
  color: "#fff",
  padding: "10px 0",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  width: "100%",
};

const cancelBtnStyle: CSSProperties = {
  border: "1px solid #1E293B",
  borderRadius: 8,
  background: "transparent",
  color: "#94A3B8",
  padding: "10px 0",
  fontSize: 13,
  cursor: "pointer",
  width: "100%",
};

const toastStyle: CSSProperties = {
  position: "fixed",
  bottom: 24,
  left: "50%",
  transform: "translateX(-50%)",
  background: "#22C55E",
  color: "#fff",
  fontWeight: 600,
  fontSize: 13,
  borderRadius: 8,
  padding: "10px 20px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
  zIndex: 2000,
};
