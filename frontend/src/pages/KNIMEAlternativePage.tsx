import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

const COMPARE_ROWS = [
  { feature: "Setup", them: "Download & install KNIME Analytics Platform (500 MB+)", us: "Runs in the browser — zero install" },
  { feature: "Learning curve", them: "Days to weeks — Weka nodes, Python integration, custom logic", us: "Plain English — working in under a minute" },
  { feature: "AI assistance", them: "None built-in (third-party extensions available)", us: "Built-in AI for every transformation step" },
  { feature: "Price", them: "Free open-source; KNIME Server starts at ~$30k/year", us: "Free tier; paid from $19/month" },
  { feature: "Scheduling", them: "Requires KNIME Server", us: "Built-in cron scheduling from Starter plan" },
  { feature: "Transparency", them: "Node properties visible; SQL not always shown", us: "Every step shown as readable SQL you approve" },
  { feature: "Collaboration", them: "File-based sharing; KNIME Hub for teams", us: "Team projects with shared access and audit logs" },
  { feature: "Target user", them: "Data scientists and engineers", us: "Analysts, accountants, consultants" },
];

const FAQ_ITEMS = [
  {
    q: "Who is KNIME designed for — and why analysts often struggle with it?",
    a: "KNIME Analytics Platform was designed for data scientists who need a visual interface for building machine learning and statistical workflows. It's very powerful but comes with a steep learning curve: you need to understand node types, data types, port compatibility, and often Python or R integration for advanced tasks. Most business analysts find it overkill and hard to get started with quickly.",
  },
  {
    q: "Is DataHub as powerful as KNIME for data transformation?",
    a: "For analyst-grade data transformation — cleaning, joining, deduplication, aggregation, scheduling — DataHub covers everything KNIME's core Transform nodes do, and does it faster with AI. For advanced ML workflows, statistical modelling, or deep Python/R integration, KNIME is more appropriate.",
  },
  {
    q: "Does DataHub require any installation?",
    a: "No. DataHub runs entirely in the browser. You sign up, upload your data or connect a database, and start working in under a minute. No installer, no Java runtime, no IT approval required.",
  },
  {
    q: "Can I export DataHub results to the same formats as KNIME?",
    a: "Yes. DataHub exports to CSV, Excel, Parquet, and JSON. It also pushes results to connected databases (PostgreSQL, MySQL, Snowflake, BigQuery, etc.) and publishes shareable dashboards directly.",
  },
];

export function KNIMEAlternativePage() {
  useSEO({
    title: "Best KNIME Alternative for Analysts in 2026 | No Setup, AI-Powered",
    description:
      "DataHub is the best KNIME alternative for analysts: AI-powered data transformation in the browser with zero setup, automatic scheduling, and no data science degree required.",
    canonical: "https://datahub.org.in/knime-alternative",
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
          { "@type": "ListItem", position: 2, name: "KNIME Alternative", item: "https://datahub.org.in/knime-alternative" },
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
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6AF0", marginBottom: 16 }}>KNIME Alternative</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", color: "#fff", margin: "0 0 20px" }}>
            The Best KNIME Alternative for Analysts in 2026
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 32px", maxWidth: 620 }}>
            KNIME is a powerful open-source data science platform — but it's built for engineers and data scientists, not business analysts. DataHub gives you the same data transformation capabilities in a browser, with AI assistance and no setup required.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Try free →</Link>
            <Link to="/pricing" style={{ background: "transparent", color: "#94a3b8", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #2a3050" }}>See pricing</Link>
          </div>
        </header>

        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 24px", letterSpacing: "-0.3px" }}>DataHub vs KNIME</h2>
          <div style={{ border: "1px solid #1e2235", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#131520" }}>
                <tr>
                  {["Feature", "KNIME", "DataHub"].map((h) => (
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
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Try the analyst-friendly alternative to KNIME</h2>
            <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 28px" }}>Free plan available. Works in the browser. No Java, no install, no learning curve.</p>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "14px 36px", borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
