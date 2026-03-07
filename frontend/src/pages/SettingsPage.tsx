import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { BillingSettings } from "../components/BillingSettings";
import { useAuth } from "../contexts/AuthContext";
import { formatFileSize, useUser } from "../contexts/UserContext";
import { billingEnabled } from "../utils/featureFlags";

type SettingsSection = "profile" | "settings" | "billing";

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
      <div style={{ display: "grid", gap: 10 }}>
        <NotificationRow label="Email notifications on pipeline completion" />
        <NotificationRow label="Email notifications on failed runs" />
      </div>

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

function NotificationRow({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #22222a", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="checkbox" checked={false} readOnly disabled />
        <span style={{ color: "#c7c7d6", fontSize: 13 }}>{label}</span>
      </div>
      <span style={{ border: "1px solid #2f2f42", color: "#9aa0c8", borderRadius: 999, fontSize: 11, padding: "2px 8px" }}>Coming soon</span>
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
