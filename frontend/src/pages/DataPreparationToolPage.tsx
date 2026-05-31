import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

const OPERATIONS = [
  "Remove duplicate rows (exact and fuzzy matching)",
  "Fill or drop null and empty values",
  "Cast column types (string to date, text to number, etc.)",
  "Standardise and rename column headers automatically",
  "Trim whitespace and fix casing inconsistencies",
  "Split or combine columns based on delimiters",
  "Filter rows by condition or regex",
  "Detect and flag outliers",
  "Join tables from different sources on matching keys",
  "Pivot and unpivot tables for analysis",
  "Aggregate data with GROUP BY and window functions",
  "Parse and normalise date formats automatically",
  "Repair broken file encodings (UTF-8, Latin-1, etc.)",
  "Extract values from nested strings with regex",
  "Add calculated or conditional columns",
];

const FAQ_ITEMS = [
  {
    q: "What is a data preparation tool?",
    a: "A data preparation tool helps analysts clean, transform, and structure raw data so it is ready for analysis, reporting, or loading into a BI tool. Common tasks include removing duplicates, fixing data types, standardising column names, handling nulls, merging multiple files, and joining datasets from different sources.",
  },
  {
    q: "What is data wrangling and how does DataHub help?",
    a: "Data wrangling (also called data munging or data preparation) is the process of transforming messy, raw data into a clean, analysis-ready format. DataHub automates data wrangling using AI: you describe what you need in plain English, DataHub generates the SQL transformations, you review them, and they run. Wrangling tasks that took hours in Excel take minutes in DataHub.",
  },
  {
    q: "What is an ETL tool and is DataHub one?",
    a: "ETL stands for Extract, Transform, Load — the process of pulling data from sources, transforming it, and loading it into a destination. DataHub is an AI ETL tool designed for analysts: it extracts from files and databases, transforms using natural-language instructions, and loads results to CSV exports, database destinations, or connected BI tools. It's not a production-grade engineering ETL tool like Airbyte or dbt, but it handles analyst-scale ETL workflows completely.",
  },
  {
    q: "How is DataHub different from Excel for data preparation?",
    a: "Excel requires manual work for every transformation — formulas, VBA, or Power Query — and doesn't scale beyond ~1 million rows. DataHub runs SQL on your full dataset, scales to millions of rows across database sources, saves every step as a reusable pipeline, and can schedule the entire preparation workflow to run automatically on fresh data each week.",
  },
  {
    q: "Can DataHub clean CSV files automatically?",
    a: "Yes. DataHub auto-detects CSV delimiters, fixes broken encodings, handles mixed date formats, standardises column headers, removes duplicates, and fills or drops nulls — all from plain-English commands. You review each operation as SQL before it runs.",
  },
];

export function DataPreparationToolPage() {
  useSEO({
    title: "AI Data Preparation Tool | Data Cleaning, ETL & Wrangling — No Code Required",
    description:
      "DataHub is an AI data preparation tool for analysts. Clean, transform, and wrangle data with plain English — no SQL, no code. The best no-code ETL and data cleaning tool for small teams.",
    canonical: "https://datahub.org.in/data-preparation-tool",
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
          { "@type": "ListItem", position: 2, name: "Data Preparation Tool", item: "https://datahub.org.in/data-preparation-tool" },
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
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6AF0", marginBottom: 16 }}>Data Preparation Tool · Data Cleaning · AI ETL</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", color: "#fff", margin: "0 0 20px" }}>
            AI Data Preparation & ETL Tool — No Code Required
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 24px", maxWidth: 640 }}>
            DataHub is an AI-powered data preparation tool that handles everything between raw messy data and analysis-ready results. Cleaning, transformation, wrangling, and ETL — all via plain-English commands, with every step transparent and auditable.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "#94a3b8", margin: "0 0 32px", maxWidth: 640 }}>
            Supports CSV, Excel, JSON, Parquet, and live database connections. Alteryx alternative at 86% lower cost.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
            <Link to="/pricing" style={{ background: "transparent", color: "#94a3b8", padding: "12px 28px", borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1px solid #2a3050" }}>See pricing</Link>
          </div>
        </header>

        {/* Operations list */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.3px" }}>30+ built-in data preparation operations</h2>
          <p style={{ fontSize: 15, color: "#94a3b8", margin: "0 0 24px" }}>Every operation runs as transparent SQL you review before it executes.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {OPERATIONS.map((op) => (
              <div key={op} style={{ fontSize: 14, lineHeight: 1.5, color: "#c4cfe4", display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ color: "#34d399", flexShrink: 0, marginTop: 2 }}>✓</span>{op}
              </div>
            ))}
          </div>
        </section>

        {/* Supported sources */}
        <section style={{ padding: "48px 0", borderBottom: "1px solid #1e2235" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 20px", letterSpacing: "-0.3px" }}>Supported data sources</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {["CSV (auto-delimiter detection)", "Excel (.xlsx and .xls, multi-sheet)", "JSON", "Parquet", "PostgreSQL", "MySQL / MariaDB", "MSSQL (SQL Server)", "Oracle", "SQLite", "Snowflake", "Google BigQuery", "Amazon Redshift", "Azure Synapse Analytics"].map((src) => (
              <div key={src} style={{ background: "#131520", border: "1px solid #1e2235", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#c4cfe4" }}>{src}</div>
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
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>Start preparing data the faster way</h2>
            <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 28px" }}>Free plan available. No code required. First result in under a minute.</p>
            <Link to="/signup" style={{ background: "#5B6AF0", color: "#fff", padding: "14px 36px", borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Start free →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
