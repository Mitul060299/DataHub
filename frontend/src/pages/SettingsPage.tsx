import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { api, listWebhooks, registerWebhook, deleteWebhook, listAuditLogs, listApprovalRequests, approveRequest, rejectRequest } from "../api";
import { BillingSettings } from "../components/BillingSettings";
import { TeamSettings } from "../components/TeamSettings";
import { useAuth } from "../contexts/AuthContext";
import { formatFileSize, useUser } from "../contexts/UserContext";
import { supabase } from "../lib/supabase";
import { billingEnabled } from "../utils/featureFlags";

type SettingsSection = "profile" | "settings" | "billing" | "usage" | "audit" | "team" | "webhooks" | "approvals";

interface SettingsPageProps {
  section: SettingsSection;
}

const asPercent = (used: number, limit: number) => {
  if (limit <= 0) return null;
  if (limit === 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
};

const formatLimit = (value: number, kind: "count" | "bytes") => {
  if (value < 0) return "Unlimited";
  if (kind === "bytes") return formatFileSize(value);
  return String(value);
};

export function SettingsPage({ section }: SettingsPageProps) {
  const navigate = useNavigate();
  const { user: authUser, signOut } = useAuth();
  const { plan, limits, usage, user } = useUser();
  const displayName = useMemo(() => {
    const metadataName = authUser?.user_metadata?.full_name as string | undefined;
    if (metadataName?.trim()) return metadataName.trim();
    if (user?.username?.trim()) return user.username.trim();
    return "datahub.org.in User";
  }, [authUser?.user_metadata?.full_name, user?.username]);
  const email = authUser?.email ?? user?.username ?? "user@datahub.dev";
  const provider = String(authUser?.app_metadata?.provider ?? "").toLowerCase();
  const isSsoUser = provider !== "" && provider !== "email";

  return (
    <div
      style={{
        paddingTop: "52px",
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        background: "#0a0a0c",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "32px 40px 0",
          maxWidth: "1100px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "24px",
            fontWeight: 700,
            color: "#e8e8f0",
            marginBottom: "24px",
          }}
        >
          Settings
        </h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: "0",
          maxWidth: "1100px",
          margin: "0 auto",
          width: "100%",
          padding: "0 40px 60px",
          flex: 1,
        }}
      >
        <SettingsSidebar active={section} />

        <div
          style={{
            background: "#111115",
            border: "1px solid #22222a",
            borderRadius: "12px",
            padding: "32px",
            marginLeft: "16px",
          }}
        >
          {section === "profile" ? (
            <ProfilePanel displayName={displayName} email={email} isSsoUser={isSsoUser} />
          ) : null}
          {section === "settings" ? (
            <GeneralSettingsPanel
              plan={plan}
              limits={limits}
              usage={usage}
              onOpenBilling={() => navigate("/settings/billing")}
              onSignOut={() => signOut().then(() => navigate("/login"))}
            />
          ) : null}
          {section === "billing" ? (
            billingEnabled ? (
              <BillingSettings />
            ) : (
              <section style={{ display: "grid", gap: 8 }}>
                <h2 style={{ fontSize: 18, color: "#e8e8f0" }}>Billing</h2>
                <p style={{ color: "#8888a0", fontSize: 13 }}>
                  Billing is currently disabled in this environment.
                </p>
                <div>
                  <button className="btn btn-primary" onClick={() => navigate("/pricing")}>View Plans</button>
                </div>
              </section>
            )
          ) : null}
          {section === "usage" ? <UsagePanel /> : null}
          {section === "audit" ? <AuditPanel /> : null}
          {section === "team" ? <TeamSettings /> : null}
          {section === "webhooks" ? <WebhooksPanel plan={plan} /> : null}
          {section === "approvals" ? <ApprovalsPanel /> : null}
        </div>
      </div>
    </div>
  );
}

