import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { billingEnabled } from "../utils/featureFlags";
import { capture } from "../lib/posthog";
import { useBillingRegion } from "../hooks/useIsIndian";
import { useSEO } from "../hooks/useSEO";

type PlanKey = "Starter" | "Professional" | "Expert";

type PlanCard = {
  key: PlanKey;
  priceINR: string;
  priceUSD: string;
  badge?: string;
  description: string;
  highlightsINR: string[];
  highlightsUSD: string[];
};

const planCards: PlanCard[] = [
  {
    key: "Starter",
    priceINR: "Free forever",
    priceUSD: "Free forever",
    description: "Solo data work — explore, clean, and visualise at your own pace.",
    highlightsINR: [
      "50 AI messages / month",
      "20 pipeline runs / month",
      "5 dataset uploads / month",
      "2 GB storage · 10 GB scan",
      "CSV + Excel files only",
      "Solo projects (no collaborators)",
    ],
    highlightsUSD: [
      "50 AI messages / month",
      "20 pipeline runs / month",
      "5 dataset uploads / month",
      "2 GB storage · 10 GB scan",
      "CSV + Excel files only",
      "Solo projects (no collaborators)",
    ],
  },
  {
    key: "Professional",
    priceINR: "₹1,999 / month",
    priceUSD: "$49 / month",
    badge: "Most Popular",
    description: "Analysts and consultants who collaborate with clients or teammates.",
    highlightsINR: [
      "500 AI messages / month",
      "200 pipeline runs / month",
      "100 dataset uploads / month",
      "25 GB storage · 100 GB scan",
      "CSV, Excel, JSON, Parquet",
      "PostgreSQL, MySQL, SQLite connectors",
      "Invite up to 5 collaborators per project",
      "Dashboard sharing · daily scheduling",
    ],
    highlightsUSD: [
      "500 AI messages / month",
      "200 pipeline runs / month",
      "100 dataset uploads / month",
      "25 GB storage · 100 GB scan",
      "CSV, Excel, JSON, Parquet",
      "PostgreSQL, MySQL, SQLite connectors",
      "Invite up to 5 collaborators per project",
      "Dashboard sharing · daily scheduling",
    ],
  },
  {
    key: "Expert",
    priceINR: "₹3,999 / month",
    priceUSD: "$99 / month",
    description: "Power users who need large files, all connectors, and an audit trail.",
    highlightsINR: [
      "2,000 AI messages / month",
      "1,000 pipeline runs / month",
      "500 dataset uploads / month",
      "100 GB storage · 500 GB scan",
      "All file formats · all connectors",
      "Invite up to 20 collaborators per project",
      "Webhooks · full scheduling",
      "Audit log",
    ],
    highlightsUSD: [
      "2,000 AI messages / month",
      "1,000 pipeline runs / month",
      "500 dataset uploads / month",
      "100 GB storage · 500 GB scan",
      "All file formats · all connectors",
      "Invite up to 20 collaborators per project",
      "Webhooks · full scheduling",
      "Audit log",
    ],
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
    highPrice: "3999",
    offerCount: "3",
    offers: [
      {
        "@type": "Offer",
        name: "Starter",
        price: "0",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "Free forever. 50 AI messages/month, 2 GB storage, CSV + Excel uploads, solo projects.",
      },
      {
        "@type": "Offer",
        name: "Professional",
        price: "1999",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "₹1,999/month. 500 AI messages, 25 GB storage, invite up to 5 collaborators, PostgreSQL/MySQL/SQLite.",
      },
      {
        "@type": "Offer",
        name: "Expert",
        price: "3999",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "₹3,999/month. 2,000 AI messages, 100 GB storage, up to 20 collaborators, all connectors, audit log.",
      },
    ],
  },
};

