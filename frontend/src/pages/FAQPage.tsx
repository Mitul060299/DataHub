import { useState } from "react";
import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

/* ── Types ── */
interface FAQItem {
  q: string;
  a: string;
}

interface FAQSection {
  title: string;
  items: FAQItem[];
}

/* ── Content ── */
const FAQ_SECTIONS: FAQSection[] = [
  {
    title: "What is DataHub?",
    items: [
      {
        q: "What is DataHub?",
        a: "DataHub is your reliable AI agent for data work. You upload CSV, Excel, or JSON files, or connect databases like PostgreSQL and Snowflake, then describe what you need in plain English. DataHub generates a step-by-step SQL plan you review and approve before anything runs — and you can save the whole flow as a visual, reusable pipeline that runs itself on a schedule.",
      },
      {
        q: "Who is DataHub for?",
        a: "DataHub is built for business analysts, freelance consultants, small data teams, and managers who need to clean, transform, and analyse data regularly — without writing code or SQL. It is particularly useful for anyone spending hours on repetitive spreadsheet work or who has outgrown Excel but does not need a full enterprise ETL platform.",
      },
      {
        q: "Is DataHub a no-code tool?",
        a: "Yes. You describe what you want in plain English and DataHub generates the SQL transformations automatically. You can also edit any generated SQL directly if you prefer fine-grained control. No coding is required to get started.",
      },
      {
        q: "How is DataHub different from Excel or Power BI?",
        a: "Excel requires manual work for every transformation — formulas, VBA, or Power Query — and does not scale. Power BI is a visualisation tool, not a data cleaning or transformation tool. DataHub is the AI agent that handles the work before Excel or Power BI: cleaning, joining, and transforming data in plain English, with every step saved as a replayable visual pipeline you can schedule, share, and audit.",
      },
      {
        q: "How is DataHub different from Alteryx?",
        a: "Alteryx Designer costs approximately $5,195 per seat per year. DataHub Team plan at $179/month for 3 seats works out to roughly $716 per seat per year — about 86% cheaper — while covering the same data blending, transformation, and automation workflows. DataHub also runs entirely in the browser with no local installation required.",
      },
    ],
  },
  {
    title: "How it works",
    items: [
      {
        q: "What file types does DataHub support?",
        a: "DataHub supports CSV (with automatic delimiter detection), Excel (.xlsx and .xls, including multi-sheet workbooks), JSON, and Parquet file uploads. It also connects directly to PostgreSQL, MySQL, MSSQL, Oracle, SQLite, Snowflake, BigQuery, Redshift, and Azure Synapse.",
      },
      {
        q: "What is a pipeline in DataHub?",
        a: "A pipeline is a saved sequence of data transformation steps. Each step is a named SQL operation — for example, 'Remove duplicate customer IDs' or 'Standardise date formats to ISO 8601'. Pipelines are replayable, meaning you can re-run the exact same transformations on a new dataset, schedule them to run automatically, and share them with your team.",
      },
      {
        q: "Can I see the SQL that DataHub generates?",
        a: "Yes — always. Every transformation DataHub suggests is shown as readable SQL before it executes. You can review it, edit it inline, approve it, or reject it. This is a core design principle: nothing runs on your data without your explicit go-ahead.",
      },
      {
        q: "What are the 30+ transformation operations DataHub supports?",
        a: "DataHub supports operations including: deduplication (exact and fuzzy), type inference and casting, null/empty handling, outlier detection, encoding repair (UTF-8, Latin-1, etc.), column renaming and standardisation, date format normalisation, string trimming and casing, join and merge, pivot and unpivot, filter, sort, aggregate (GROUP BY), column split and combine, regex extraction, conditional columns, schema comparison, and more.",
      },
      {
        q: "Can I connect DataHub to my PostgreSQL or Snowflake database?",
        a: "Yes. PostgreSQL, MySQL, MSSQL, Oracle, and SQLite are available on the Professional plan and above. Snowflake, BigQuery, Redshift, and Azure Synapse are available on the Team plan and above. DataHub supports both Import mode (data copied to DataHub's storage) and DirectQuery mode (SQL pushed to your database at run time).",
      },
      {
        q: "Does DataHub handle messy, real-world data?",
        a: "Yes — that is what it was designed for. DataHub automatically detects file delimiters, repairs broken character encodings, handles mixed null formats, detects type mismatches, processes multi-sheet Excel files, and flags outliers. You do not need to pre-clean your data before uploading.",
      },
    ],
  },
  {
    title: "Data & Security",
    items: [
      {
        q: "Is my data safe with DataHub?",
        a: "Your data is stored in encrypted, isolated cloud storage — files are never shared between accounts or workspaces. DataHub uses AES-256 encryption at rest and TLS in transit. JWT-based authentication with RBAC ensures that only authorised users can access your data.",
      },
      {
        q: "Does DataHub use my data to train AI models?",
        a: "No. DataHub never uses your data to train AI models. Your files and database connections are used solely to execute the transformations you request. The AI model receives only the query structure and column names — not your actual row data — when generating SQL plans.",
      },
      {
        q: "Where is my data stored?",
        a: "Uploaded files and processed datasets are stored in AWS S3 in the Mumbai (ap-south-1) region by default, ensuring data residency in India. Metadata and user accounts are managed via Supabase (PostgreSQL). Enterprise customers can request custom data residency configurations.",
      },
      {
        q: "Does DataHub maintain an audit log?",
        a: "Yes. Every data access, transformation, pipeline run, and export is recorded in a tamper-evident audit log. You can filter and export the full log from your Settings page. This supports compliance requirements including GDPR, SOC 2, and internal data governance policies.",
      },
    ],
  },
  {
    title: "Pricing & Plans",
    items: [
      {
        q: "Is there a free plan?",
        a: "Yes. The Free plan costs ₹0/month with no credit card required. It includes 50 AI messages per month, 10 pipeline runs per month, and 500 MB of storage — enough to try DataHub with real data before committing to a paid plan.",
      },
      {
        q: "What are the paid plan prices?",
        a: "Paid plans start at ₹999/month (Starter, 1 seat), ₹3,999/month (Professional, 1 seat with database connectors), ₹8,999/month (Team, 3 seats), ₹17,999/month (Business, 5 seats), and Enterprise (custom pricing, 5+ seats). All prices are also available in USD: $19, $79, $179, $349, and custom. A 15-day free trial is available on all paid plans.",
      },
      {
        q: "What happens if I exceed my plan limits?",
        a: "AI message overages are charged per message beyond your plan's monthly allocation: $0.02/message on Team, $0.015/message on Business, and $0.01/message on Enterprise. Storage overages are charged at $0.05/GB/month. Usage and overage charges are shown in real time in your Settings > Usage page.",
      },
      {
        q: "Can I add extra seats to my plan?",
        a: "Yes. On Team, Business, and Enterprise plans, additional seats beyond the included allocation can be added. Extra seat pricing is prorated to your current billing cycle and shown at checkout.",
      },
      {
        q: "Do you offer a discount for small teams or early-stage startups?",
        a: "Yes — contact us with details about your team. We offer startup discounts for early-stage companies and non-profit discounts for qualifying organisations.",
      },
    ],
  },
];