function SettingsSidebar({ active }: { active: SettingsSection }) {
  const navigate = useNavigate();
  const items: Array<{ key: SettingsSection; label: string; path: string; icon: JSX.Element }> = [
    {
      key: "profile",
      label: "Profile",
      path: "/settings/profile",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      ),
    },
    {
      key: "settings",
      label: "Settings",
      path: "/settings",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ),
    },
    {
      key: "billing",
      label: "Billing",
      path: "/settings/billing",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      ),
    },
    {
      key: "usage",
      label: "Usage",
      path: "/settings/usage",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18" />
          <path d="M7 16l4-4 4 4 4-6" />
        </svg>
      ),
    },
    {
      key: "audit",
      label: "Audit Log",
      path: "/settings/audit",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h5" />
        </svg>
      ),
    },
    {
      key: "team" as SettingsSection,
      label: "Team",
      path: "/settings/team",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      key: "approvals" as SettingsSection,
      label: "Approvals",
      path: "/settings/approvals",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      key: "webhooks" as SettingsSection,
      label: "Webhooks",
      path: "/settings/webhooks",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ paddingTop: "4px" }}>
      {items.map((item) => (
        <div
          key={item.key}
          onClick={() => navigate(item.path)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "9px 12px",
            borderRadius: "8px",
            marginBottom: "2px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 500,
            color: active === item.key ? "#e8e8f0" : "#8888a0",
            background: active === item.key ? "#18181e" : "transparent",
            transition: "background 0.15s, color 0.15s",
            borderLeft: active === item.key ? "2px solid #5B6AF0" : "2px solid transparent",
          }}
          onMouseEnter={(event) => {
            if (active !== item.key) {
              event.currentTarget.style.background = "#18181e";
            }
          }}
          onMouseLeave={(event) => {
            if (active !== item.key) {
              event.currentTarget.style.background = "transparent";
            }
          }}
        >
          {item.icon}
          {item.label}
        </div>
      ))}
    </div>
  );
}

