import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { BillingSettings } from "../components/BillingSettings";
import { TeamSettings } from "../components/TeamSettings";
import { useAuth } from "../contexts/AuthContext";
import { formatFileSize, useUser } from "../contexts/UserContext";
import { billingEnabled } from "../utils/featureFlags";

type SettingsSection = "profile" | "settings" | "billing" | "usage" | "audit" | "team";

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
  const { user: authUser } = useAuth();
  const { plan, limits, usage, user } = useUser();
  const displayName = useMemo(() => {
    const metadataName = authUser?.user_metadata?.full_name as string | undefined;
    if (metadataName?.trim()) return metadataName.trim();
    if (user?.username?.trim()) return user.username.trim();
    return "DataHub User";
  }, [authUser?.user_metadata?.full_name, user?.username]);
  const email = authUser?.email ?? user?.username ?? "user@datahub.dev";
  const provider = String(authUser?.app_metadata?.provider ?? "").toLowerCase();
  const isSsoUser = provider !== "" && provider !== "email";

  return (
    <div
      style={{
        paddingTop: "52px",
        minHeight: "100vh",
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
          {displayName?.[0]?.toUpperCase() ?? "U"}
        </div>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#e8e8f0" }}>{displayName || "DataHub User"}</div>
          <div style={{ fontSize: "13px", color: "#8888a0" }}>{email}</div>
        </div>
      </div>

      <div>
        <p style={{ color: "var(--tx1)", marginBottom: 6 }}>Display Name</p>
        <input className="auth-input" placeholder="Your name" defaultValue={displayName} />
      </div>
      <div>
        <p style={{ color: "var(--tx1)", marginBottom: 6 }}>Email</p>
        <input
          className="auth-input"
          placeholder="you@company.com"
          defaultValue={email}
          readOnly={isSsoUser}
          style={isSsoUser ? { opacity: 0.8, cursor: "not-allowed" } : undefined}
        />
      </div>
      <div>
        <p style={{ color: "var(--tx1)", marginBottom: 6 }}>Theme</p>
        <select className="auth-select" defaultValue="dark">
          <option value="dark">Dark</option>
        </select>
      </div>
      <button className="btn btn-primary" style={{ width: 120 }}>Save</button>
    </section>
  );
}

function GeneralSettingsPanel({
  plan,
  limits,
  usage,
  onOpenBilling,
}: {
  plan: string;
  limits: { maxDatasets: number; maxStorage: number; aiMessagesPerMonth: number };
  usage: { datasetsUsed: number; storageUsed: number; aiMessagesUsed: number };
  onOpenBilling: () => void;
}) {
  const [themeMode, setThemeMode] = useState<"dark" | "light" | "system">("dark");
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
      <div style={{ border: "1px solid rgba(239,68,68,0.35)", borderRadius: 10, padding: 14, display: "grid", gap: 8 }}>
        <h3 style={{ fontSize: 14, color: "#fecaca" }}>Delete Account</h3>
        <p style={{ fontSize: 13, color: "#fca5a5" }}>
          This will permanently delete your account and all data. This cannot be undone.
        </p>
        <div>
          <button
            className="btn"
            style={{ borderColor: "#ef4444", color: "#ef4444" }}
            onClick={() => {
              const confirmed = window.confirm("Delete account? This action cannot be undone.");
              if (confirmed) {
                window.alert("Coming soon: account deletion workflow.");
              }
            }}
          >
            Delete account
          </button>
        </div>
      </div>
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
  };
  limits: {
    api_calls_per_month: number;
    pipeline_runs_per_month: number;
    datasets_per_month: number;
    storage_bytes: number;
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

type AuditFilterAction = "" | "auth.login" | "dataset.upload" | "dataset.delete" | "pipeline.run";

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
  "pipeline.run": "Pipeline Run",
};

const ACTION_COLORS: Record<string, string> = {
  "auth.login": "#5B6AF0",
  "dataset.upload": "#22b573",
  "dataset.delete": "#c94040",
  "pipeline.run": "#e8a020",
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
  const PAGE = 20;

  const load = (off: number, action: AuditFilterAction) => {
    setLoading(true);
    setError(null);
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
  };

  useEffect(() => {
    load(0, filterAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAction]);

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
            A record of key actions performed in your account.
          </p>
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
          <option value="pipeline.run">Pipeline Run</option>
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