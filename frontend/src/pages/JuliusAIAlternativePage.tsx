import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

const COMPARE_ROWS = [
  { feature: "Reusable pipelines", them: "Not available — each conversation is one-off", us: "Save any workflow as a reusable scheduled pipeline" },
  { feature: "Scheduling", them: "Not available", us: "Built-in cron scheduling from Starter plan" },
  { feature: "Data sources", them: "File upload; limited database connections", us: "CSV, Excel, JSON, Parquet + 9 live databases" },
  { feature: "Transparency", them: "AI generates code snippets; not always auditable", us: "Every step shown as readable SQL you approve" },
  { feature: "Collaboration", them: "Individual accounts; no shared project space", us: "Team projects with shared access and audit logs" },
  { feature: "Data volume", them: "Limited by chat context and memory", us: "Handles large files and database queries natively" },
  { feature: "Audit trail", them: "Chat history only", us: "Step-level audit log with approvals and timestamps" },
  { feature: "Price", them: "Subscription required for data work features", us: "Free tier; paid from $19/month" },
];

const FAQ_ITEMS = [
  {
    q: "What is Julius AI and what are its limitations?",
    a: "Julius AI is a chat-based AI tool for data analysis — you upload a CSV and ask questions about it in natural language. It's good for one-off exploratory analysis and generating charts quickly. Its main limitations are that conversations are ephemeral (no reusable pipelines), it doesn't schedule or automate workflows, has limited multi-source support, and doesn't give you auditable SQL you can review and approve.",
  },
  {
    q: "What does DataHub do that Julius AI doesn't?",
    a: "DataHub lets you save any data transformation sequence as a reusable pipeline and schedule it to run automatically on new data. Julius AI doesn't have this capability. DataHub also gives you full SQL transparency for every step, supports multi-source joins across databases, and maintains an audit log of all operations.",
  },
  {
    q: "Is DataHub still as easy to use as Julius AI?",
    a: "Yes. DataHub uses the same plain-English interface for data work — you describe what you want and the AI handles it. The difference is that DataHub also saves your work, audits it, and automates it, rather than treating each interaction as a disposable chat.",
  },
  {
    q: "Can DataHub do the same analysis and charting as Julius AI?",
    a: "Yes. DataHub supports natural-language queries for data analysis, and includes a built-in dashboard layer for charts and tables. Results can be published as shareable dashboards or exported to Power BI, Tableau, or Google Sheets.",
  },
];

export function JuliusAIAlternativePage() {
  useSEO({
    title: "Best Julius AI Alternative in 2026 | Reusable Pipelines, Not Just Chat",
    description:
      "DataHub is the best Julius AI alternative: AI-powered data analysis with reusable scheduled pipelines, SQL transparency, and multi-source joins — not just one-off chat sessions.",
    canonical: "https://datahub.org.in/julius-ai-alternative",
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
          { "@type": "ListItem", position: 2, name: "Julius AI Alternative", item: "https://datahub.org.in/julius-ai-alternative" },
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
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6AF0", marginBottom: 16 }}>Julius AI Alternative</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", color: "#fff", margin: "0 0 20px" }}>
            The Best Julius AI Alternative: Reusable Pipelines, Not Just Chat
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 32px", maxWidth: 620 }}>
            Julius AI is great for one-off data analysis conversations. But if you need to run the same transformations every week on new data, save your work as a pipeline, and schedule it to run automatically — DataHub is the better tool.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Try free →</Link>
            <Link to="/pricing" style={{ background: "transparent", color: "#94a3b8", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #2a3050" }}>See pricing</Link>
          </div>
        </header>

        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 32px", letterSpacing: "-0.3px" }}>Why chat-only AI tools aren't enough for recurring data work</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
            {[
              { label: "No memory between sessions", detail: "Chat AI tools start fresh each time. DataHub saves every workflow and replays it on new data." },
              { label: "No automation", detail: "Julius AI requires manual re-runs. DataHub schedules your pipeline to run automatically." },
              { label: "No audit trail", detail: "Chat history isn't an audit log. DataHub records every step with timestamps and approvals." },
              { label: "No team sharing", detail: "Chat sessions are private. DataHub pipelines are shared across your team." },
            ].map((item) => (
              <div key={item.label} style={{ background: "#131520", border: "1px solid #1e2235", borderRadius: 10, padding: "20px 22px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#5B6AF0", marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#94a3b8" }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 24px", letterSpacing: "-0.3px" }}>DataHub vs Julius AI</h2>
          <div style={{ border: "1px solid #1e2235", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#131520" }}>
                <tr>
                  {["Feature", "Julius AI", "DataHub"].map((h) => (
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
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Turn one-off analysis into repeatable automation</h2>
            <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 28px" }}>Free plan available. Build your first pipeline in minutes.</p>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "14px 36px", borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