function ProfilePanel({ displayName, email, isSsoUser }: { displayName: string; email: string; isSsoUser: boolean }) {
  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
      if (error) throw error;
      setSaveMsg({ ok: true, text: "Profile saved successfully." });
    } catch (e: unknown) {
      setSaveMsg({ ok: false, text: (e as Error).message ?? "Failed to save profile." });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    setResetError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setResetSent(true);
    } catch (e: unknown) {
      setResetError((e as Error).message ?? "Failed to send reset email.");
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "28px",
          paddingBottom: "28px",
          borderBottom: "1px solid #22222a",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #5B6AF0, #818cf8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "22px",
            fontWeight: 700,
            color: "#fff",
          }}
        >
          {name?.[0]?.toUpperCase() ?? "U"}
        </div>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#e8e8f0" }}>{name || "datahub.org.in User"}</div>
          <div style={{ fontSize: "13px", color: "#8888a0" }}>{email}</div>
        </div>
      </div>

      <div>
        <p style={{ color: "var(--tx1)", marginBottom: 6 }}>Display Name</p>
        <input
          className="auth-input"
          placeholder="Your name"
          value={name}
          onChange={(e) => { setName(e.target.value); setSaveMsg(null); }}
        />
      </div>
      <div>
        <p style={{ color: "var(--tx1)", marginBottom: 6 }}>Email</p>
        <input
          className="auth-input"
          placeholder="you@company.com"
          value={email}
          readOnly
          style={{ opacity: 0.7, cursor: "not-allowed" }}
        />
        {isSsoUser && (
          <p style={{ fontSize: 11, color: "#8888a0", marginTop: 4 }}>
            Email is managed by your SSO provider.
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
        <button
          className="btn btn-primary"
          style={{ width: 120 }}
          onClick={handleSave}
          disabled={saving || !name.trim()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saveMsg && (
          <span style={{ fontSize: 12, color: saveMsg.ok ? "#22c55e" : "#f87171" }}>
            {saveMsg.text}
          </span>
        )}
      </div>

      {!isSsoUser && (
        <div
          style={{
            borderTop: "1px solid #22222a",
            paddingTop: 20,
            marginTop: 8,
            display: "grid",
            gap: 8,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: "#e8e8f0", margin: 0 }}>Password</p>
          <p style={{ fontSize: 13, color: "#8888a0", margin: 0 }}>
            Send a password reset link to <strong style={{ color: "#c7c7d6" }}>{email}</strong>.
          </p>
          {resetSent ? (
            <p style={{ fontSize: 13, color: "#22c55e", margin: 0 }}>
              ✓ Reset email sent — check your inbox.
            </p>
          ) : (
            <>
              <div>
                <button className="btn" style={{ fontSize: 13 }} onClick={handlePasswordReset}>
                  Send password reset email
                </button>
              </div>
              {resetError && (
                <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{resetError}</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function GeneralSettingsPanel({
  plan,
  limits,
  usage,
  onOpenBilling,
  onSignOut,
}: {
  plan: string;
  limits: { maxDatasets: number; maxStorage: number; aiMessagesPerMonth: number };
  usage: { datasetsUsed: number; storageUsed: number; aiMessagesUsed: number };
  onOpenBilling: () => void;
  onSignOut: () => void;
}) {
  const [themeMode, setThemeMode] = useState<"dark" | "light" | "system">(() => {
    const stored = localStorage.getItem("app-theme");
    return stored === "light" || stored === "system" ? stored : "dark";
  });

  useEffect(() => {
    localStorage.setItem("app-theme", themeMode);
  }, [themeMode]);
  const datasetPct = asPercent(usage.datasetsUsed, limits.maxDatasets);
  const storagePct = asPercent(usage.storageUsed, limits.maxStorage);
  const aiPct = asPercent(usage.aiMessagesUsed, limits.aiMessagesPerMonth);

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div style={sectionHeaderStyle}>Appearance</div>
      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ color: "#e8e8f0", fontSize: 13, fontWeight: 500 }}>Theme</label>
        <div style={{ display: "inline-flex", gap: 8 }}>
          <button className={`btn ${themeMode === "dark" ? "btn-primary" : ""}`} onClick={() => setThemeMode("dark")}>Dark</button>
          <button className={`btn ${themeMode === "light" ? "btn-primary" : ""}`} onClick={() => setThemeMode("light")}>Light</button>
          <button className={`btn ${themeMode === "system" ? "btn-primary" : ""}`} onClick={() => setThemeMode("system")}>System</button>
        </div>
      </div>

      <div style={sectionHeaderStyle}>Usage</div>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 16, color: "#e8e8f0" }}>Usage Dashboard</h2>
          <span className="mono" style={{ color: "var(--tx1)", fontSize: 12 }}>{plan} plan</span>
        </div>

        <UsageRow
          label="Datasets"
          value={`${usage.datasetsUsed} / ${formatLimit(limits.maxDatasets, "count")}`}
          percent={datasetPct}
        />
        <UsageRow
          label="Storage"
          value={`${formatFileSize(usage.storageUsed)} / ${formatLimit(limits.maxStorage, "bytes")}`}
          percent={storagePct}
        />
        <UsageRow
          label="AI messages (monthly)"
          value={`${usage.aiMessagesUsed} / ${formatLimit(limits.aiMessagesPerMonth, "count")}`}
          percent={aiPct}
        />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={onOpenBilling}>Upgrade Plan</button>
        </div>
      </div>

      <div style={sectionHeaderStyle}>Notifications</div>
      <NotificationPrefsPanel />

      <div style={sectionHeaderStyle}>Danger Zone</div>
      <DeleteAccountSection onSignOut={onSignOut} />
    </section>
  );
}

interface NotifPrefs {
  pipeline_complete: boolean;
  usage_warning: boolean;
  weekly_digest: boolean;
}

const NOTIF_LABELS: Record<keyof NotifPrefs, string> = {
  pipeline_complete: "Email me when a pipeline run completes",
  usage_warning: "Email me when I reach 80% of my monthly usage limit",
  weekly_digest: "Send me a weekly activity digest every Monday",
};

function NotificationPrefsPanel() {
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [saving, setSaving] = useState<keyof NotifPrefs | null>(null);

  useEffect(() => {
    api
      .get<NotifPrefs>("/users/me/notification-preferences")
      .then((r) => setPrefs(r.data))
      .catch(() => setPrefs({ pipeline_complete: true, usage_warning: true, weekly_digest: true }));
  }, []);

  const toggle = async (key: keyof NotifPrefs) => {
    if (!prefs || saving) return;
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(key);
    try {
      const r = await api.put<NotifPrefs>("/users/me/notification-preferences", { [key]: updated[key] });
      setPrefs(r.data);
    } catch {
      setPrefs(prefs); // revert on error
    } finally {
      setSaving(null);
    }
  };

  if (!prefs) return <p style={{ color: "#8888a0", fontSize: 13 }}>Loading…</p>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {(Object.keys(NOTIF_LABELS) as Array<keyof NotifPrefs>).map((key) => (
        <div
          key={key}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: "1px solid #22222a",
            borderRadius: 8,
            padding: "10px 12px",
            opacity: saving === key ? 0.7 : 1,
            transition: "opacity 0.15s",
          }}
        >
          <span style={{ color: "#c7c7d6", fontSize: 13 }}>{NOTIF_LABELS[key]}</span>
          <button
            onClick={() => toggle(key)}
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              border: "none",
              background: prefs[key] ? "#5B6AF0" : "#2a2a38",
              position: "relative",
              cursor: "pointer",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
            aria-label={prefs[key] ? "Disable" : "Enable"}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: prefs[key] ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

function DeleteAccountSection({ onSignOut }: { onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setErr(null);
    try {
      await api.delete("/users/me");
      onSignOut();
    } catch (e: unknown) {
      setErr((e as Error).message ?? "Failed to delete account.");
      setDeleting(false);
    }
  };

  return (
    <div style={{ border: "1px solid rgba(239,68,68,0.35)", borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
      <h3 style={{ fontSize: 14, color: "#fecaca", margin: 0 }}>Delete Account</h3>
      <p style={{ fontSize: 13, color: "#fca5a5", margin: 0 }}>
        This will permanently delete your account and all data. This action cannot be undone.
      </p>
      {!open ? (
        <div>
          <button
            className="btn"
            style={{ borderColor: "#ef4444", color: "#ef4444" }}
            onClick={() => setOpen(true)}
          >
            Delete account
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <p style={{ fontSize: 12, color: "#fca5a5", margin: 0 }}>
            Type <strong>DELETE</strong> to confirm:
          </p>
          <input
            className="auth-input"
            value={input}
            onChange={(e) => { setInput(e.target.value); setErr(null); }}
            placeholder="DELETE"
            style={{ maxWidth: 240 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{
                borderColor: input === "DELETE" ? "#ef4444" : "#44445a",
                color: input === "DELETE" ? "#ef4444" : "#44445a",
                cursor: input === "DELETE" ? "pointer" : "not-allowed",
              }}
              disabled={input !== "DELETE" || deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting…" : "Confirm delete"}
            </button>
            <button className="btn" onClick={() => { setOpen(false); setInput(""); setErr(null); }}>
              Cancel
            </button>
          </div>
          {err && <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{err}</p>}
        </div>
      )}
    </div>
  );
}

const sectionHeaderStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#44445a",
  marginBottom: "14px",
  marginTop: "24px",
};

function UsageRow({ label, value, percent }: { label: string; value: string; percent: number | null }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "var(--tx0)", fontSize: 13 }}>{label}</span>
        <span className="mono" style={{ color: "var(--tx1)", fontSize: 12 }}>{value}</span>
      </div>
      {percent === null ? (
        <div style={{ height: 8, borderRadius: "var(--r6)", background: "var(--bg3)", border: "1px solid var(--bd2)", display: "grid", placeItems: "center", color: "var(--tx2)", fontSize: 10 }}>
          Unlimited
        </div>
      ) : (
        <div style={{ height: 8, borderRadius: "var(--r6)", background: "var(--bg3)", border: "1px solid var(--bd2)", overflow: "hidden" }}>
          <div style={{ width: `${percent}%`, height: "100%", background: percent >= 90 ? "var(--rd)" : "var(--ac)" }} />
        </div>
      )}
    </div>
  );
}

// ── Usage Panel ────────────────────────────────────────────────────────────────

interface UsageStats {
  plan: string;
  period: string;
  usage: {
    api_calls: number;
    pipeline_runs: number;
    datasets_uploaded: number;
    storage_bytes_used: number;
    data_scanned_bytes: number;
  };
  limits: {
    api_calls_per_month: number;
    pipeline_runs_per_month: number;
    datasets_per_month: number;
    storage_bytes: number;
    data_scan_bytes_per_month: number;
  };
}

function UsagePanel() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<UsageStats>("/users/me/usage-stats")
      .then((r) => setStats(r.data))
      .catch(() => setError("Failed to load usage data."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#8888a0", fontSize: 13 }}>Loading usage…</p>;
  if (error || !stats)
    return <p style={{ color: "#c94040", fontSize: 13 }}>{error ?? "No data."}</p>;

  const { usage, limits } = stats;

  const rows: Array<{ label: string; used: number; cap: number; kind: "count" | "bytes" }> = [
    { label: "AI Chat Calls", used: usage.api_calls, cap: limits.api_calls_per_month, kind: "count" },
    { label: "Pipeline Runs", used: usage.pipeline_runs, cap: limits.pipeline_runs_per_month, kind: "count" },
    { label: "Dataset Uploads", used: usage.datasets_uploaded, cap: limits.datasets_per_month, kind: "count" },
    { label: "Storage Used", used: usage.storage_bytes_used, cap: limits.storage_bytes, kind: "bytes" },
    { label: "Data Scanned", used: usage.data_scanned_bytes, cap: limits.data_scan_bytes_per_month, kind: "bytes" },
  ];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 18, color: "#e8e8f0", margin: 0 }}>Monthly Usage</h2>
          <p style={{ color: "#8888a0", fontSize: 12, margin: "4px 0 0" }}>
            Resets on the 1st of each month · Period: {stats.period}
          </p>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            background: "#1e1e2a",
            border: "1px solid #5B6AF0",
            color: "#5B6AF0",
            padding: "4px 10px",
            borderRadius: 6,
          }}
        >
          {stats.plan}
        </span>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {rows.map((row) => {
          const pct = row.cap === -1 ? null : Math.min(100, Math.round((row.used / row.cap) * 100));
          const usedLabel =
            row.kind === "bytes" ? formatFileSize(row.used) : String(row.used);
          const capLabel = row.cap === -1 ? "Unlimited" : row.kind === "bytes" ? formatFileSize(row.cap) : String(row.cap);
          return (
            <UsageRow
              key={row.label}
              label={row.label}
              value={`${usedLabel} / ${capLabel}`}
              percent={pct}
            />
          );
        })}
      </div>

      <div>
        <button
          onClick={() => navigate("/pricing")}
          style={{
            background: "#5B6AF0",
            color: "#fff",
            border: "none",
            padding: "8px 18px",
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Upgrade Plan
        </button>
      </div>
    </div>
  );
}
// ── Audit Log Panel ────────────────────────────────────────────────────────────

type AuditFilterAction = "" | "auth.login" | "dataset.upload" | "dataset.delete" | "dataset.export" | "dataset.query" | "pipeline.run" | "recipe.apply" | "approval.approve" | "approval.reject";

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  target: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
}

interface AuditLogResponse {
  total: number;
  offset: number;
  limit: number;
  entries: AuditEntry[];
}

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Login",
  "dataset.upload": "Upload",
  "dataset.delete": "Delete",
  "dataset.export": "Export",
  "dataset.query": "Query",
  "pipeline.run": "Pipeline Run",
  "recipe.apply": "Transform",
  "recipe.save": "Recipe Save",
  "recipe.revert": "Recipe Revert",
  "approval.approve": "Approved",
  "approval.reject": "Rejected",
};

const ACTION_COLORS: Record<string, string> = {
  "auth.login": "#5B6AF0",
  "dataset.upload": "#22b573",
  "dataset.delete": "#c94040",
  "dataset.export": "#7c3aed",
  "dataset.query": "#0ea5e9",
  "pipeline.run": "#e8a020",
  "recipe.apply": "#06b6d4",
  "recipe.save": "#64748b",
  "recipe.revert": "#f59e0b",
  "approval.approve": "#22b573",
  "approval.reject": "#c94040",
};

function AuditBadge({ action }: { action: string }) {
  const color = ACTION_COLORS[action] ?? "#8888a0";
  const label = ACTION_LABELS[action] ?? action;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: color + "22",
        color,
        border: `1px solid ${color}55`,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function AuditPanel() {
  const [filterAction, setFilterAction] = useState<AuditFilterAction>("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"personal" | "workspace">("personal");
  const PAGE = 20;

  const load = (off: number, action: AuditFilterAction) => {
    setLoading(true);
    setError(null);
    if (viewMode === "workspace") {
      listAuditLogs({ action: action || undefined, limit: PAGE })
        .then((data: AuditEntry[]) => {
          setEntries(Array.isArray(data) ? data : []);
          setTotal(Array.isArray(data) ? data.length : 0);
          setOffset(0);
        })
        .catch(() => setError("Failed to load workspace audit log."))
        .finally(() => setLoading(false));
    } else {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(off) });
      if (action) params.set("action", action);
      api
        .get<AuditLogResponse>(`/users/me/audit-log?${params.toString()}`)
        .then((r) => {
          setEntries(r.data.entries);
          setTotal(r.data.total);
          setOffset(off);
        })
        .catch(() => setError("Failed to load audit log."))
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    load(0, filterAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAction, viewMode]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const currentPage = Math.floor(offset / PAGE) + 1;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: 18, color: "#e8e8f0", margin: 0 }}>Audit Log</h2>
          <p style={{ color: "#8888a0", fontSize: 12, margin: "4px 0 0" }}>
            {viewMode === "personal" ? "A record of key actions performed in your account." : "Workspace-wide audit events across all members."}
          </p>
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {(["personal", "workspace"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: "1px solid #2a2a38",
                  background: viewMode === mode ? "#5B6AF0" : "#18181e",
                  color: viewMode === mode ? "#fff" : "#8888a0",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {mode === "personal" ? "My Activity" : "Workspace"}
              </button>
            ))}
          </div>
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value as AuditFilterAction)}
          style={{
            background: "#18181e",
            border: "1px solid #2a2a38",
            color: "#e8e8f0",
            borderRadius: 7,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <option value="">All actions</option>
          <option value="auth.login">Login</option>
          <option value="dataset.upload">Dataset Upload</option>
          <option value="dataset.delete">Dataset Delete</option>
          <option value="dataset.export">Dataset Export</option>
          <option value="dataset.query">Dataset Query</option>
          <option value="pipeline.run">Pipeline Run</option>
          <option value="recipe.apply">Transformation Applied</option>
          <option value="approval.approve">Approval Granted</option>
          <option value="approval.reject">Approval Rejected</option>
        </select>
      </div>

      {loading && <p style={{ color: "#8888a0", fontSize: 13 }}>Loading…</p>}
      {error && <p style={{ color: "#c94040", fontSize: 13 }}>{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p style={{ color: "#8888a0", fontSize: 13 }}>No audit events found.</p>
      )}

      {!loading && entries.length > 0 && (
        <div
          style={{
            border: "1px solid #22222a",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#18181e" }}>
                {["Action", "Resource", "Timestamp"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "9px 14px",
                      textAlign: "left",
                      color: "#8888a0",
                      fontWeight: 600,
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      borderBottom: "1px solid #22222a",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <tr
                  key={e.id}
                  style={{
                    borderBottom: idx < entries.length - 1 ? "1px solid #1a1a22" : "none",
                    background: idx % 2 === 0 ? "transparent" : "#111115",
                  }}
                >
                  <td style={{ padding: "9px 14px" }}>
                    <AuditBadge action={e.action} />
                  </td>
                  <td
                    style={{
                      padding: "9px 14px",
                      color: "#c8c8d8",
                      fontFamily: "monospace",
                      fontSize: 11,
                      maxWidth: 240,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={e.target}
                  >
                    {e.target}
                  </td>
                  <td style={{ padding: "9px 14px", color: "#8888a0" }}>
                    {formatDate(e.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total > PAGE && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
          <button
            disabled={currentPage <= 1}
            onClick={() => load(offset - PAGE, filterAction)}
            style={{
              background: "transparent",
              border: "1px solid #2a2a38",
              color: currentPage <= 1 ? "#44445a" : "#e8e8f0",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 12,
              cursor: currentPage <= 1 ? "not-allowed" : "pointer",
            }}
          >
            ← Prev
          </button>
          <span style={{ color: "#8888a0", fontSize: 12 }}>
            Page {currentPage} / {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => load(offset + PAGE, filterAction)}
            style={{
              background: "transparent",
              border: "1px solid #2a2a38",
              color: currentPage >= totalPages ? "#44445a" : "#e8e8f0",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 12,
              cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

interface ApprovalRequest {
  id: string;
  requester: string;
  resource_type: string;
  resource_id: string;
  summary: string;
  status: "pending" | "approved" | "rejected" | string;
  created_at?: string | null;
  resolved_at?: string | null;
  resolver?: string | null;
}

function ApprovalsPanel() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    listApprovalRequests()
      .then((data: ApprovalRequest[]) => setRequests(Array.isArray(data) ? data : []))
      .catch(() => setError("Failed to load approval requests."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleApprove = async (id: string) => {
    setActing(id);
    try {
      await approveRequest(id);
      refresh();
    } catch {
      setError("Failed to approve request.");
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: string) => {
    setActing(id);
    try {
      await rejectRequest(id);
      refresh();
    } catch {
      setError("Failed to reject request.");
    } finally {
      setActing(null);
    }
  };

  const statusColor = (s: string) => {
    if (s === "approved") return "#6ee7b7";
    if (s === "rejected") return "#fca5a5";
    return "#fbbf24";
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 18, color: "#e8e8f0", margin: 0 }}>Approval Requests</h2>
        <p style={{ color: "#8888a0", fontSize: 12, margin: "4px 0 0" }}>
          Review and action pending data access or operation approvals.
        </p>
      </div>

      {loading && <p style={{ color: "#8888a0", fontSize: 13 }}>Loading…</p>}
      {error && <p style={{ color: "#c94040", fontSize: 13 }}>{error}</p>}
      {!loading && !error && requests.length === 0 && (
        <p style={{ color: "#8888a0", fontSize: 13 }}>No approval requests found.</p>
      )}

      {!loading && requests.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map((req) => (
            <div
              key={req.id}
              style={{
                background: "#18181e",
                border: "1px solid #22222a",
                borderRadius: 8,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#e8e8f0" }}>{req.summary}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: statusColor(req.status), textTransform: "capitalize" }}>
                  {req.status}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#8888a0", display: "flex", gap: 16 }}>
                <span>By: <span style={{ color: "#c8c8d8" }}>{req.requester}</span></span>
                <span>Type: <span style={{ color: "#c8c8d8" }}>{req.resource_type}</span></span>
                <span>Resource: <span style={{ color: "#c8c8d8" }}>{req.resource_id}</span></span>
                <span>{formatDate(req.created_at)}</span>
              </div>
              {req.status === "pending" && (
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    disabled={acting === req.id}
                    onClick={() => handleApprove(req.id)}
                    style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: "#10b981", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                  >
                    Approve
                  </button>
                  <button
                    disabled={acting === req.id}
                    onClick={() => handleReject(req.id)}
                    style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#fca5a5", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                  >
                    Reject
                  </button>
                </div>
              )}
              {req.status !== "pending" && req.resolver && (
                <div style={{ fontSize: 11, color: "#8888a0" }}>
                  {req.status === "approved" ? "Approved" : "Rejected"} by <span style={{ color: "#c8c8d8" }}>{req.resolver}</span>
                  {req.resolved_at && <> · {formatDate(req.resolved_at)}</>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const WEBHOOK_EVENTS = [
  { value: "pipeline.run", label: "Pipeline Run" },
  { value: "dataset.upload", label: "Dataset Upload" },
  { value: "dataset.delete", label: "Dataset Delete" },
  { value: "pipeline.approved", label: "Pipeline Approved" },
];

interface Webhook {
  hook_id: string;
  target_url: string;
  event: string;
  created_at?: string;
}

function WebhooksPanel({ plan }: { plan: string }) {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [event, setEvent] = useState("pipeline.run");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBusinessPlus = ["business", "enterprise"].includes(plan?.toLowerCase() ?? "");

  useEffect(() => {
    if (!isBusinessPlus) { setLoading(false); return; }
    listWebhooks()
      .then(setHooks)
      .catch(() => setError("Failed to load webhooks"))
      .finally(() => setLoading(false));
  }, [isBusinessPlus]);

  const handleAdd = async () => {
    if (!url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const hook = await registerWebhook(url.trim(), event);
      setHooks((prev) => [...prev, hook as Webhook]);
      setUrl("");
    } catch {
      setError("Failed to register webhook.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWebhook(id);
      setHooks((prev) => prev.filter((h) => h.hook_id !== id));
    } catch {
      setError("Failed to delete webhook.");
    }
  };

  if (!isBusinessPlus) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h2 style={{ fontSize: 18, color: "#e8e8f0", margin: 0 }}>Webhooks</h2>
        <div
          style={{
            background: "#111115",
            border: "1px solid #22222a",
            borderRadius: 10,
            padding: "20px 24px",
            display: "grid",
            gap: 8,
          }}
        >
          <p style={{ color: "#8888a0", fontSize: 13, margin: 0 }}>
            Webhooks are available on the <strong style={{ color: "#e8e8f0" }}>Business</strong> plan and above.
          </p>
          <a href="/pricing" style={{ color: "#5b6af0", fontSize: 13 }}>Upgrade →</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2 style={{ fontSize: 18, color: "#e8e8f0", margin: 0 }}>Webhooks</h2>
      <p style={{ color: "#8888a0", fontSize: 13, margin: 0 }}>
        Receive HTTP POST notifications when events occur in your workspace.
      </p>

      {/* Add webhook form */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 8,
          alignItems: "center",
        }}
      >
        <input
          type="url"
          placeholder="https://your-server.com/webhook"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{
            background: "#0d0d10",
            border: "1px solid #2a2a38",
            borderRadius: 8,
            padding: "8px 12px",
            color: "#e8e8f0",
            fontSize: 13,
          }}
        />
        <select
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          style={{
            background: "#0d0d10",
            border: "1px solid #2a2a38",
            borderRadius: 8,
            padding: "8px 12px",
            color: "#e8e8f0",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {WEBHOOK_EVENTS.map((ev) => (
            <option key={ev.value} value={ev.value}>{ev.label}</option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          disabled={saving || !url.trim()}
          onClick={handleAdd}
          style={{ fontSize: 13, padding: "8px 16px" }}
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>

      {error ? <p style={{ color: "#e05a5a", fontSize: 13, margin: 0 }}>{error}</p> : null}

      {/* Webhook list */}
      {loading ? (
        <p style={{ color: "#8888a0", fontSize: 13 }}>Loading…</p>
      ) : hooks.length === 0 ? (
        <p style={{ color: "#8888a0", fontSize: 13 }}>No webhooks configured yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {hooks.map((hook) => (
            <div
              key={hook.hook_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#0d0d10",
                border: "1px solid #22222a",
                borderRadius: 8,
                padding: "10px 14px",
                gap: 10,
              }}
            >
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#5b6af0",
                    fontFamily: "monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {hook.target_url}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#8888a0",
                    background: "#1a1a22",
                    borderRadius: 4,
                    padding: "1px 6px",
                    width: "fit-content",
                  }}
                >
                  {hook.event}
                </span>
              </div>
              <button
                onClick={() => handleDelete(hook.hook_id)}
                style={{
                  background: "transparent",
                  border: "1px solid #3a2a2a",
                  borderRadius: 6,
                  padding: "4px 10px",
                  color: "#e05a5a",
                  fontSize: 12,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}