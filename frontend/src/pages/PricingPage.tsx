import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { billingEnabled } from "../utils/featureFlags";
import { capture } from "../lib/posthog";
import { useBillingRegion } from "../hooks/useIsIndian";
import { useSEO } from "../hooks/useSEO";

type PlanKey = "Free" | "Starter" | "Professional" | "Team" | "Business" | "Enterprise";

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
    highlightsINR: ["Solo projects only", "Up to 2 projects", "500 MB storage · 5 GB scan/month", "50 AI messages/month", "CSV + Excel only"],
    highlightsUSD: ["Solo projects only", "Up to 2 projects", "500 MB storage · 5 GB scan/month", "50 AI messages/month", "CSV + Excel only"],
  },
  {
    key: "Starter",
    priceINR: "₹999 / month",
    priceUSD: "$19 / month",
    description: "Indie analysts, students upgrading from Free",
    highlightsINR: ["Solo projects · 1 seat", "Up to 5 projects", "5 GB storage · 25 GB scan/month", "500 AI messages/month", "CSV, Excel, JSON · SQLite connector", "Daily scheduled runs"],
    highlightsUSD: ["Solo projects · 1 seat", "Up to 5 projects", "5 GB storage · 25 GB scan/month", "500 AI messages/month", "CSV, Excel, JSON · SQLite connector", "Daily scheduled runs"],
  },
  {
    key: "Professional",
    priceINR: "₹3,999 / month",
    priceUSD: "$79 / month",
    description: "Solo consultants and analysts",
    highlightsINR: ["Solo projects · 1 seat", "Up to 20 projects", "20 GB storage · 100 GB scan/month", "1,500 AI messages/month", "DB: PostgreSQL, MySQL, SQLite, MSSQL, Oracle", "S3, GCS, Azure Blob storage"],
    highlightsUSD: ["Solo projects · 1 seat", "Up to 20 projects", "20 GB storage · 100 GB scan/month", "1,500 AI messages/month", "DB: PostgreSQL, MySQL, SQLite, MSSQL, Oracle", "S3, GCS, Azure Blob storage"],
  },
  {
    key: "Team",
    priceINR: "₹8,999 / month",
    priceUSD: "$179 / month",
    description: "Small analytics and consulting teams",
    highlightsINR: ["Includes 3 seats · +₹1,499/extra seat", "10 members per project · 5 collaborative projects", "100 GB+ storage · 500 GB+ scan/month", "4,000+ AI messages (scales with seats)", "+ Snowflake, Redshift, BigQuery", "Audit log"],
    highlightsUSD: ["Includes 3 seats · +$29/extra seat", "10 members per project · 5 collaborative projects", "100 GB+ storage · 500 GB+ scan/month", "4,000+ AI messages (scales with seats)", "+ Snowflake, Redshift, BigQuery", "Audit log"],
  },
  {
    key: "Business",
    priceINR: "₹17,999 / month",
    priceUSD: "$349 / month",
    description: "Governance-first mid-size enterprises",
    highlightsINR: ["Includes 5 seats · +₹2,499/extra seat", "50 members per project · unlimited collaborative projects", "500 GB+ storage · 2 TB+ scan/month", "15,000+ AI messages (scales with seats)", "SSO/SAML · Webhooks · Custom connectors"],
    highlightsUSD: ["Includes 5 seats · +$49/extra seat", "50 members per project · unlimited collaborative projects", "500 GB+ storage · 2 TB+ scan/month", "15,000+ AI messages (scales with seats)", "SSO/SAML · Webhooks · Custom connectors"],
  },
  {
    key: "Enterprise",
    priceINR: "Custom",
    priceUSD: "Custom",
    description: "Fortune 500 and regulated environments — from $1,500/mo",
    highlightsINR: ["Unlimited members per project", "Unlimited collaborative projects", "Custom TB-scale storage", "Negotiated AI / pipeline / scan quotas", "24/7 dedicated support", "Custom compliance + integrations"],
    highlightsUSD: ["Unlimited members per project", "Unlimited collaborative projects", "Custom TB-scale storage", "Negotiated AI / pipeline / scan quotas", "24/7 dedicated support", "Custom compliance + integrations"],
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
    highPrice: "17999",
    offerCount: "6",
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "50 AI messages/month, 500 MB storage, CSV + Excel uploads.",
      },
      {
        "@type": "Offer",
        name: "Starter",
        price: "999",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "5 projects, 5 GB storage, 500 AI messages, SQLite + JSON support.",
      },
      {
        "@type": "Offer",
        name: "Professional",
        price: "3999",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "20 projects, 20 GB storage, 1,500 AI messages, all SQL databases.",
      },
      {
        "@type": "Offer",
        name: "Team",
        price: "8999",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "3 seats included, collaborative projects up to 5, +Snowflake/Redshift/BigQuery.",
      },
      {
        "@type": "Offer",
        name: "Business",
        price: "17999",
        priceCurrency: "INR",
        url: "https://datahub.org.in/pricing",
        availability: "https://schema.org/InStock",
        description: "5 seats included, SSO/SAML, webhooks, custom connectors, 500 GB storage.",
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
    title: "datahub.org.in Pricing – Free, Starter, Pro & Team Plans | AI Data Analysis",
    description:
      "Start free forever. Starter from ₹999/month, Professional ₹3,999, Team ₹8,999, Business ₹17,999. All plans include the AI agent, transparent SQL pipelines, and database connectors.",
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
          💳 Prices shown in USD. International (USD) billing is launching soon — contact <a href="mailto:sales@datahub.org.in" style={{ color: "inherit", textDecoration: "underline" }}>sales@datahub.org.in</a> in the meantime.
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 14, maxWidth: 1320, margin: "0 auto" }}>
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
