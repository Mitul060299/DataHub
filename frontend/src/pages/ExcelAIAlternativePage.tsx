import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

const COMPARE_ROWS = [
  { feature: "Where it runs", them: "Inside Microsoft Excel only", us: "Browser — works with any file or database" },
  { feature: "Data sources", them: "Excel workbooks and connected data models", us: "CSV, Excel, JSON, Parquet + 9 live databases" },
  { feature: "Reusable pipelines", them: "Not available — each session is one-off", us: "Save as reusable pipeline, schedule weekly/monthly" },
  { feature: "Transparency", them: "AI suggests edits; underlying changes not always auditable", us: "Every step shown as readable SQL you approve" },
  { feature: "Scheduling", them: "Not available", us: "Built-in cron scheduling from Starter plan" },
  { feature: "Multi-file merge", them: "Manual — each file opened separately", us: "Merge any number of files in one operation" },
  { feature: "Data volume", them: "Limited by Excel row limit (1,048,576 rows)", us: "Handles millions of rows across any source" },
  { feature: "Price", them: "Requires Microsoft 365 Copilot ($30/user/mo extra)", us: "Free tier available; paid from $19/month" },
];

const FAQ_ITEMS = [
  {
    q: "What is Copilot for Excel and what are its limitations?",
    a: "Microsoft Copilot for Excel is an AI assistant built into Excel that can suggest formulas, summarise data, and apply simple transformations to your current spreadsheet. Its main limitations are that it only works on data already in Excel, can't schedule or automate workflows, doesn't support reusable pipelines, and requires a Microsoft 365 Copilot subscription ($30/user/month on top of existing M365 costs).",
  },
  {
    q: "Is DataHub a better AI data tool than Copilot for Excel?",
    a: "For data transformation and preparation work, yes. DataHub handles multi-source joins, deduplication, type casting, scheduling, and reusable pipelines — none of which Copilot for Excel supports. If you primarily need help writing Excel formulas or formatting existing spreadsheets, Copilot for Excel is more convenient. For analyst-grade data work, DataHub is significantly more capable.",
  },
  {
    q: "Can DataHub work alongside Excel?",
    a: "Yes. DataHub is designed to work upstream of Excel: you clean and transform your data in DataHub, then export the results as a clean .xlsx file that Excel can open. This means your Excel users get clean, consistent data without needing to understand the transformation logic.",
  },
  {
    q: "Do I need to know SQL to use DataHub?",
    a: "No. DataHub generates SQL automatically from plain-English descriptions. You review the generated SQL and approve it, but you don't need to write any yourself. Analysts with no SQL knowledge use DataHub successfully every day.",
  },
];

export function ExcelAIAlternativePage() {
  useSEO({
    title: "Best Excel AI Alternative in 2026 | Beyond Copilot for Excel",
    description:
      "DataHub is the best Copilot for Excel alternative: AI-powered data transformation with reusable pipelines, multi-source joins, and scheduling — not just one-off spreadsheet suggestions.",
    canonical: "https://datahub.org.in/excel-ai-alternative",
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
          { "@type": "ListItem", position: 2, name: "Excel AI Alternative", item: "https://datahub.org.in/excel-ai-alternative" },
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
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6AF0", marginBottom: 16 }}>Excel AI Alternative / Copilot for Excel Alternative</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", color: "#fff", margin: "0 0 20px" }}>
            The Best Excel AI Alternative in 2026
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 32px", maxWidth: 620 }}>
            Microsoft Copilot for Excel gives you AI inside one spreadsheet. DataHub gives you AI-powered transformation across any data source — with reusable pipelines that run themselves every week. No $30/month Copilot licence required.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Try free →</Link>
            <Link to="/pricing" style={{ background: "transparent", color: "#94a3b8", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #2a3050" }}>See pricing</Link>
          </div>
        </header>

        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 32px", letterSpacing: "-0.3px" }}>What Copilot for Excel can't do</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
            {[
              { label: "No reusable pipelines", detail: "Every Copilot session is one-off. You can't save your steps as a workflow and replay them on next month's data." },
              { label: "No scheduling", detail: "Copilot for Excel has no automation. You manually open Excel and run it again each time new data arrives." },
              { label: "Excel-only", detail: "Copilot for Excel only sees what's in your current workbook. It can't join data from a database or merge 20 CSV files." },
              { label: "Extra cost", detail: "Microsoft 365 Copilot adds $30/user/month on top of your existing M365 subscription." },
            ].map((item) => (
              <div key={item.label} style={{ background: "#131520", border: "1px solid #1e2235", borderRadius: 10, padding: "20px 22px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#5B6AF0", marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#94a3b8" }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 24px", letterSpacing: "-0.3px" }}>DataHub vs Copilot for Excel</h2>
          <div style={{ border: "1px solid #1e2235", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#131520" }}>
                <tr>
                  {["Feature", "Copilot for Excel", "DataHub"].map((h) => (
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
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Go beyond Excel AI</h2>
            <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 28px" }}>Free plan available. No credit card required. No extra Microsoft licence needed.</p>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "14px 36px", borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
