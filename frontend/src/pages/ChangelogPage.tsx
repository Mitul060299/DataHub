import { Link } from "react-router-dom";

interface ChangelogEntry {
  date: string;
  title: string;
  tag: "feature" | "fix" | "perf" | "security" | "cleanup";
  bullets: string[];
}

const ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-05-30",
    title: "Beta banner, pie chart fix, LLM retry, paste CSV",
    tag: "feature",
    bullets: [
      "Added a dismissible beta banner across all pages with links to Terms and Privacy.",
      "Fixed pie charts not showing values or labels when column names differed from SQL aliases.",
      "Added automatic retry logic (up to 3×, exponential backoff) for LLM calls on rate-limit or server errors.",
      "New 'Paste CSV' tab in the Import modal — paste raw CSV text directly without a file.",
      "Pipeline failure emails now correctly sent when a pipeline step throws an exception.",
    ],
  },
  {
    date: "2026-05-11",
    title: "DirectQuery (Live Connect) mode for database connectors",
    tag: "feature",
    bullets: [
      "Database connectors now support DirectQuery mode: queries always run against the live source.",
      "Import modal shows Power BI-style Import vs DirectQuery selector before table browsing.",
      "Datasets in DirectQuery mode appear with a green ⚡ LIVE badge in the Explorer.",
      "Pipeline steps are automatically pushed back to the source database when possible.",
    ],
  },
  {
    date: "2026-05-11",
    title: "DuckDB session replay fix",
    tag: "fix",
    bullets: [
      "Fixed 'Catalog Error: Table does not exist' after a page refresh when datasets used JSONB storage.",
      "AI agent now correctly re-registers JSONB-backed datasets in DuckDB sessions on replay.",
    ],
  },
  {
    date: "2026-05-10",
    title: "SEO blog — 10 long-form articles",
    tag: "feature",
    bullets: [
      "Launched /blog with 10 articles on data cleaning, Alteryx alternatives, Excel workflows, and more.",
      "Each article includes a comparison table, FAQ, and mid-article CTA.",
      "Sitemap and robots.txt updated; JSON-LD schema added for Blog and Article pages.",
    ],
  },
  {
    date: "2026-05-04",
    title: "Pipeline refresh crash fix",
    tag: "fix",
    bullets: [
      "Fixed a bug where replaying a pipeline after refresh created extra persisted datasets named 'X (transformed)'.",
      "Replay is now session-only: rebuilds in-memory DuckDB views without touching stored datasets.",
    ],
  },
  {
    date: "2026-04-28",
    title: "LLM model router (cost optimisation)",
    tag: "perf",
    bullets: [
      "Added an opt-in model router that sends classify/converse calls to a fast 8B model.",
      "Complex planning and code-gen calls continue to use the full 70B model.",
      "Enable with LLM_ROUTER_ENABLED=true in your environment.",
    ],
  },
  {
    date: "2026-04-20",
    title: "Power Query M-code import",
    tag: "feature",
    bullets: [
      "Import Power BI / Excel Power Query M scripts and replay them as DataHub pipeline steps.",
      "Supports most common transformation operations: filter, rename, type conversion, merge.",
    ],
  },
  {
    date: "2026-04-15",
    title: "Cross-pipeline step inputs",
    tag: "feature",
    bullets: [
      "Pipeline steps can now reference output tables from other pipelines via the ⊕ Cross input button.",
      "Useful for joining a cleaned dataset from pipeline A into pipeline B without re-uploading.",
    ],
  },
  {
    date: "2026-04-10",
    title: "Razorpay + Dodo Payments billing",
    tag: "feature",
    bullets: [
      "Billing enabled for Indian users via Razorpay and international users via Dodo Payments.",
      "Starter, Professional, and Team plans available. Beta users retain unlimited access.",
    ],
  },
  {
    date: "2026-04-05",
    title: "Beta launch",
    tag: "feature",
    bullets: [
      "DataHub is publicly available. All new users start on the Beta plan with generous limits.",
      "AI agent supports natural-language data cleaning, transformation, SQL generation, and visualisation.",
      "Replayable, exportable pipelines; ECharts-powered dashboards; S3/R2 cloud storage.",
    ],
  },
];

const TAG_COLORS: Record<ChangelogEntry["tag"], { bg: string; color: string; label: string }> = {
  feature: { bg: "rgba(91,106,240,0.12)", color: "#5B6AF0", label: "New" },
  fix:     { bg: "rgba(248,113,113,0.12)", color: "#f87171", label: "Fix" },
  perf:    { bg: "rgba(52,211,153,0.12)", color: "#34d399", label: "Perf" },
  security:{ bg: "rgba(251,191,36,0.12)", color: "#fbbf24", label: "Security" },
  cleanup: { bg: "rgba(156,163,175,0.12)", color: "#9ca3af", label: "Cleanup" },
};

export function ChangelogPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg0, #0d0d0d)", color: "var(--tx0, #f4f4f5)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px 80px" }}>
        <Link to="/home" style={{ fontSize: 12, color: "var(--tx2, #888)", textDecoration: "none", display: "inline-block", marginBottom: 32 }}>
          ← Back to datahub.org.in
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Changelog</h1>
        <p style={{ color: "var(--tx1, #a1a1aa)", fontSize: 15, marginBottom: 48 }}>
          What's new in DataHub — features, fixes, and improvements.
        </p>

        <div style={{ position: "relative" }}>
          {/* Vertical timeline line */}
          <div style={{ position: "absolute", left: 7, top: 8, bottom: 0, width: 2, background: "var(--bd, #27272a)" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            {ENTRIES.map((entry, i) => {
              const tag = TAG_COLORS[entry.tag];
              return (
                <div key={i} style={{ display: "flex", gap: 24 }}>
                  {/* Timeline dot */}
                  <div style={{ flexShrink: 0, width: 16, paddingTop: 4 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: tag.color, border: "2px solid var(--bg0, #0d0d0d)", boxShadow: `0 0 0 1px ${tag.color}` }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--tx2, #888)", fontVariantNumeric: "tabular-nums" }}>{entry.date}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: tag.bg, color: tag.color }}>
                        {tag.label}
                      </span>
                    </div>
                    <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, color: "var(--tx0, #f4f4f5)", lineHeight: 1.35 }}>
                      {entry.title}
                    </h2>
                    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                      {entry.bullets.map((b, j) => (
                        <li key={j} style={{ fontSize: 14, color: "var(--tx1, #a1a1aa)", lineHeight: 1.6 }}>{b}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
