import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

const COMPARE_ROWS = [
  { feature: "Price", them: "Enterprise-only pricing (typically $60k–$200k+/year)", us: "Free tier; paid from $19/month" },
  { feature: "Target user", them: "Data engineering and data science teams", us: "Business analysts, consultants, small teams" },
  { feature: "AI assistance", them: "AutoML, built-in AI — but for ML, not analyst tasks", us: "Plain-English AI for data cleaning and transformation" },
  { feature: "Setup", them: "Cloud deployment or on-prem installation required", us: "Browser — zero install" },
  { feature: "Time to first result", them: "Days to weeks (procurement, deployment, onboarding)", us: "Under a minute" },
  { feature: "Scheduling", them: "Yes — via Dataiku Scenarios", us: "Built-in cron scheduling from Starter plan" },
  { feature: "Collaboration", them: "Yes — enterprise-grade governance and access control", us: "Team projects, audit logs, role-based access" },
  { feature: "Use case fit", them: "Best for enterprise ML and data science programs", us: "Best for analyst data prep and reporting automation" },
];

const FAQ_ITEMS = [
  {
    q: "What is Dataiku and who is it for?",
    a: "Dataiku is an enterprise AI and data science platform designed for large organisations running ML programmes. It supports the full data science lifecycle — from data preparation to model training, deployment, and monitoring. It's primarily for data engineering and data science teams, not business analysts doing day-to-day reporting and preparation work.",
  },
  {
    q: "Why would an analyst choose DataHub over Dataiku?",
    a: "Cost and fit. Dataiku requires enterprise procurement (typically $60k+ per year), an IT deployment, and weeks of onboarding. For a business analyst who needs to clean files, join tables, and schedule weekly reports, that's enormous overhead for simple workflows. DataHub is free to start, works in the browser, and takes minutes to set up.",
  },
  {
    q: "Does DataHub have any ML or predictive analytics features?",
    a: "DataHub focuses on data preparation, transformation, and reporting — not machine learning. If you need to train and deploy ML models, Dataiku is more appropriate. If you need to clean, reshape, and automate data workflows, DataHub is the better fit.",
  },
  {
    q: "Is DataHub suitable for teams?",
    a: "Yes. DataHub's Team plan ($179/month for up to 3 users) supports shared projects, team-level access controls, audit logging, and collaborative pipeline editing. It's designed for small analyst teams, not enterprise data science departments.",
  },
];

export function DataikuAlternativePage() {
  useSEO({
    title: "Best Dataiku Alternative for Small Teams in 2026 | Analyst-First Data Tool",
    description:
      "DataHub is the best Dataiku alternative for analysts and small teams: AI-powered data preparation and automation that starts free, works in the browser, and takes minutes to set up.",
    canonical: "https://datahub.org.in/dataiku-alternative",
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://datahub.org.in/" },
          { "@type": "ListItem", position: 2, name: "Dataiku Alternative", item: "https://datahub.org.in/dataiku-alternative" },
        ],
      },
    ],
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f1a", color: "#e2e8f0", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <nav style={{ borderBottom: "1px solid #1e2235", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#0d0f1a", zIndex: 100 }}>
        <Link to="/" style={{ color: "#fff", fontWeight: 700, fontSize: 18, textDecoration: "none", letterSpacing: "-0.3px" }}>DataHub</Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link to="/pricing" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>Pricing</Link>
          <Link to="/blog" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>Blog</Link>
          <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "7px 18px", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Start free</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 24px 80px" }}>
        <header style={{ padding: "64px 0 48px", borderBottom: "1px solid #1e2235" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6AF0", marginBottom: 16 }}>Dataiku Alternative</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", color: "#fff", margin: "0 0 20px" }}>
            The Best Dataiku Alternative for Small Teams and Analysts
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 32px", maxWidth: 620 }}>
            Dataiku is an excellent enterprise AI platform — for data science teams with a budget to match. If you're an analyst or small team that needs data preparation, transformation, and automation without enterprise procurement, DataHub is the right fit.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Try free →</Link>
            <Link to="/pricing" style={{ background: "transparent", color: "#94a3b8", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #2a3050" }}>See pricing</Link>
          </div>
        </header>

        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 24px", letterSpacing: "-0.3px" }}>DataHub vs Dataiku</h2>
          <div style={{ border: "1px solid #1e2235", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#131520" }}>
                <tr>
                  {["Feature", "Dataiku", "DataHub"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748b", borderBottom: "1px solid #1e2235" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row, i) => (
                  <tr key={row.feature} style={{ background: i % 2 === 0 ? "#0d0f1a" : "#101320" }}>
                    <td style={{ padding: "12px 14px", fontSize: 14, fontWeight: 600, color: "#e2e8f0", borderBottom: "1px solid #1a1e30" }}>{row.feature}</td>
                    <td style={{ padding: "12px 14px", fontSize: 14, color: "#94a3b8", borderBottom: "1px solid #1a1e30" }}>{row.them}</td>
                    <td style={{ padding: "12px 14px", fontSize: 14, color: "#34d399", borderBottom: "1px solid #1a1e30" }}>{row.us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 20px", letterSpacing: "-0.3px" }}>Frequently asked questions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} style={{ background: "#131520", border: "1px solid #1e2235", borderRadius: 10, padding: "20px 24px" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>{item.q}</div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: "#94a3b8" }}>{item.a}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: "56px 0 0" }}>
          <div style={{ background: "#131a3e", border: "1px solid #2a3a80", borderRadius: 14, padding: "40px 36px", textAlign: "center" }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Analyst-grade data prep without enterprise pricing</h2>
            <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 28px" }}>Free plan available. Start in minutes, not weeks.</p>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "14px 36px", borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
