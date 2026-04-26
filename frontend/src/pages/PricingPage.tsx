import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { billingEnabled } from "../utils/featureFlags";
import { capture } from "../lib/posthog";
import { joinWaitlist } from "../api";
import { useIsIndian } from "../hooks/useIsIndian";
import { useSEO } from "../hooks/useSEO";

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
    highlights: ["1 personal workspace", "2 projects/workspace", "500 MB storage · 5 GB scan/month", "100 AI messages/month", "CSV + Excel only"],
  },
  {
    key: "Professional",
    price: "₹6,999 / month",
    description: "Solo consultants and analysts",
    highlights: ["1 personal workspace · 1 seat", "20 projects/workspace", "20 GB storage · 50 GB scan/month", "2,000 AI messages/month", "DB: PostgreSQL, MySQL, SQLite, MSSQL, Oracle"],
  },
  {
    key: "Team",
    price: "₹14,999 / month",
    description: "Small analytics and consulting teams",
    highlights: ["Includes 3 seats · +₹2,499/extra seat", "1 personal + 2 collab workspaces", "100 GB+ storage · 200 GB+ scan/month", "5,000+ AI messages (scales with seats)", "+ Snowflake, Redshift, BigQuery"],
  },
  {
    key: "Business",
    price: "₹29,999 / month",
    description: "Governance-first mid-size enterprises",
    highlights: ["Includes 5 seats · +₹3,999/extra seat", "1 personal + 9 collab workspaces", "2 TB storage + unlimited scan", "Unlimited AI messages", "SSO/SAML · Custom connectors"],
  },
  {
    key: "Enterprise",
    price: "Custom",
    description: "Fortune 500 and regulated environments",
    highlights: ["Unlimited workspaces", "Custom TB-scale storage", "Unlimited AI messages", "Unlimited team members", "24/7 dedicated support", "Custom compliance + integrations"],
  },
];

// Structured data for the Pricing page – Product with multiple Offers.
// Helps Google show pricing/feature snippets and rich results.
const PRICING_LD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "datahub.org.in",
  description:
    "AI-powered data analysis platform. Upload CSV/Excel or connect databases (PostgreSQL, MySQL, Snowflake, BigQuery, Redshift). Generate transparent, auditable SQL pipelines with the AI agent.",
  brand: { "@type": "Brand", name: "datahub.org.in" },
  url: "https://datahub.org.in/pricing",
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "INR",
    lowPrice: "0",
    highPrice: "29999",
    offerCount: "5",
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "100 AI messages/month, 500 MB storage, CSV + Excel uploads.",
      },
      {
        "@type": "Offer",
        name: "Professional",
        price: "6999",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "20 projects, 20 GB storage, 2,000 AI messages, all SQL databases.",
      },
      {
        "@type": "Offer",
        name: "Team",
        price: "14999",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "3 seats included, collaboration workspaces, +Snowflake/Redshift/BigQuery.",
      },
      {
        "@type": "Offer",
        name: "Business",
        price: "29999",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "5 seats included, SSO/SAML, custom connectors, 2 TB storage.",
      },
    ],
  },
};

export function PricingPage() {
  const { plan } = useUser();
  const navigate = useNavigate();
  const isIndian = useIsIndian();
  const [message, setMessage] = useState<string | null>(null);
  type NotifyState = { open: boolean; email: string; submitted: boolean };
  const [notifyState, setNotifyState] = useState<Record<string, NotifyState>>({});

  useSEO({
    title: "datahub.org.in Pricing – Free, Pro & Team Plans | AI Data Analysis",
    description:
      "Start free forever. Upgrade to Professional from ₹6,999/month. All plans include the AI agent, transparent SQL pipelines, and database connectors. No credit card to get started.",
    canonical: "https://datahub.org.in/pricing",
    structuredData: PRICING_LD,
  });

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
    <main className="app-page ds-mesh-bg" style={{ padding: "32px 24px" }}>
      <section style={{ maxWidth: 1180, margin: "0 auto 32px", textAlign: "center" }}>
        <span className="ds-eyebrow" style={{ marginBottom: 16 }}>Pricing</span>
        <h1 className="ds-h1 ds-gradient-text" style={{ marginBottom: 12 }}>Simple, transparent plans</h1>
        <p className="ds-lead" style={{ margin: "0 auto 8px" }}>
          Currently on <strong style={{ color: "var(--tx0)" }}>{plan}</strong>. Upgrade or downgrade anytime.
        </p>
        {message ? <p style={{ color: "var(--tx1)", marginTop: 12, fontSize: 14 }}>{message}</p> : null}
      </section>

      {!isIndian && (
        <div style={{
          maxWidth: 800,
          margin: "0 auto 24px",
          background: "var(--acl)",
          border: "1px solid var(--acg)",
          borderRadius: "var(--r12)",
          padding: "14px 20px",
          textAlign: "center",
          fontSize: 13,
          color: "var(--accent2)",
          backdropFilter: "blur(8px)",
        }}>
          💳 International billing is coming soon. Sign up free and we'll notify you when paid plans are available in your region.
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14, maxWidth: 1180, margin: "0 auto" }}>
        {planCards.map((card, index) => {
          const isCurrent = card.key === plan;
          const canUpgrade = index >= currentIndex && !isCurrent;
          const isPaidLocked = !isIndian && card.key !== "Free" && card.key !== "Enterprise";
          const notify = getNotify(card.key);
          return (
            <article
              key={card.key}
              className="ds-card ds-card--hover"
              style={{
                padding: 20,
                borderColor: isCurrent ? "var(--ac)" : "var(--bd2)",
                background: isCurrent ? "linear-gradient(180deg, rgba(99,102,241,0.08), var(--bg2) 60%)" : "var(--bg2)",
                display: "grid",
                gap: 10,
                position: "relative",
                boxShadow: isCurrent ? "0 0 0 1px var(--acg), 0 16px 40px rgba(0,0,0,0.3)" : undefined,
              }}
            >
              {isPaidLocked && (
                <span className="ds-chip" style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  fontSize: 9,
                  padding: "2px 8px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}>
                  Coming Soon
                </span>
              )}
              <div>
                <h3 style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--tx0)" }}>{card.key}</h3>
                <p className="mono" style={{ color: "var(--tx0)", fontSize: 18, fontWeight: 700, fontFamily: "var(--display)" }}>{card.price}</p>
              </div>
              <p style={{ color: "var(--tx1)", minHeight: 36, fontSize: 13, lineHeight: 1.5 }}>{card.description}</p>
              <ul style={{ color: "var(--tx1)", display: "grid", gap: 6, paddingLeft: 0, listStyle: "none", fontSize: 12.5 }}>
                {card.highlights.map((item) => (
                  <li key={item} style={{ display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.5 }}>
                    <span style={{ color: "var(--ac)", flexShrink: 0, marginTop: 2 }}>•</span>
                    <span>{item}</span>
                  </li>
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