/* ── JSON-LD ── */
const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  ),
};

/* ── Accordion item ── */
function AccordionItem({ q, a }: FAQItem) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        borderBottom: "1px solid #1e2235",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "20px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          textAlign: "left",
          color: "#e2e8f0",
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.4,
            letterSpacing: "-0.1px",
          }}
        >
          {q}
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 20,
            color: "#5B6AF0",
            lineHeight: 1,
            marginTop: 2,
            transition: "transform 0.2s",
            transform: open ? "rotate(45deg)" : "none",
          }}
        >
          +
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "0 0 20px",
            fontSize: 15,
            color: "#94a3b8",
            lineHeight: 1.7,
          }}
        >
          {a}
        </div>
      )}
    </div>
  );
}

/* ── Page ── */
export function FAQPage() {
  useSEO({
    title: "DataHub FAQ – AI Agent for Data Work | Common Questions Answered",
    description:
      "Answers to common questions about DataHub: how the AI agent works, what visual pipelines do, data security, pricing, and how it compares to Excel, Power BI, and Alteryx.",
    canonical: "https://datahub.org.in/faq",
    structuredData: FAQ_LD,
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d0f1a",
        color: "#e2e8f0",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          borderBottom: "1px solid #1e2235",
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: "#0d0f1a",
          zIndex: 100,
        }}
      >
        <Link
          to="/"
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: 18,
            textDecoration: "none",
            letterSpacing: "-0.3px",
          }}
        >
          DataHub
        </Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link to="/pricing" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>
            Pricing
          </Link>
          <Link to="/docs" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>
            Docs
          </Link>
          <Link
            to="/signup"
            style={{
              background: "#5B6AF0",
              color: "#fff",
              padding: "7px 18px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* Header */}
      <header
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "64px 24px 40px",
          textAlign: "center",
        }}
      >
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
          <Link to="/" style={{ color: "#64748b", textDecoration: "none" }}>
            Home
          </Link>
          <span style={{ margin: "0 8px" }}>›</span>
          <span style={{ color: "#94a3b8" }}>FAQ</span>
        </div>

        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 44px)",
            fontWeight: 800,
            letterSpacing: "-0.5px",
            lineHeight: 1.15,
            color: "#fff",
            margin: "0 0 16px",
          }}
        >
          Frequently Asked Questions
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "#94a3b8",
            lineHeight: 1.6,
            maxWidth: 560,
            margin: "0 auto 0",
          }}
        >
          Everything you need to know about DataHub — what it does, how it keeps your data safe,
          and how it compares to the tools you already use.
        </p>
      </header>

      {/* Sections */}
      <main
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "0 24px 80px",
        }}
      >
        {FAQ_SECTIONS.map((section) => (
          <section key={section.title} style={{ marginBottom: 48 }}>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#5B6AF0",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: "0 0 4px",
              }}
            >
              {section.title}
            </h2>
            <div>
              {section.items.map((item) => (
                <AccordionItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </section>
        ))}

        {/* CTA */}
        <div
          style={{
            marginTop: 40,
            padding: "32px",
            background: "rgba(91,106,240,0.08)",
            border: "1px solid rgba(91,106,240,0.2)",
            borderRadius: 16,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 16, color: "#e2e8f0", margin: "0 0 8px", fontWeight: 600 }}>
            Still have questions?
          </p>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 20px" }}>
            Email us at{" "}
            <a
              href="mailto:mitul.srivastava000@gmail.com"
              style={{ color: "#5B6AF0", textDecoration: "none" }}
            >
              mitul.srivastava000@gmail.com
            </a>{" "}
            — we usually respond within one business day.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              to="/signup"
              style={{
                background: "#5B6AF0",
                color: "#fff",
                padding: "10px 24px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Start for free
            </Link>
            <Link
              to="/docs"
              style={{
                background: "transparent",
                color: "#94a3b8",
                padding: "10px 24px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                border: "1px solid #2a2d3e",
              }}
            >
              Read the docs
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #1e2235",
          padding: "24px",
          textAlign: "center",
          fontSize: 13,
          color: "#3a4060",
        }}
      >
        <p style={{ margin: 0 }}>
          © {new Date().getFullYear()} DataHub.{" "}
          <Link to="/privacy" style={{ color: "#3a4060", textDecoration: "none" }}>
            Privacy
          </Link>{" "}
          ·{" "}
          <Link to="/terms" style={{ color: "#3a4060", textDecoration: "none" }}>
            Terms
          </Link>
        </p>
      </footer>
    </div>
  );
}
