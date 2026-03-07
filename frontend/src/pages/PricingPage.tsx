import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { updateCurrentUserPlan } from "../api";
import { useUser } from "../contexts/UserContext";
import { billingEnabled } from "../utils/featureFlags";

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
    price: "$0",
    description: "Students, evaluation, and hobby workflows",
    highlights: ["100 MB storage", "50 AI messages/month", "CSV + Excel only", "No DB connectors"],
  },
  {
    key: "Professional",
    price: "$79 / user / month",
    description: "Solo consultants and analysts",
    highlights: ["10 GB storage", "500 AI messages/month", "PostgreSQL/MySQL/MongoDB/MSSQL", "JSON + Parquet support"],
  },
  {
    key: "Team",
    price: "$149 / user / month",
    description: "Small analytics and consulting teams",
    highlights: ["100 GB shared storage", "Unlimited workspaces", "Snowflake/BigQuery/Redshift", "Team collaboration + RBAC"],
  },
  {
    key: "Business",
    price: "$249 / user / month",
    description: "Governance-first mid-size enterprises",
    highlights: ["500 GB–1 TB shared storage", "SSO/SAML", "Advanced audit + lineage", "Webhooks + enterprise controls"],
  },
  {
    key: "Enterprise",
    price: "Custom",
    description: "Fortune 500 and regulated environments",
    highlights: ["Custom TB-scale storage", "On-prem / VPC deployments", "24/7 dedicated support", "Custom compliance + integrations"],
  },
];

export function PricingPage() {
  const { plan, setPlan } = useUser();
  const navigate = useNavigate();
  const [busyPlan, setBusyPlan] = useState<PlanKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const currentIndex = useMemo(() => planCards.findIndex((p) => p.key === plan), [plan]);

  const upgrade = async (target: PlanKey) => {
    setMessage(null);
    if (target === "Enterprise") {
      setMessage("Enterprise onboarding is sales-assisted. Contact sales@datahub.org.in.");
      return;
    }
    if (billingEnabled) {
      navigate("/settings/billing");
      return;
    }
    setBusyPlan(target);
    try {
      const result = await updateCurrentUserPlan(target);
      if (result.success) {
        setPlan(target);
        setMessage(`Plan updated to ${target}.`);
      } else {
        setMessage(result.message ?? "Plan update could not be completed.");
      }
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: string } } };
      setMessage(maybeError.response?.data?.detail ?? "Failed to update plan.");
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <main className="app-page" style={{ padding: 20 }}>
      <section className="panel" style={{ padding: 16, marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Pricing & Plans</h1>
        <p style={{ color: "var(--tx1)" }}>Current plan: <strong style={{ color: "var(--tx0)" }}>{plan}</strong></p>
        {message ? <p style={{ color: "var(--tx1)", marginTop: 8 }}>{message}</p> : null}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
        {planCards.map((card, index) => {
          const isCurrent = card.key === plan;
          const canUpgrade = index >= currentIndex && !isCurrent;
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
              }}
            >
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
              {isCurrent ? (
                <button className="btn" disabled style={{ marginTop: 6 }}>Current Plan</button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={busyPlan === card.key || !canUpgrade}
                  onClick={() => void upgrade(card.key)}
                  style={{ marginTop: 6 }}
                >
                  {busyPlan === card.key ? "Updating..." : card.key === "Enterprise" ? "Contact Sales" : "Upgrade"}
                </button>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
