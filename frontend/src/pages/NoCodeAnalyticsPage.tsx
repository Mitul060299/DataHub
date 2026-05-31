import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

const FAQ_ITEMS = [
  {
    q: "What is no-code data analytics?",
    a: "No-code data analytics means analysing and transforming data without writing SQL, Python, R, or any other code. Instead of learning a programming language, you describe what you want in plain English and the tool generates the operations automatically. No-code analytics tools are designed for business users — analysts, accountants, consultants, and managers — rather than data engineers.",
  },
  {
    q: "Is no-code data analytics reliable enough for professional work?",
    a: "Yes, if the tool is built correctly. DataHub runs real, deterministic SQL on your actual data — the AI generates the query, but the result comes from your data, not from AI estimation or inference. Every step is shown to you as readable SQL before it runs. You approve it or reject it. This makes it auditable, reliable, and repeatable.",
  },
  {
    q: "What can I do with a no-code data analytics tool?",
    a: "With DataHub you can: clean and prepare messy CSV and Excel files, merge data from multiple sources, remove duplicates, standardise formats, aggregate and summarise data, prepare data for Power BI or Tableau, build reusable pipelines that run on a schedule, and share results as dashboards or exports — all without writing a single line of code.",
  },
  {
    q: "Who uses no-code data analytics tools?",
    a: "Business analysts, finance and accounting professionals, consultants, operations managers, marketing analysts, and anyone who works with data regularly but doesn't have a programming background. No-code analytics tools fill the gap between Excel (limited, manual) and Python/SQL (powerful but requires technical skills).",
  },
  {
    q: "Is DataHub free to use?",
    a: "DataHub has a free plan that includes 50 AI messages per month, 10 pipeline runs, and 500 MB of storage — no credit card required. Paid plans start at $19/month with a 15-day free trial.",
  },
];

export function NoCodeAnalyticsPage() {
  useSEO({
    title: "No-Code Data Analytics Tool | Analyse & Transform Data Without Writing Code",
    description:
      "DataHub is the best no-code data analytics tool for analysts. Clean, transform, and analyse data using plain English — no SQL, no Python required. Free plan available.",
    canonical: "https://datahub.org.in/no-code-analytics",
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
          { "@type": "ListItem", position: 2, name: "No-Code Analytics", item: "https://datahub.org.in/no-code-analytics" },
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
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6AF0", marginBottom: 16 }}>No-Code Data Analytics</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", color: "#fff", margin: "0 0 20px" }}>
            No-Code Data Analytics: Analyse and Transform Data Without Writing Code
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 24px", maxWidth: 640 }}>
            DataHub is a no-code data analytics tool that turns plain-English descriptions into SQL-powered data operations. No Python, no formulas, no drag-and-drop node graphs. Just describe what you need and DataHub builds it.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 32px", maxWidth: 640 }}>
            Every operation is transparent — you see the SQL, approve it, and it runs. Nothing happens without your go-ahead.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Start free — no code needed →</Link>
            <Link to="/pricing" style={{ background: "transparent", color: "#94a3b8", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #2a3050" }}>See pricing</Link>
          </div>
        </header>

        {/* Who it's for */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 32px", letterSpacing: "-0.3px" }}>Who no-code analytics is built for</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
            {[
              { label: "Business analysts", detail: "Spend less time on data prep. Describe transformations in plain English and get to the analysis faster." },
              { label: "Finance & accounting", detail: "Clean accounting exports, reconcile datasets, automate monthly reports — without VBA or Power Query." },
              { label: "Consultants", detail: "Handle client data files quickly without depending on a data engineer. Export clean results in minutes." },
              { label: "Operations teams", detail: "Merge exports from multiple systems, clean operational data, and schedule regular reporting automatically." },
            ].map((item) => (
              <div key={item.label} style={{ background: "#131520", border: "1px solid #1e2235", borderRadius: 10, padding: "20px 22px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#94a3b8" }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </section>

        {/* What you can do */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 20px", letterSpacing: "-0.3px" }}>What you can do without writing code</h2>
          <ul style={{ paddingLeft: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, margin: 0 }}>
            {[
              "Clean messy Excel and CSV files in minutes",
              "Remove exact and near-duplicate rows",
              "Merge data from multiple files or databases",
              "Standardise column names automatically",
              "Fix broken date formats and data types",
              "Prepare data for Power BI or Tableau dashboards",
              "Build automated weekly or monthly data pipelines",
              "Share results as dashboards or clean file exports",
              "Detect outliers and data quality issues",
              "Reconcile two datasets with a difference report",
            ].map((item) => (
              <li key={item} style={{ fontSize: 14, lineHeight: 1.5, color: "#c4cfe4", display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ color: "#34d399", flexShrink: 0, marginTop: 2 }}>✓</span>{item}
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

        <section style={{ padding: "56px 0 0" }}>
          <div style={{ background: "#131a3e", border: "1px solid #2a3a80", borderRadius: 14, padding: "40px 36px", textAlign: "center" }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Analyse your data without writing code</h2>
            <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 28px" }}>Free plan available. No SQL, no Python, no credit card required.</p>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "14px 36px", borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
