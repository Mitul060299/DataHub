import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { useSEO } from "../hooks/useSEO";
import { capture } from "../lib/posthog";
import "./DemoPage.css";

/**
 * Public demo page (`/try`) — lets visitors interact with a sample dataset
 * and pre-scripted AI insights without signing up. All save / export /
 * connector actions surface a "Sign up free" CTA. Designed as a top-of-funnel
 * conversion lever.
 *
 * Everything is in-memory; no backend calls are made from this page.
 */

type Customer = {
  customer_id: number;
  name: string;
  email: string;
  signup_date: string;
  total_spend: number | null;
  region: "North" | "South" | "East" | "West";
};

// Hardcoded sample so the page renders instantly with no fetch.
const CUSTOMERS: Customer[] = [
  { customer_id: 1001, name: "Alice Johnson", email: "alice@example.com", signup_date: "2024-01-15", total_spend: 1200.5, region: "North" },
  { customer_id: 1002, name: "Bob Smith", email: "bob@example.com", signup_date: "2024-02-18", total_spend: 850.0, region: "West" },
  { customer_id: 1003, name: "Chandra Patel", email: "chandra@example.com", signup_date: "2024-03-05", total_spend: 540.75, region: "South" },
  { customer_id: 1004, name: "Diego Martinez", email: "diego@example.com", signup_date: "2024-03-20", total_spend: 130.25, region: "East" },
  { customer_id: 1005, name: "Elena Wang", email: "elena@example.com", signup_date: "2024-04-10", total_spend: 2450.0, region: "North" },
  { customer_id: 1006, name: "Fatima Noor", email: "fatima@example.com", signup_date: "2024-05-08", total_spend: null, region: "West" },
  { customer_id: 1007, name: "George Adeyemi", email: "george@example.com", signup_date: "2024-05-22", total_spend: 3120.4, region: "East" },
  { customer_id: 1008, name: "Hana Suzuki", email: "hana@example.com", signup_date: "2024-06-01", total_spend: 415.6, region: "South" },
  { customer_id: 1009, name: "Ivan Petrov", email: "ivan@example.com", signup_date: "2024-06-14", total_spend: 1890.0, region: "North" },
  { customer_id: 1010, name: "Jenna Brooks", email: "jenna@example.com", signup_date: "2024-07-02", total_spend: 275.3, region: "West" },
  { customer_id: 1011, name: "Kabir Mehta", email: "kabir@example.com", signup_date: "2024-07-19", total_spend: 4520.75, region: "East" },
  { customer_id: 1012, name: "Lara Costa", email: "lara@example.com", signup_date: "2024-08-04", total_spend: 98.0, region: "South" },
  { customer_id: 1013, name: "Mateo Ruiz", email: "mateo@example.com", signup_date: "2024-08-21", total_spend: 680.2, region: "West" },
  { customer_id: 1014, name: "Nadia Khan", email: "nadia@example.com", signup_date: "2024-09-09", total_spend: 1675.45, region: "North" },
  { customer_id: 1015, name: "Omar Haddad", email: "omar@example.com", signup_date: "2024-09-25", total_spend: 2100.0, region: "East" },
  { customer_id: 1016, name: "Priya Iyer", email: "priya@example.com", signup_date: "2024-10-11", total_spend: 355.8, region: "South" },
  { customer_id: 1017, name: "Quentin Lefevre", email: "quentin@example.com", signup_date: "2024-10-28", total_spend: 920.1, region: "West" },
  { customer_id: 1018, name: "Rina Tanaka", email: "rina@example.com", signup_date: "2024-11-13", total_spend: 3340.5, region: "North" },
  { customer_id: 1019, name: "Sami Al-Rashid", email: "sami@example.com", signup_date: "2024-11-30", total_spend: 210.0, region: "East" },
  { customer_id: 1020, name: "Tara Singh", email: "tara@example.com", signup_date: "2024-12-12", total_spend: 1455.65, region: "South" },
  { customer_id: 1021, name: "Uma Reddy", email: "uma@example.com", signup_date: "2025-01-06", total_spend: 560.4, region: "West" },
  { customer_id: 1022, name: "Viktor Novak", email: "viktor@example.com", signup_date: "2025-01-22", total_spend: 2780.0, region: "North" },
  { customer_id: 1023, name: "Wei Chen", email: "wei@example.com", signup_date: "2025-02-08", total_spend: 310.25, region: "East" },
  { customer_id: 1024, name: "Xochitl Diaz", email: "xochitl@example.com", signup_date: "2025-02-24", total_spend: 1940.9, region: "South" },
  { customer_id: 1025, name: "Yara Hassan", email: "yara@example.com", signup_date: "2025-03-11", total_spend: 75.0, region: "West" },
  { customer_id: 1026, name: "Zane Cooper", email: "zane@example.com", signup_date: "2025-03-27", total_spend: 4015.8, region: "North" },
  { customer_id: 1027, name: "Anika Roy", email: "anika@example.com", signup_date: "2025-04-09", total_spend: 1230.0, region: "East" },
  { customer_id: 1028, name: "Bruno Silva", email: "bruno@example.com", signup_date: "2025-04-22", total_spend: 485.5, region: "South" },
  { customer_id: 1029, name: "Camille Dubois", email: "camille@example.com", signup_date: "2025-05-05", total_spend: 2660.0, region: "West" },
  { customer_id: 1030, name: "Dmitri Volkov", email: "dmitri@example.com", signup_date: "2025-05-19", total_spend: 1110.75, region: "North" },
];

