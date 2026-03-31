import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { billingEnabled } from "../utils/featureFlags";
import { capture } from "../lib/posthog";
import { joinWaitlist } from "../api";
import { useIsIndian } from "../hooks/useIsIndian";

type PlanKey = "Free" | "Professional" | "Team" | "Business" | "Enterprise";

type PlanCard = {
  key: PlanKey;
  price: string;
  description: string;
  highlights: string[];
};

const planCards: PlanCard[] = [
  {
    key: "Free",
    price: "₹0",
    description: "Students, evaluation, and hobby workflows",
    highlights: ["1 GB storage", "50 AI messages/month", "CSV + Excel only", "2 canvases", "Unlimited visualizations"],
  },
  {
    key: "Professional",
    price: "₹3,299 / month",
    description: "Solo consultants and analysts",
    highlights: ["20 GB storage", "500 AI messages/month", "DB: PostgreSQL, MySQL, SQLite, MSSQL, Oracle", "20 canvases", "Unlimited visualizations"],
  },
  {
    key: "Team",
    price: "₹6,199 / month",
    description: "Small analytics and consulting teams",
    highlights: ["100 GB shared storage", "Up to 10 team members", "+ Snowflake, Redshift, BigQuery (coming soon)", "Unlimited canvases", "Unlimited visualizations"],
  },
  {
    key: "Business",
    price: "₹16,599 / month",
    description: "Governance-first mid-size enterprises",
    highlights: ["500 GB storage", "Up to 50 team members", "SSO/SAML (coming soon)", "+ Custom connectors (coming soon)", "Unlimited canvases", "Unlimited visualizations"],
  },
  {
    key: "Enterprise",
    price: "Custom",
    description: "Fortune 500 and regulated environments",
    highlights: ["Custom TB-scale storage", "Custom + on-premise connectors (coming soon)", "24/7 dedicated support", "Custom compliance + integrations"],
  },
];

export function PricingPage() {
  const { plan } = useUser();
  const navigate = useNavigate();
  const isIndian = useIsIndian();
  const [message, setMessage] = useState<string | null>(null);
  type NotifyState = { open: boolean; email: string; submitted: boolean };
  const [notifyState, setNotifyState] = useState<Record<string, NotifyState>>({});

  const currentIndex = useMemo(() => planCards.findIndex((p) => p.key === plan), [plan]);

  const getNotify = (key: string): NotifyState =>
    notifyState[key] ?? { open: false, email: "", submitted: false };

  const patchNotify = (key: string, patch: Partial<NotifyState>) =>
    setNotifyState((prev) => ({ ...prev, [key]: { ...getNotify(key), ...patch } }));

  const handleNotifySubmit = async (key: string) => {
    const state = getNotify(key);
    if (!state.email) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await joinWaitlist({ email: state.email, plan: key.toLowerCase(), region: tz });
    } catch {
      // silently ignore duplicate / network errors
    }
    patchNotify(key, { submitted: true });
  };

  const upgrade = async (target: PlanKey) => {
    setMessage(null);
    capture("upgrade_clicked", { target_plan: target, current_plan: plan });
    if (target === "Enterprise") {
      setMessage("Enterprise onboarding is sales-assisted. Contact sales@datahub.org.in.");
      return;
    }
    if (billingEnabled) {
      navigate("/settings/billing");
      return;
    }
    setMessage("Billing is disabled in this environment. Plan changes are unavailable.");
  };

  return (
    <main className="app-page" style={{ padding: 20 }}>
      <section className="panel" style={{ padding: 16, marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Pricing & Plans</h1>
        <p style={{ color: "var(--tx1)" }}>Current plan: <strong style={{ color: "var(--tx0)" }}>{plan}</strong></p>
        {message ? <p style={{ color: "var(--tx1)", marginTop: 8 }}>{message}</p> : null}
      </section>

      {!isIndian && (
        <div style={{
          background: "#1A1D27",
          border: "1px solid #2A2D3A",
          borderRadius: 8,
          padding: "12px 20px",
          marginBottom: 12,
          textAlign: "center",
          fontSize: 13,
          color: "#8B8FA8",
        }}>
          💳 International billing is coming soon. Sign up free and we'll notify you when paid plans are available in your region.
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
        {planCards.map((card, index) => {
          const isCurrent = card.key === plan;
          const canUpgrade = index >= currentIndex && !isCurrent;
          const isPaidLocked = !isIndian && card.key !== "Free" && card.key !== "Enterprise";
          const notify = getNotify(card.key);
          return (
            <article
              key={card.key}
              className="panel"
              style={{
                padding: 12,
                borderColor: isCurrent ? "var(--ac)" : "var(--bd)",
                background: isCurrent ? "var(--acl)" : "var(--bg1)",
                display: "grid",
                gap: 8,
                position: "relative",
              }}
            >
              {isPaidLocked && (
                <span style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  background: "#2A2D3A",
                  color: "#8B8FA8",
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: 4,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}>
                  Coming Soon
                </span>
              )}
              <div>
                <h3 style={{ marginBottom: 4 }}>{card.key}</h3>
                <p className="mono" style={{ color: "var(--tx0)", fontSize: 12 }}>{card.price}</p>
              </div>
              <p style={{ color: "var(--tx1)", minHeight: 36 }}>{card.description}</p>
              <ul style={{ color: "var(--tx1)", display: "grid", gap: 4, paddingLeft: 16 }}>
                {card.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {isPaidLocked ? (
                notify.submitted ? (
                  <p style={{ fontSize: 12, color: "#8B8FA8", marginTop: 6 }}>
                    ✓ We'll notify you when international billing is available.
                  </p>
                ) : notify.open ? (
                  <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={notify.email}
                      onChange={(e) => patchNotify(card.key, { email: e.target.value })}
                      style={{
                        padding: "6px 8px",
                        background: "var(--bg2)",
                        border: "1px solid var(--bd2)",
                        borderRadius: 6,
                        color: "var(--tx0)",
                        fontSize: 12,
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleNotifySubmit(card.key); }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: 12 }}
                      onClick={() => void handleNotifySubmit(card.key)}
                      disabled={!notify.email}
                    >
                      Notify me
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn"
                    style={{ marginTop: 6, fontSize: 12 }}
                    onClick={() => patchNotify(card.key, { open: true })}
                  >
                    Notify me
                  </button>
                )
              ) : isCurrent ? (
                <button className="btn" disabled style={{ marginTop: 6 }}>Current Plan</button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={!canUpgrade}
                  onClick={() => void upgrade(card.key)}
                  style={{ marginTop: 6 }}
                >
                  {card.key === "Enterprise" ? "Contact Sales" : "Upgrade"}
                </button>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
