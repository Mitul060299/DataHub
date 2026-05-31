import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

const FAQ_ITEMS = [
  {
    q: "What is a business intelligence tool?",
    a: "A business intelligence (BI) tool helps organisations collect, process, and visualise data to support decision-making. Traditional BI tools like Power BI, Tableau, and Looker focus on the visualisation and reporting layer. DataHub focuses on the data preparation and analytics layer — cleaning, transforming, and automating the data before it reaches your BI tool, and providing a built-in dashboard layer for teams that don't need a dedicated BI platform.",
  },
  {
    q: "How does DataHub fit into a business intelligence workflow?",
    a: "DataHub sits upstream of your BI tool. It handles the messy work: loading raw files, cleaning data, joining multiple sources, scheduling refreshes, and exporting clean tables to Power BI, Tableau, Looker, or Google Sheets. This keeps your BI tool focused on visualisation rather than data wrangling.",
  },
  {
    q: "Can DataHub replace Power BI or Tableau?",
    a: "For basic reporting use cases — sharing tables, charts, and summaries — DataHub's built-in dashboard layer may be sufficient. For complex interactive dashboards with drill-downs, custom calculated fields, and enterprise distribution, Power BI and Tableau are more capable. Most teams use DataHub to prepare data and Power BI or Tableau to visualise it.",
  },
  {
    q: "What makes DataHub different from traditional BI tools?",
    a: "Traditional BI tools assume your data is already clean and structured. DataHub is designed for the messy reality: it handles inconsistent formats, nulls, duplicates, multi-source joins, and type mismatches before data reaches a BI tool. It also adds scheduling and pipeline automation that most BI tools lack or price expensively.",
  },
  {
    q: "Is DataHub suitable as an analytics tool for small businesses?",
    a: "Yes. DataHub's free tier and affordable paid plans (from $19/month) make it practical for small businesses and solo analysts. It doesn't require a data engineering team to operate — a business analyst can set it up and run it independently.",
  },
];

export function BusinessIntelligencePage() {
  useSEO({
    title: "Business Intelligence Tool for Analysts | AI Analytics Software — No SQL Required",
    description:
      "DataHub is an AI analytics tool for business intelligence: prepare data, build dashboards, and automate reporting — no SQL or data engineering team required. Free plan available.",
    canonical: "https://datahub.org.in/business-intelligence-tool",
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
          { "@type": "ListItem", position: 2, name: "Business Intelligence Tool", item: "https://datahub.org.in/business-intelligence-tool" },
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
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6AF0", marginBottom: 16 }}>Business Intelligence Tool · Analytics Software</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", color: "#fff", margin: "0 0 20px" }}>
            Business Intelligence Tool for Analysts: AI-Powered Insights Without SQL
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 24px", maxWidth: 640 }}>
            DataHub combines data preparation, AI-powered analytics, and dashboard sharing into one platform — without requiring a data engineering team or SQL expertise. The analytics tool for analysts who need real business intelligence without the enterprise overhead.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 32px", maxWidth: 640 }}>
            Works alongside Power BI and Tableau or replaces them for simpler reporting workflows. Free plan available.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
            <Link to="/pricing" style={{ background: "transparent", color: "#94a3b8", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #2a3050" }}>See pricing</Link>
          </div>
        </header>

        {/* BI workflow */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 24px", letterSpacing: "-0.3px" }}>The full analytics workflow — from raw data to shared dashboard</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { step: "01", title: "Ingest from any source", detail: "Upload CSV, Excel, JSON, Parquet files — or connect to PostgreSQL, Snowflake, BigQuery, Redshift, or any major database." },
              { step: "02", title: "Clean and prepare with AI", detail: "Describe preparation tasks in plain English. DataHub generates SQL for each step. You review and approve before anything runs." },
              { step: "03", title: "Analyse and aggregate", detail: "'Show revenue by region month over month.' 'Calculate gross margin by product category.' 'Identify top 10 customers by spend.' All via plain English." },
              { step: "04", title: "Share results", detail: "Publish an interactive dashboard with a shareable link. Push clean data to Power BI, Tableau, or Google Sheets. Export to CSV or write back to a database." },
              { step: "05", title: "Automate the whole workflow", detail: "Schedule every step to run daily, weekly, or monthly. New data flows in, the same approved pipeline runs, the dashboard updates automatically." },
            ].map((item, i) => (
              <div key={item.step} style={{ display: "flex", gap: 20, padding: "20px 0", borderBottom: i < 4 ? "1px solid #1a1e30" : "none" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#5B6AF0", opacity: 0.6, width: 40, flexShrink: 0, lineHeight: 1 }}>{item.step}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{item.title}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.65, color: "#94a3b8" }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Differentiators */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 32px", letterSpacing: "-0.3px" }}>Why DataHub is different from traditional BI tools</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
            {[
              { label: "No SQL required", detail: "Traditional BI tools assume you can write queries. DataHub translates plain English into SQL automatically." },
              { label: "Preparation built in", detail: "Power BI and Tableau assume clean data. DataHub handles the cleaning, joining, and wrangling before visualisation." },
              { label: "Transparent and auditable", detail: "Every data operation is logged as readable SQL with timestamps, approvals, and a full audit trail." },
              { label: "Affordable", detail: "Free tier available. Paid plans from $19/month. No enterprise procurement required." },
            ].map((item) => (
              <div key={item.label} style={{ background: "#131520", border: "1px solid #1e2235", borderRadius: 10, padding: "20px 22px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#5B6AF0", marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#94a3b8" }}>{item.detail}</div>
              </div>
            ))}
          </div>
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

        <section style={{ padding: "56px 0 0" }}>
          <div style={{ background: "#131a3e", border: "1px solid #2a3a80", borderRadius: 14, padding: "40px 36px", textAlign: "center" }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Business intelligence without the enterprise complexity</h2>
            <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 28px" }}>Free plan available. First result in under a minute. No data engineering team required.</p>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "14px 36px", borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
