import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

const USE_CASES = [
  { title: "Clean messy data", description: "Fix nulls, mixed types, broken encodings, duplicate rows, and inconsistent column names — all with plain-English commands." },
  { title: "Join and merge datasets", description: "Combine CSV exports, Excel files, or database tables into one clean analysis-ready dataset. Auto-detect join keys." },
  { title: "Aggregate and summarise", description: "Group by region, category, date, or any dimension. Calculate sums, averages, percentages, and custom metrics." },
  { title: "Prepare data for Power BI", description: "Export clean, typed, and structured data that Power BI, Tableau, or Looker can ingest without additional processing." },
  { title: "Build reusable pipelines", description: "Save any workflow as a visual pipeline. Schedule it to run daily, weekly, or monthly on fresh data without manual steps." },
  { title: "Audit every transformation", description: "Every step is transparent SQL you review and approve. Full audit log with timestamps on all paid plans." },
];

const FAQ_ITEMS = [
  {
    q: "What is an AI data analytics tool?",
    a: "An AI data analytics tool uses artificial intelligence to help users clean, transform, and analyse data using natural-language instructions instead of writing code or SQL manually. The AI interprets what you describe ('remove duplicates', 'calculate month-over-month growth', 'join with the customers table') and generates the appropriate data operations, which you review before they run.",
  },
  {
    q: "Is DataHub a business intelligence tool or a data preparation tool?",
    a: "DataHub sits at the intersection of both. It handles data preparation (cleaning, joining, transformation, scheduling) and includes a built-in dashboard layer for visualisation. It is designed to be the layer between your raw data sources and your BI tools — or a standalone analytics platform for teams that don't need a dedicated BI tool.",
  },
  {
    q: "How is DataHub different from other AI analytics tools?",
    a: "Most AI analytics tools are either chat-only (ephemeral, no automation) or engineering-grade (require SQL or Python knowledge). DataHub is designed specifically for business analysts: every transformation runs as readable SQL you approve, every workflow saves as a reusable pipeline, and everything can be scheduled to run automatically on new data.",
  },
  {
    q: "What data sources does DataHub support?",
    a: "DataHub supports file uploads (CSV, Excel, JSON, Parquet) and direct database connections to PostgreSQL, MySQL, MSSQL, Oracle, SQLite, Snowflake, BigQuery, Redshift, and Azure Synapse.",
  },
  {
    q: "Does DataHub require any coding knowledge?",
    a: "No. DataHub is a no-code AI analytics tool. You describe what you want in plain English — the AI generates SQL, you review it and approve, and it runs. You can also edit the generated SQL if you have specific requirements, but this is optional.",
  },
];

export function AIDataAnalyticsPage() {
  useSEO({
    title: "AI Data Analytics Tool | Best AI Analytics Platform for Analysts & Teams",
    description:
      "DataHub is the AI data analytics tool built for analysts. Clean data, run transformations, and build dashboards using plain English — no SQL, no coding. The best AI analytics platform for small teams.",
    canonical: "https://datahub.org.in/ai-data-analytics",
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
          { "@type": "ListItem", position: 2, name: "AI Data Analytics Tool", item: "https://datahub.org.in/ai-data-analytics" },
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
        {/* Hero */}
        <header style={{ padding: "64px 0 48px", borderBottom: "1px solid #1e2235" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6AF0", marginBottom: 16 }}>AI Data Analytics Tool</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", color: "#fff", margin: "0 0 20px" }}>
            AI Data Analytics Tool for Analysts and Teams
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 24px", maxWidth: 640 }}>
            DataHub is an AI-powered data analytics platform that lets you clean, transform, and analyse data using plain English. No SQL, no coding, no black-box AI — every step is transparent and yours to approve.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 32px", maxWidth: 640 }}>
            Used by analysts, accountants, and consultants who spend too much time on manual data preparation. Free plan available — working in under a minute.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
            <Link to="/pricing" style={{ background: "transparent", color: "#94a3b8", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #2a3050" }}>See pricing</Link>
          </div>
        </header>

        {/* What DataHub does */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 32px", letterSpacing: "-0.3px" }}>What you can do with DataHub</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {USE_CASES.map((item) => (
              <div key={item.title} style={{ background: "#131520", border: "1px solid #1e2235", borderRadius: 10, padding: "20px 22px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{item.title}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#94a3b8" }}>{item.description}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 24px", letterSpacing: "-0.3px" }}>How AI data analytics works in DataHub</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { step: "01", title: "Connect your data", detail: "Upload CSV, Excel, JSON, or Parquet files — or connect directly to PostgreSQL, Snowflake, BigQuery, or other databases." },
              { step: "02", title: "Ask in plain English", detail: "Describe what you need: 'clean the date column', 'join with the product table', 'show revenue by region'. The AI generates the SQL." },
              { step: "03", title: "Review and approve", detail: "DataHub shows the exact SQL before it runs. Approve it, edit it, or reject it. Nothing happens without your go-ahead." },
              { step: "04", title: "Save and schedule", detail: "Save the workflow as a reusable pipeline. Schedule it to run automatically on fresh data every day, week, or month." },
            ].map((item, i) => (
              <div key={item.step} style={{ display: "flex", gap: 20, padding: "20px 0", borderBottom: i < 3 ? "1px solid #1a1e30" : "none" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#5B6AF0", opacity: 0.6, width: 40, flexShrink: 0, lineHeight: 1 }}>{item.step}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{item.title}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.65, color: "#94a3b8" }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Positioning */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 20px", letterSpacing: "-0.3px" }}>Why DataHub is the best AI analytics tool for analysts</h2>
          <p style={{ fontSize: 16, lineHeight: 1.75, color: "#94a3b8", margin: "0 0 20px" }}>
            Most AI analytics tools fall into two categories: chat-only tools that can't automate or schedule work, and enterprise platforms that require data engineering resources to operate. DataHub is built for the middle: a business analyst who needs reliable, auditable, repeatable data work done fast.
          </p>
          <ul style={{ paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, margin: 0 }}>
            {[
              "AI-powered — plain-English data transformation, no SQL knowledge required",
              "Transparent — every step is readable SQL you review and approve",
              "Reusable — save workflows as pipelines that run themselves on new data",
              "Reliable — deterministic SQL execution, not AI-generated estimates",
              "Affordable — free tier available; 86% cheaper than Alteryx",
              "No-code — designed for analysts, not data engineers",
            ].map((item) => (
              <li key={item} style={{ fontSize: 15, lineHeight: 1.65, color: "#c4cfe4" }}>
                <span style={{ color: "#34d399", marginRight: 10 }}>✓</span>{item}
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 28px", letterSpacing: "-0.3px" }}>Frequently asked questions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} style={{ background: "#131520", border: "1px solid #1e2235", borderRadius: 10, padding: "20px 24px" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>{item.q}</div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: "#94a3b8" }}>{item.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "56px 0 0" }}>
          <div style={{ background: "#131a3e", border: "1px solid #2a3a80", borderRadius: 14, padding: "40px 36px", textAlign: "center" }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Start with AI data analytics today</h2>
            <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 28px" }}>Free plan available. No credit card required. No code to write.</p>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "14px 36px", borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
