import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

const COMPARE_ROWS = [
  { feature: "Price", them: "Requires Tableau Creator licence (~$840/year)", us: "Free tier; paid from $19/month" },
  { feature: "AI assistance", them: "None — manual drag-and-drop steps", us: "Plain-English AI builds transformations automatically" },
  { feature: "Works outside Tableau", them: "Output designed for Tableau only", us: "Export to CSV, Power BI, Sheets, or any destination" },
  { feature: "Scheduling", them: "Requires Tableau Server or Cloud", us: "Built-in cron scheduling from Starter plan" },
  { feature: "Transparency", them: "Visual steps — no SQL view", us: "Every step shown as readable SQL you approve" },
  { feature: "Data sources", them: "Tableau-supported connectors", us: "CSV, Excel, JSON, Parquet + 9 live databases" },
  { feature: "Learning curve", them: "Tableau-specific concepts and UI", us: "Plain English — working in under a minute" },
  { feature: "Audit logging", them: "Limited", us: "Full step-level audit log on all paid plans" },
];

const FAQ_ITEMS = [
  {
    q: "What is Tableau Prep and what does it do?",
    a: "Tableau Prep is Tableau's data preparation tool — it lets analysts clean and shape data before loading it into Tableau for visualisation. It uses a visual drag-and-drop interface and is tightly integrated with Tableau Desktop and Tableau Server. It requires a Tableau Creator licence (~$840/year) and is primarily designed to feed data into Tableau dashboards.",
  },
  {
    q: "Can I use DataHub if I use Tableau for dashboards?",
    a: "Yes — DataHub can prepare and clean your data, then export it as a clean CSV or push it to a database that Tableau connects to. Using DataHub upstream of Tableau separates your data preparation logic from your visualisation layer, making both easier to maintain and audit.",
  },
  {
    q: "Is DataHub easier to use than Tableau Prep?",
    a: "Most analysts find DataHub significantly easier. Tableau Prep requires learning Tableau-specific concepts and a visual node interface. DataHub lets you describe what you need in plain English. For standard preparation tasks — cleaning, joining, deduplication, type casting — DataHub is faster to set up and more intuitive.",
  },
  {
    q: "Does DataHub replace Tableau Prep for scheduling?",
    a: "Yes. DataHub includes built-in pipeline scheduling from the Starter plan. You can schedule a preparation workflow to run daily, weekly, or monthly on fresh database data — without needing Tableau Server or Tableau Cloud.",
  },
];

export function TableauPrepAlternativePage() {
  useSEO({
    title: "Best Tableau Prep Alternative in 2026 | AI-Powered Data Preparation",
    description:
      "DataHub is the best Tableau Prep alternative: AI-powered data preparation with automatic scheduling, plain-English transformations, and no Tableau licence required.",
    canonical: "https://datahub.org.in/tableau-prep-alternative",
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
          { "@type": "ListItem", position: 2, name: "Tableau Prep Alternative", item: "https://datahub.org.in/tableau-prep-alternative" },
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
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6AF0", marginBottom: 16 }}>Tableau Prep Alternative</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", color: "#fff", margin: "0 0 20px" }}>
            The Best Tableau Prep Alternative in 2026
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 32px", maxWidth: 620 }}>
            Tableau Prep is a good data preparation tool if you're already paying for a Tableau Creator licence. If you're not — or if you need AI, automatic scheduling, or output to destinations other than Tableau — DataHub is the better choice.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Try free →</Link>
            <Link to="/pricing" style={{ background: "transparent", color: "#94a3b8", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #2a3050" }}>See pricing</Link>
          </div>
        </header>

        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 24px", letterSpacing: "-0.3px" }}>DataHub vs Tableau Prep</h2>
          <div style={{ border: "1px solid #1e2235", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#131520" }}>
                <tr>
                  {["Feature", "Tableau Prep", "DataHub"].map((h) => (
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
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Prepare data for any BI tool</h2>
            <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 28px" }}>Free plan available. Works with Tableau, Power BI, Sheets, or any CSV destination.</p>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "14px 36px", borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