type InsightId = "spend_by_region" | "top_customers" | "monthly_signups";

type Insight = {
  id: InsightId;
  prompt: string;
  reply: string;
  sql: string;
  chartTitle: string;
};

const INSIGHTS: Insight[] = [
  {
    id: "spend_by_region",
    prompt: "Show total spend by region",
    reply:
      "Grouped customers by region and summed total_spend (skipping nulls). North leads with the highest revenue, followed by East. West has the lowest median spend.",
    sql:
      "SELECT region,\n       ROUND(SUM(total_spend), 2) AS total_revenue,\n       COUNT(*)             AS customers\nFROM customers\nWHERE total_spend IS NOT NULL\nGROUP BY region\nORDER BY total_revenue DESC;",
    chartTitle: "Total revenue by region",
  },
  {
    id: "top_customers",
    prompt: "Who are our top 5 customers by spend?",
    reply:
      "Sorted by total_spend descending, ignoring rows where spend is missing. Kabir Mehta is the top spender at ₹4,520.75, followed by Zane Cooper.",
    sql:
      "SELECT name, region, total_spend\nFROM customers\nWHERE total_spend IS NOT NULL\nORDER BY total_spend DESC\nLIMIT 5;",
    chartTitle: "Top 5 customers by total spend",
  },
  {
    id: "monthly_signups",
    prompt: "Plot signups by month",
    reply:
      "Truncated signup_date to month and counted distinct customers. Signups have grown steadily — early-2025 cohorts are about 1.5× the early-2024 cohorts.",
    sql:
      "SELECT DATE_TRUNC('month', signup_date) AS month,\n       COUNT(*)                       AS signups\nFROM customers\nGROUP BY 1\nORDER BY 1;",
    chartTitle: "Customer signups per month",
  },
];

function buildChartOption(insightId: InsightId) {
  if (insightId === "spend_by_region") {
    const grouped = new Map<string, number>();
    for (const c of CUSTOMERS) {
      if (c.total_spend == null) continue;
      grouped.set(c.region, (grouped.get(c.region) ?? 0) + c.total_spend);
    }
    const entries = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 56, right: 24, top: 24, bottom: 36 },
      xAxis: { type: "category", data: entries.map((e) => e[0]), axisLine: { lineStyle: { color: "#475569" } } },
      yAxis: { type: "value", axisLine: { lineStyle: { color: "#475569" } }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } },
      series: [
        {
          name: "Total spend",
          type: "bar",
          data: entries.map((e) => Math.round(e[1] * 100) / 100),
          itemStyle: { color: "#5B6AF0", borderRadius: [4, 4, 0, 0] },
          barWidth: "55%",
        },
      ],
    };
  }
  if (insightId === "top_customers") {
    const sorted = [...CUSTOMERS]
      .filter((c) => c.total_spend != null)
      .sort((a, b) => (b.total_spend! - a.total_spend!))
      .slice(0, 5)
      .reverse();
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 130, right: 24, top: 24, bottom: 36 },
      xAxis: { type: "value", axisLine: { lineStyle: { color: "#475569" } }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } },
      yAxis: { type: "category", data: sorted.map((c) => c.name), axisLine: { lineStyle: { color: "#475569" } } },
      series: [
        {
          name: "Spend",
          type: "bar",
          data: sorted.map((c) => c.total_spend),
          itemStyle: { color: "#7C3AED", borderRadius: [0, 4, 4, 0] },
          barWidth: "55%",
        },
      ],
    };
  }
  // monthly_signups
  const monthly = new Map<string, number>();
  for (const c of CUSTOMERS) {
    const month = c.signup_date.slice(0, 7);
    monthly.set(month, (monthly.get(month) ?? 0) + 1);
  }
  const months = Array.from(monthly.entries()).sort();
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 48, right: 24, top: 24, bottom: 56 },
    xAxis: {
      type: "category",
      data: months.map((m) => m[0]),
      axisLine: { lineStyle: { color: "#475569" } },
      axisLabel: { rotate: 45, fontSize: 11 },
    },
    yAxis: { type: "value", axisLine: { lineStyle: { color: "#475569" } }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } },
    series: [
      {
        name: "Signups",
        type: "line",
        smooth: true,
        showSymbol: true,
        symbolSize: 8,
        data: months.map((m) => m[1]),
        itemStyle: { color: "#22c55e" },
        areaStyle: { color: "rgba(34,197,94,0.18)" },
        lineStyle: { width: 2.5 },
      },
    ],
  };
}

