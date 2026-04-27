import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { billingEnabled } from "../utils/featureFlags";
import { capture } from "../lib/posthog";
import { useBillingRegion } from "../hooks/useIsIndian";
import { useSEO } from "../hooks/useSEO";

type PlanKey = "Free" | "Professional" | "Team" | "Business" | "Enterprise";

type PlanCard = {
  key: PlanKey;
  priceINR: string;
  priceUSD: string;
  description: string;
  highlightsINR: string[];
  highlightsUSD: string[];
};

const planCards: PlanCard[] = [
  {
    key: "Free",
    priceINR: "₹0",
    priceUSD: "$0",
    description: "Students, evaluation, and hobby workflows",
    highlightsINR: ["Solo projects only", "Up to 2 projects", "500 MB storage · 5 GB scan/month", "100 AI messages/month", "CSV + Excel only"],
    highlightsUSD: ["Solo projects only", "Up to 2 projects", "500 MB storage · 5 GB scan/month", "100 AI messages/month", "CSV + Excel only"],
  },
  {
    key: "Professional",
    priceINR: "₹6,999 / month",
    priceUSD: "$149 / month",
    description: "Solo consultants and analysts",
    highlightsINR: ["Solo projects · 1 seat", "Up to 20 projects", "20 GB storage · 50 GB scan/month", "2,000 AI messages/month", "DB: PostgreSQL, MySQL, SQLite, MSSQL, Oracle", "S3, GCS, Azure Blob storage"],
    highlightsUSD: ["Solo projects · 1 seat", "Up to 20 projects", "20 GB storage · 50 GB scan/month", "2,000 AI messages/month", "DB: PostgreSQL, MySQL, SQLite, MSSQL, Oracle", "S3, GCS, Azure Blob storage"],
  },
  {
    key: "Team",
    priceINR: "₹14,999 / month",
    priceUSD: "$299 / month",
    description: "Small analytics and consulting teams",
    highlightsINR: ["Includes 3 seats · +₹2,499/extra seat", "10 members per project · 5 collaborative projects", "100 GB+ storage · 200 GB+ scan/month", "5,000+ AI messages (scales with seats)", "+ Snowflake, Redshift, BigQuery"],
    highlightsUSD: ["Includes 3 seats · +$49/extra seat", "10 members per project · 5 collaborative projects", "100 GB+ storage · 200 GB+ scan/month", "5,000+ AI messages (scales with seats)", "+ Snowflake, Redshift, BigQuery"],
  },
  {
    key: "Business",
    priceINR: "₹29,999 / month",
    priceUSD: "$599 / month",
    description: "Governance-first mid-size enterprises",
    highlightsINR: ["Includes 5 seats · +₹3,999/extra seat", "50 members per project · unlimited collaborative projects", "2 TB storage + unlimited scan", "Unlimited AI messages", "SSO/SAML · Custom connectors"],
    highlightsUSD: ["Includes 5 seats · +$79/extra seat", "50 members per project · unlimited collaborative projects", "2 TB storage + unlimited scan", "Unlimited AI messages", "SSO/SAML · Custom connectors"],
  },
  {
    key: "Enterprise",
    priceINR: "Custom",
    priceUSD: "Custom",
    description: "Fortune 500 and regulated environments",
    highlightsINR: ["Unlimited members per project", "Unlimited collaborative projects", "Custom TB-scale storage", "Unlimited AI messages", "24/7 dedicated support", "Custom compliance + integrations"],
    highlightsUSD: ["Unlimited members per project", "Unlimited collaborative projects", "Custom TB-scale storage", "Unlimited AI messages", "24/7 dedicated support", "Custom compliance + integrations"],
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
        description: "3 seats included, collaborative projects up to 5, +Snowflake/Redshift/BigQuery.",
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
  const region = useBillingRegion();
  const isIndian = region.isIndian;
  const [message, setMessage] = useState<string | null>(null);

  useSEO({
    title: "datahub.org.in Pricing – Free, Pro & Team Plans | AI Data Analysis",
    description:
      "Start free forever. Upgrade to Professional from ₹6,999/month. All plans include the AI agent, transparent SQL pipelines, and database connectors. No credit card to get started.",
    canonical: "https://datahub.org.in/pricing",
    structuredData: PRICING_LD,
  });

  const currentIndex = useMemo(() => planCards.findIndex((p) => p.key === plan), [plan]);

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
          💳 Prices shown in USD. International payments accepted via Razorpay.
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14, maxWidth: 1180, margin: "0 auto" }}>
        {planCards.map((card, index) => {
          const isCurrent = card.key === plan;
          const canUpgrade = index >= currentIndex && !isCurrent;
          const price = isIndian ? card.priceINR : card.priceUSD;
          const highlights = isIndian ? card.highlightsINR : card.highlightsUSD;
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