export function PricingPage() {
  const { plan } = useUser();
  const navigate = useNavigate();
  const region = useBillingRegion();
  const isIndian = region.isIndian;
  const [message, setMessage] = useState<string | null>(null);

  useSEO({
    title: "DataHub Pricing – Free Starter, Professional & Expert Plans | AI Agent for Data Work",
    description:
      "Starter is free forever. Professional ₹1,999/month ($49), Expert ₹3,999/month ($99). Every plan includes the AI agent, visual reusable pipelines, and transparent SQL. Invite collaborators on paid plans.",
    canonical: "https://datahub.org.in/pricing",
    structuredData: PRICING_LD,
  });

  const currentIndex = useMemo(() => planCards.findIndex((p) => p.key === plan), [plan]);

  const upgrade = async (target: PlanKey) => {
    setMessage(null);
    capture("upgrade_clicked", { target_plan: target, current_plan: plan });
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

      {!billingEnabled && (
        <div style={{
          maxWidth: 900,
          margin: "0 auto 24px",
          background: "linear-gradient(135deg, rgba(91,106,240,0.15), rgba(139,92,246,0.12))",
          border: "1px solid rgba(91,106,240,0.45)",
          borderRadius: "var(--r12)",
          padding: "16px 22px",
          textAlign: "center",
          fontSize: 14,
          color: "var(--tx0)",
        }}>
          <strong style={{ fontSize: 15 }}>DataHub is free while we&apos;re in early beta.</strong>{" "}
          <span style={{ color: "var(--tx1)" }}>
            The tiers below are a preview of our planned pricing \u2014 nothing is being charged today.
            Everyone gets access at no cost while we finalize plans.
          </span>
        </div>
      )}

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
          💳 Prices shown in USD. International (USD) billing is launching soon — contact <a href="mailto:sales@datahub.org.in" style={{ color: "inherit", textDecoration: "underline" }}>sales@datahub.org.in</a> in the meantime.
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, maxWidth: 960, margin: "0 auto" }}>
        {planCards.map((card, index) => {
          const isCurrent = card.key === plan;
          const canUpgrade = index >= currentIndex && !isCurrent;
          const price = isIndian ? card.priceINR : card.priceUSD;
          const highlights = isIndian ? card.highlightsINR : card.highlightsUSD;
          const isPopular = card.badge === "Most Popular";
          return (
            <article
              key={card.key}
              className="ds-card ds-card--hover"
              style={{
                padding: 20,
                borderColor: isPopular ? "var(--ac)" : isCurrent ? "var(--ac)" : "var(--bd2)",
                background: isCurrent
                  ? "linear-gradient(180deg, rgba(99,102,241,0.08), var(--bg2) 60%)"
                  : isPopular
                  ? "linear-gradient(180deg, rgba(91,106,240,0.06), var(--bg2) 70%)"
                  : "var(--bg2)",
                display: "grid",
                gap: 10,
                position: "relative",
                boxShadow: isCurrent || isPopular ? "0 0 0 1px var(--acg), 0 16px 40px rgba(0,0,0,0.3)" : undefined,
              }}
            >
              {card.badge && (
                <span style={{
                  position: "absolute",
                  top: -12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--ac)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 99,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}>
                  {card.badge}
                </span>
              )}
              <div>
                <h3 style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--tx0)" }}>{card.key}</h3>
                <p className="mono" style={{ color: "var(--tx0)", fontSize: 18, fontWeight: 700, fontFamily: "var(--display)" }}>{price}</p>
              </div>
              <p style={{ color: "var(--tx1)", minHeight: 36, fontSize: 13, lineHeight: 1.5 }}>{card.description}</p>
              <ul style={{ color: "var(--tx1)", display: "grid", gap: 6, paddingLeft: 0, listStyle: "none", fontSize: 12.5 }}>
                {highlights.map((item) => (
                  <li key={item} style={{ display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.5 }}>
                    <span style={{ color: "var(--ac)", flexShrink: 0, marginTop: 2 }}>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button className="btn" disabled style={{ marginTop: 6 }}>Current Plan</button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={!canUpgrade}
                  onClick={() => void upgrade(card.key)}
                  style={{ marginTop: 6 }}
                >
                  Upgrade
                </button>
              )}
            </article>
          );
        })}
      </section>

      {/* Collaboration explainer */}
      <section style={{ maxWidth: 720, margin: "32px auto 0", textAlign: "center" }}>
        <p style={{ color: "var(--tx1)", fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: "var(--tx0)" }}>How collaboration works:</strong>{" "}
          Invite anyone with a DataHub account to your project. Their usage (AI messages,
          pipeline runs, uploads) counts against <em>your</em> quota — no extra per-seat
          charges. Professional supports up to 5 collaborators per project; Expert up to 20.
        </p>
      </section>
    </main>
  );
}
