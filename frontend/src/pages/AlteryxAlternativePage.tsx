import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

const COMPARE_ROWS = [
  { feature: "Price", them: "~$5,195/seat/year", us: "From $0/month (free tier available)" },
  { feature: "Setup", them: "Download & install Alteryx Designer", us: "Runs in the browser — zero install" },
  { feature: "Interface", them: "Drag-and-drop node canvas", us: "Plain-English AI + visual pipeline view" },
  { feature: "AI assistance", them: "Limited (AiDIN add-on, extra cost)", us: "Built-in AI for every transformation step" },
  { feature: "Transparency", them: "Proprietary tool steps, limited SQL view", us: "Every step shown as readable SQL you approve" },
  { feature: "Scheduling", them: "Requires Alteryx Server or Cloud", us: "Built-in cron scheduling on all paid plans" },
  { feature: "Collaboration", them: "Per-seat licensing for each user", us: "Team plans with shared projects and audit logs" },
  { feature: "Learning curve", them: "Days to weeks for new users", us: "Working in under a minute" },
];

const FAQ_ITEMS = [
  {
    q: "Is DataHub a true Alteryx replacement?",
    a: "For the workflows that 90% of analysts actually use — cleaning files, joining tables, aggregating data, scheduling reports — DataHub covers all of them. If you need Alteryx's spatial analytics, R/Python integrations, or enterprise governance features, DataHub may not fully replace it. But for core data transformation and automation, DataHub is a direct functional alternative at a fraction of the cost.",
  },
  {
    q: "Can DataHub handle the same data volume as Alteryx?",
    a: "DataHub is optimised for analyst-scale workloads: files up to several GB, database queries over millions of rows. For petabyte-scale production ETL pipelines, an engineering-grade tool is more appropriate. For the day-to-day work analysts do, DataHub handles it comfortably.",
  },
  {
    q: "How long does migration from Alteryx take?",
    a: "Most analysts rebuild their core workflows in DataHub in a few hours. There is no file conversion — you simply re-describe your transformations in plain English and DataHub builds the equivalent pipeline. The AI dramatically reduces the time compared to manual rebuilding.",
  },
  {
    q: "Does DataHub have an Alteryx-compatible workflow format?",
    a: "No — DataHub does not import .yxmd files. Workflows are rebuilt using natural-language descriptions. This is actually faster than manual conversion for most standard transformation workflows.",
  },
];

export function AlteryxAlternativePage() {
  useSEO({
    title: "Best Alteryx Alternative in 2026 | AI-Powered Data Analytics at 86% Lower Cost",
    description:
      "Looking for an Alteryx alternative? DataHub gives you visual data pipelines, AI-powered transformations, and automated scheduling — at a fraction of the cost. No installation required.",
    canonical: "https://datahub.org.in/alteryx-alternative",
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
          { "@type": "ListItem", position: 2, name: "Alteryx Alternative", item: "https://datahub.org.in/alteryx-alternative" },
        ],
      },
    ],
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f1a", color: "#e2e8f0", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Nav */}
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
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6AF0", marginBottom: 16 }}>Alteryx Alternative</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", color: "#fff", margin: "0 0 20px" }}>
            The Best Alteryx Alternative in 2026
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 32px", maxWidth: 620 }}>
            Alteryx Designer costs ~$5,195 per seat per year. DataHub gives you AI-powered data transformation, visual reusable pipelines, and automated scheduling — all in the browser, from $0/month.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Try free — no install needed →</Link>
            <Link to="/pricing" style={{ background: "transparent", color: "#94a3b8", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #2a3050" }}>See pricing</Link>
          </div>
        </header>

        {/* Why switch */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 32px", letterSpacing: "-0.3px" }}>Why analysts are switching from Alteryx</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
            {[
              { label: "86% lower cost", detail: "DataHub Team plan is ~$716/seat/year vs $5,195 for Alteryx" },
              { label: "Zero setup", detail: "Works in any browser — no desktop app, no IT ticket, no installer" },
              { label: "AI-powered", detail: "Describe transformations in plain English instead of building node graphs" },
              { label: "Full transparency", detail: "Every step shown as readable SQL you approve before it runs" },
            ].map((item) => (
              <div key={item.label} style={{ background: "#131520", border: "1px solid #1e2235", borderRadius: 10, padding: "20px 22px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#5B6AF0", marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#94a3b8" }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison table */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 24px", letterSpacing: "-0.3px" }}>DataHub vs Alteryx: side-by-side comparison</h2>
          <div style={{ border: "1px solid #1e2235", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#131520" }}>
                <tr>
                  {["Feature", "Alteryx", "DataHub"].map((h) => (
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

        {/* Core capabilities */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 20px", letterSpacing: "-0.3px" }}>Everything you use Alteryx for — without the enterprise cost</h2>
          <p style={{ fontSize: 16, lineHeight: 1.75, color: "#94a3b8", margin: "0 0 20px" }}>
            DataHub covers the core Alteryx use cases that analysts actually use every day: loading files, cleaning data, joining tables, aggregating results, and scheduling the whole workflow to run automatically on fresh data each week.
          </p>
          <ul style={{ margin: "0 0 20px", paddingLeft: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              "CSV, Excel, JSON, Parquet upload with automatic schema detection",
              "Database connectors: PostgreSQL, MySQL, Snowflake, BigQuery, Redshift, Azure Synapse",
              "Join, union, pivot, aggregate, filter — all via natural-language instructions",
              "30+ data quality operations: deduplication, null handling, type casting, column standardisation",
              "Reconciliation: full outer join with variance columns and auto key detection",
              "Pipeline scheduling on all paid plans — daily, weekly, or monthly",
              "Team collaboration with shared projects and full audit logging",
            ].map((item) => (
              <li key={item} style={{ fontSize: 15, lineHeight: 1.65, color: "#c4cfe4" }}>
                <span style={{ color: "#34d399", marginRight: 8 }}>✓</span>{item}
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

        {/* Bottom CTA */}
        <section style={{ padding: "56px 0 0" }}>
          <div style={{ background: "#131a3e", border: "1px solid #2a3a80", borderRadius: 14, padding: "40px 36px", textAlign: "center" }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Switch from Alteryx today</h2>
            <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 28px" }}>Free plan available. No credit card required. Working in under a minute.</p>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "14px 36px", borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