export function DemoPage() {
  const navigate = useNavigate();
  const [selectedInsight, setSelectedInsight] = useState<InsightId>("spend_by_region");
  const [showSignupGate, setShowSignupGate] = useState<null | string>(null);

  useSEO({
    title: "Try datahub.org.in (no signup) — interactive demo",
    description:
      "Play with a real customer dataset, run AI insights, and see charts in seconds. No signup required. See why teams use datahub.org.in for AI-powered SQL pipelines.",
    canonical: "https://datahub.org.in/try",
  });

  useEffect(() => {
    capture("demo_viewed");
  }, []);

  const insight = INSIGHTS.find((i) => i.id === selectedInsight)!;
  const option = useMemo(() => buildChartOption(selectedInsight), [selectedInsight]);

  const handlePickInsight = (id: InsightId) => {
    setSelectedInsight(id);
    capture("demo_insight_selected", { insight: id });
  };

  const handleGated = (action: string) => {
    capture("demo_signup_gate_shown", { action });
    setShowSignupGate(action);
  };

  const handleSignup = (source: string) => {
    capture("demo_signup_clicked", { source });
    navigate("/signup");
  };

  return (
    <div className="demo-shell">
      {/* Top bar */}
      <header className="demo-topbar">
        <Link to="/" className="demo-brand" aria-label="Back to homepage">
          <span className="demo-brand-mark">▣</span>
          <span>datahub.org.in</span>
          <span className="demo-pill">SANDBOX</span>
        </Link>
        <div className="demo-topbar-actions">
          <Link to="/login" className="demo-link">Sign in</Link>
          <button className="demo-btn demo-btn-primary" onClick={() => handleSignup("topbar")}>
            Sign up free
          </button>
        </div>
      </header>

      {/* Sandbox banner */}
      <div className="demo-banner" role="status">
        <span>
          You&apos;re in a <strong>sandbox</strong> — try the product with a sample customer dataset. Nothing you do here is saved.
        </span>
        <button className="demo-banner-cta" onClick={() => handleSignup("banner")}>
          Sign up free to use your own data →
        </button>
      </div>

      {/* Main 3-pane layout */}
      <div className="demo-grid">
        {/* Left pane: dataset */}
        <aside className="demo-pane demo-pane-left">
          <div className="demo-pane-header">
            <h3>Datasets</h3>
            <button
              className="demo-pane-action"
              onClick={() => handleGated("connect_database")}
              title="Connect a database"
            >
              + Connect DB
            </button>
          </div>
          <div className="demo-dataset demo-dataset-active">
            <span className="demo-dataset-icon">📄</span>
            <div className="demo-dataset-meta">
              <strong>customers.csv</strong>
              <span>{CUSTOMERS.length} rows · 6 columns</span>
            </div>
          </div>
          <button
            className="demo-add-source"
            onClick={() => handleGated("upload_file")}
          >
            + Upload your own CSV
          </button>

          <div className="demo-side-section">
            <h4>Sources you could connect</h4>
            <ul className="demo-source-list">
              <li>
                <span>Postgres</span>
                <button onClick={() => handleGated("connect_postgres")}>+</button>
              </li>
              <li>
                <span>Snowflake</span>
                <button onClick={() => handleGated("connect_snowflake")}>+</button>
              </li>
              <li>
                <span>Google Sheets</span>
                <button onClick={() => handleGated("connect_sheets")}>+</button>
              </li>
              <li>
                <span>BigQuery</span>
                <button onClick={() => handleGated("connect_bigquery")}>+</button>
              </li>
            </ul>
          </div>
        </aside>

        {/* Middle pane: data preview */}
        <main className="demo-pane demo-pane-mid">
          <div className="demo-pane-header">
            <h3>customers.csv — preview</h3>
            <div className="demo-pane-actions">
              <button className="demo-btn-ghost" onClick={() => handleGated("export_csv")}>
                ⬇ Export CSV
              </button>
              <button className="demo-btn-ghost" onClick={() => handleGated("save_checkpoint")}>
                ⏺ Save checkpoint
              </button>
            </div>
          </div>
          <div className="demo-table-wrap">
            <table className="demo-table">
              <thead>
                <tr>
                  <th>customer_id</th>
                  <th>name</th>
                  <th>email</th>
                  <th>signup_date</th>
                  <th className="demo-num">total_spend</th>
                  <th>region</th>
                </tr>
              </thead>
              <tbody>
                {CUSTOMERS.map((c) => (
                  <tr key={c.customer_id}>
                    <td>{c.customer_id}</td>
                    <td>{c.name}</td>
                    <td>{c.email}</td>
                    <td>{c.signup_date}</td>
                    <td className="demo-num">
                      {c.total_spend == null ? <span className="demo-null">null</span> : c.total_spend.toFixed(2)}
                    </td>
                    <td>{c.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="demo-table-footnote">
            Showing all {CUSTOMERS.length} rows. In the full app you can transform, join, and pipeline this with plain-English prompts.
          </p>
        </main>

        {/* Right pane: AI assistant */}
        <aside className="demo-pane demo-pane-right">
          <div className="demo-pane-header">
            <h3>AI assistant</h3>
            <span className="demo-pane-sub">Click a sample prompt</span>
          </div>

          <div className="demo-prompts">
            {INSIGHTS.map((ins) => (
              <button
                key={ins.id}
                className={`demo-prompt-chip ${ins.id === selectedInsight ? "demo-prompt-chip-active" : ""}`}
                onClick={() => handlePickInsight(ins.id)}
              >
                {ins.prompt}
              </button>
            ))}
          </div>

          <div className="demo-ai-card">
            <div className="demo-ai-row">
              <span className="demo-ai-avatar">✦</span>
              <div className="demo-ai-text">
                <strong>You</strong>
                <p>{insight.prompt}</p>
              </div>
            </div>
            <div className="demo-ai-row">
              <span className="demo-ai-avatar demo-ai-avatar-bot">AI</span>
              <div className="demo-ai-text">
                <strong>datahub agent</strong>
                <p>{insight.reply}</p>
                <details className="demo-sql">
                  <summary>View generated SQL</summary>
                  <pre>{insight.sql}</pre>
                </details>
              </div>
            </div>
          </div>

          <div className="demo-chart-card">
            <div className="demo-chart-header">
              <strong>{insight.chartTitle}</strong>
              <button className="demo-btn-ghost-sm" onClick={() => handleGated("save_chart")}>
                ⬆ Save chart
              </button>
            </div>
            <div className="demo-chart-body">
              <ReactECharts option={option} style={{ height: 260, width: "100%" }} notMerge />
            </div>
          </div>

          <button
            className="demo-btn demo-btn-primary demo-cta-wide"
            onClick={() => handleSignup("right_pane")}
          >
            Sign up free to use your own data →
          </button>
          <p className="demo-cta-foot">No credit card · 2-minute setup · Free forever plan</p>
        </aside>
      </div>

      {/* Sign-up gate modal */}
      {showSignupGate ? (
        <div className="demo-gate-overlay" onClick={() => setShowSignupGate(null)}>
          <div className="demo-gate" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="demo-gate-close" onClick={() => setShowSignupGate(null)} aria-label="Close">×</button>
            <h2>Sign up to unlock this</h2>
            <p>
              You&apos;re in the sandbox, so we can&apos;t save changes or connect to real data sources here.
              Create a free account in 30 seconds — no card required — to:
            </p>
            <ul className="demo-gate-list">
              <li>Upload your own CSVs and Excel files (up to 100 MB on the free plan)</li>
              <li>Connect Postgres, Snowflake, BigQuery, Google Sheets &amp; more</li>
              <li>Save checkpoints, run scheduled pipelines, and export anywhere</li>
              <li>Share dashboards with your team</li>
            </ul>
            <div className="demo-gate-actions">
              <button className="demo-btn demo-btn-primary" onClick={() => handleSignup(`gate_${showSignupGate}`)}>
                Sign up free
              </button>
              <Link to="/login" className="demo-btn demo-btn-ghost" onClick={() => capture("demo_login_clicked", { source: `gate_${showSignupGate}` })}>
                I already have an account
              </Link>
            </div>
            <p className="demo-cta-foot">Free forever plan · No credit card required</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
