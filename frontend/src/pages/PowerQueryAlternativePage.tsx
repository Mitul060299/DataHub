import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

const COMPARE_ROWS = [
  { feature: "Where it runs", them: "Inside Excel or Power BI Desktop only", us: "Browser — any data source, any tool" },
  { feature: "AI assistance", them: "None (manual M code or formula building)", us: "Plain-English AI builds transformations automatically" },
  { feature: "Scheduling", them: "Manual refresh or Power BI Premium required", us: "Built-in cron scheduling from Starter plan" },
  { feature: "Multi-source joins", them: "Limited to sources Excel/Power BI can connect to", us: "CSV, Excel, JSON, Parquet + 9 live databases" },
  { feature: "Pipeline reuse", them: "Query embedded in .xlsx or .pbix file", us: "Standalone reusable pipelines, shareable by link" },
  { feature: "Transparency", them: "M code visible but hard to read", us: "Every step shown as readable SQL before it runs" },
  { feature: "Collaboration", them: "Share the file — everyone needs Excel/Power BI", us: "Team projects, audit logs, role-based access" },
  { feature: "Price", them: "Included with Microsoft 365 / Power BI Pro ($10/user/mo)", us: "Free tier available; paid from $19/month" },
];

const FAQ_ITEMS = [
  {
    q: "What is a Power Query alternative?",
    a: "A Power Query alternative is a data transformation tool that does what Power Query does — cleaning, shaping, and loading data — but outside the constraints of Excel and Power BI. DataHub is a browser-based alternative that uses AI to build transformations in plain English, runs against any data source, and can schedule pipelines automatically without requiring Power BI Premium.",
  },
  {
    q: "Can DataHub replace Power Query for Power BI?",
    a: "Yes. DataHub can clean and transform your data before it enters Power BI, producing clean, analysis-ready tables that Power BI ingests directly. This is often more reliable than Power Query within Power BI because the transformation step is separate, auditable, and rerunnable independently.",
  },
  {
    q: "Is DataHub harder to learn than Power Query?",
    a: "DataHub is significantly easier. Power Query uses a custom functional language called M that requires learning syntax and step logic. DataHub lets you describe transformations in plain English — the AI generates the equivalent SQL, which you review before it runs.",
  },
  {
    q: "Does DataHub support the same connectors as Power Query?",
    a: "DataHub supports CSV, Excel, JSON, Parquet, PostgreSQL, MySQL, MSSQL, Oracle, SQLite, Snowflake, BigQuery, Redshift, and Azure Synapse. Power Query supports a wider range of SaaS connectors through Power BI. If you need SaaS connectors (Salesforce, HubSpot, etc.), export your data as CSV first and upload to DataHub.",
  },
];

export function PowerQueryAlternativePage() {
  useSEO({
    title: "Best Power Query Alternative in 2026 | AI Data Transformation Beyond Excel",
    description:
      "DataHub is the best Power Query alternative: AI-powered data transformation that works outside Excel and Power BI, with automatic scheduling and reusable pipelines. No M code required.",
    canonical: "https://datahub.org.in/power-query-alternative",
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
          { "@type": "ListItem", position: 2, name: "Power Query Alternative", item: "https://datahub.org.in/power-query-alternative" },
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
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6AF0", marginBottom: 16 }}>Power Query Alternative</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", color: "#fff", margin: "0 0 20px" }}>
            The Best Power Query Alternative in 2026
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 32px", maxWidth: 620 }}>
            Power Query is powerful inside Excel and Power BI — but it can't schedule itself, requires M code for anything non-trivial, and can't run outside the Microsoft ecosystem. DataHub is the AI-powered alternative that works anywhere, schedules automatically, and requires no code at all.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Try free →</Link>
            <Link to="/pricing" style={{ background: "transparent", color: "#94a3b8", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #2a3050" }}>See pricing</Link>
          </div>
        </header>

        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 32px", letterSpacing: "-0.3px" }}>Where Power Query falls short</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
            {[
              { label: "Locked inside Microsoft", detail: "Power Query only works in Excel and Power BI — you can't run it independently or pipe data elsewhere easily" },
              { label: "No scheduling without Power BI Premium", detail: "Auto-refresh in Power BI requires a Premium licence ($20+/user/month on top of Power BI Pro)" },
              { label: "M code complexity", detail: "Anything beyond basic clicks requires M syntax — a functional language most analysts never fully learn" },
              { label: "No audit trail", detail: "No step-level logging, no approval gate before transformations run on live data" },
            ].map((item) => (
              <div key={item.label} style={{ background: "#131520", border: "1px solid #1e2235", borderRadius: 10, padding: "20px 22px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#5B6AF0", marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#94a3b8" }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 24px", letterSpacing: "-0.3px" }}>DataHub vs Power Query</h2>
          <div style={{ border: "1px solid #1e2235", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#131520" }}>
                <tr>
                  {["Feature", "Power Query", "DataHub"].map((h) => (
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
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Go beyond Power Query</h2>
            <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 28px" }}>Free plan available. No credit card required. No M code to learn.</p>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "14px 36px", borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
