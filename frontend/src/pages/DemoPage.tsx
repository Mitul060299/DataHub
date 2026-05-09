import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { useSEO } from "../hooks/useSEO";
import { capture } from "../lib/posthog";
import { useAuth } from "../contexts/AuthContext";
import "./DemoPage.css";

/**
 * /try — Anonymous demo workspace powered by a real backend DuckDB session.
 *
 * Architecture:
 *  - On mount, a random session_id is generated and stored in localStorage.
 *  - POST /api/demo/init  → loads retail_store_sales.csv into an isolated
 *    server-side DuckDB connection; returns first 100 rows + column info.
 *  - POST /api/demo/command → executes NL→SQL on that session; returns
 *    SQL + result rows.
 *  - Usage limits (localStorage "demo_commands_run"):
 *      0–2  : run normally
 *      >=2  : non-blocking banner shown after 2nd command
 *      >=3  : blocking modal after 3rd command
 *  - Blocked actions (upload, new project, save, export) → signup prompt.
 *  - Redirect signed-in users → /workspace.
 */

// Types
type Msg = {
  id: string;
  role: "user" | "ai";
  text: string;
  sql?: string;
  columns?: string[];
  rows?: unknown[][];
  rowCount?: number;
  error?: string;
  commandKey?: string;
};

type DemoInitResult = {
  ok: boolean;
  session_id: string;
  dataset_name: string;
  total_rows: number;
  columns: string[];
  rows: unknown[][];
};

type DemoCommandResult = {
  ok: boolean;
  command_key: string;
  sql: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
};

// Constants
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

const SUGGESTED_COMMANDS = [
  { key: "revenue_by_category", label: "Show total revenue by category" },
  { key: "missing_values",      label: "Find missing values across all columns" },
  { key: "monthly_sales_trend", label: "Show monthly sales trend" },
  { key: "payment_breakdown",   label: "Breakdown sales by payment method" },
];

const COMMAND_LIMIT_BANNER = 2;
const COMMAND_LIMIT_MODAL  = 3;

// localStorage helpers
function getSessionId(): string {
  const key = "demo_session_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `demo_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function getCommandsRun(): number {
  return Number(localStorage.getItem("demo_commands_run") ?? "0");
}

function incrementCommandsRun(): number {
  const next = getCommandsRun() + 1;
  localStorage.setItem("demo_commands_run", String(next));
  return next;
}

// Chart builder
function buildChartOption(commandKey: string, columns: string[], rows: unknown[][]): object | null {
  if (!rows.length || !columns.length) return null;

  if (commandKey === "revenue_by_category") {
    const labels = rows.map((r) => String(r[0]));
    const values = rows.map((r) => Number(r[1]) || 0);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 220, right: 24, top: 16, bottom: 28 },
      xAxis: { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } },
      yAxis: { type: "category", data: labels },
      series: [{ type: "bar", data: values, itemStyle: { color: "#5B6AF0", borderRadius: [0, 4, 4, 0] }, barWidth: "55%" }],
    };
  }

  if (commandKey === "monthly_sales_trend") {
    const labels = rows.map((r) => String(r[0]));
    const values = rows.map((r) => Number(r[1]) || 0);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 60, right: 16, top: 16, bottom: 52 },
      xAxis: { type: "category", data: labels, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } },
      series: [{ type: "line", smooth: true, data: values, itemStyle: { color: "#22c55e" }, areaStyle: { color: "rgba(34,197,94,0.15)" }, lineStyle: { width: 2 } }],
    };
  }

  if (commandKey === "payment_breakdown") {
    const pieData = rows.map((r) => ({ name: String(r[0]), value: Number(r[2]) || 0 }));
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      series: [{
        type: "pie",
        radius: ["40%", "70%"],
        data: pieData,
        itemStyle: { borderRadius: 6 },
        label: { color: "#c7cad6", fontSize: 12 },
      }],
    };
  }

  if (commandKey === "missing_values" && rows.length === 1) {
    const colHeaders = columns.filter((c) => c !== "total_rows");
    const values = colHeaders.map((_c, i) => Number(rows[0][i]) || 0);
    const labels = colHeaders.map((c) => c.replace("missing_", "").replace(/_/g, " "));
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 180, right: 24, top: 8, bottom: 28 },
      xAxis: { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } },
      yAxis: { type: "category", data: labels },
      series: [{ type: "bar", data: values, itemStyle: { color: "#f59e0b", borderRadius: [0, 4, 4, 0] }, barWidth: "55%" }],
    };
  }

  return null;
}

// Inline text renderer
function renderInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function AiText({ text }: { text: string }) {
  return (
    <div className="demo-ai-prose">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("- ")) return <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} />;
        if (line === "") return <br key={i} />;
        return <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(line) }} />;
      })}
    </div>
  );
}

function getAiReply(commandKey: string, rowCount: number): string {
  switch (commandKey) {
    case "revenue_by_category":
      return `Grouped all 12,575 transactions by **Category** and summed \`Total Spent\` (skipping 604 null rows). Results show **${rowCount} categories**. Beverages and Patisserie tend to lead. The chart shows the ranking.`;
    case "missing_values":
      return "Scanned all 11 columns for NULLs and blanks. Key findings:\n- **Discount Applied** has the most missing values (~4,199 rows — 33%)\n- **Item** has ~1,213 nulls (10%)\n- **Price Per Unit**, **Quantity**, and **Total Spent** each have ~604 nulls\n\nSign up to run a cleaning pipeline that fills or drops these rows automatically.";
    case "monthly_sales_trend":
      return `Grouped transactions by month (2022-01 to 2025-01) and summed revenue. The chart shows ${rowCount} months of data. Revenue peaks in mid-2023 and early 2024.`;
    case "payment_breakdown":
      return `Split transactions by **Payment Method**. ${rowCount} distinct methods found. Credit Card and Digital Wallet dominate by revenue.`;
    default:
      return `Query returned **${rowCount} row${rowCount === 1 ? "" : "s"}**. See the results in the table.`;
  }
}

// Main component
export function DemoPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  useEffect(() => {
    if (session) navigate("/workspace", { replace: true });
  }, [session, navigate]);

  useSEO({
    title: "Try DataHub Free — Real AI data analysis, no signup",
    description:
      "Explore a real retail dataset with AI-powered SQL. Ask questions in plain English, see generated SQL, get instant charts. No signup needed to start.",
    canonical: "https://datahub.org.in/try",
  });

  const sessionId = useMemo(() => getSessionId(), []);
  const [initDone, setInitDone] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState("Demo — Retail Store Sales");
  const [totalRows, setTotalRows] = useState<number>(0);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [tableRows, setTableRows] = useState<unknown[][]>([]);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [commandsRun, setCommandsRun] = useState(getCommandsRun);

  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [gateReason, setGateReason] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    capture("demo_workspace_visited");

    const init = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/demo/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: DemoInitResult = await res.json();
        setDatasetName(data.dataset_name);
        setTotalRows(data.total_rows);
        setTableColumns(data.columns);
        setTableRows(data.rows);
        setInitDone(true);
        setMessages([{
          id: "init",
          role: "ai",
          text: `I've loaded **${data.dataset_name}** (${data.total_rows.toLocaleString()} rows · ${data.columns.length} columns) with data from 2022–2025.\n\nTry one of the suggested commands below, or type your own question.`,
        }]);
      } catch {
        setInitError("Couldn't connect to the demo server. Please refresh.");
      }
    };
    init();

    const cleanup = () => {
      try {
        navigator.sendBeacon(
          `${API_BASE}/api/demo/session`,
          JSON.stringify({ session_id: sessionId }),
        );
      } catch { /* non-fatal */ }
      capture("demo_exited_without_signup");
    };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleSignup = useCallback((source: string) => {
    capture("demo_converted_to_signup", { source });
    try {
      sessionStorage.setItem(
        "datahub_signup_intent",
        JSON.stringify({ source: "demo", at: Date.now() }),
      );
    } catch { /* non-fatal */ }
    navigate("/signup");
  }, [navigate]);

  const handleBlockedAction = useCallback((reason: string) => {
    capture("demo_signup_prompt_shown", { trigger: "blocked_action", reason });
    setGateReason(reason);
    setShowModal(true);
  }, []);

  const runCommand = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return;

    const n = getCommandsRun();
    if (n >= COMMAND_LIMIT_MODAL) {
      capture("demo_signup_prompt_shown", { trigger: "command_limit", command_number: n + 1 });
      setGateReason("command_limit");
      setShowModal(true);
      return;
    }

    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", text }]);
    setInputText("");
    setIsThinking(true);

    const newCount = incrementCommandsRun();
    setCommandsRun(newCount);
    capture("demo_command_run", { command_number: newCount });

    try {
      const res = await fetch(`${API_BASE}/api/demo/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      const data: DemoCommandResult = await res.json();
      setTableColumns(data.columns);
      setTableRows(data.rows);
      setMessages((prev) => [...prev, {
        id: `a_${Date.now()}`,
        role: "ai",
        text: getAiReply(data.command_key, data.row_count),
        sql: data.sql,
        columns: data.columns,
        rows: data.rows,
        rowCount: data.row_count,
        commandKey: data.command_key,
      }]);
    } catch (err: unknown) {
      setMessages((prev) => [...prev, {
        id: `e_${Date.now()}`,
        role: "ai",
        text: `Something went wrong: ${err instanceof Error ? err.message : "Unknown error"}. Try a suggested command instead.`,
      }]);
    } finally {
      setIsThinking(false);
    }

    if (newCount >= COMMAND_LIMIT_BANNER) {
      setShowBanner(true);
      capture("demo_signup_prompt_shown", { trigger: "command_limit", command_number: newCount });
    }
  }, [sessionId, isThinking]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runCommand(inputText);
    }
  };

  if (initError) {
    return (
      <div className="demo-shell demo-error-screen">
        <p>{initError}</p>
        <button className="demo-btn demo-btn-primary" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  const inputDisabled = isThinking || commandsRun >= COMMAND_LIMIT_MODAL;

  return (
    <div className="demo-shell">
      {/* Top bar */}
      <header className="demo-topbar">
        <Link to="/" className="demo-brand" aria-label="Back to homepage">
          <span className="demo-brand-mark">&#x25A3;</span>
          <span>datahub.org.in</span>
          <span className="demo-preview-chip">FREE PREVIEW</span>
        </Link>

        <div className="demo-topbar-center">
          {initDone && (
            <span className="demo-dataset-label">
              📊 {datasetName} &middot; {totalRows.toLocaleString()} rows
            </span>
          )}
        </div>

        <div className="demo-topbar-actions">
          <span className="demo-preview-note">
            Changes aren&apos;t saved &middot;{" "}
            <button className="demo-inline-link" onClick={() => handleSignup("topbar_note")}>
              Sign up free
            </button>{" "}
            to use your own data
          </span>
          <Link to="/login" className="demo-link">Sign in</Link>
          <button className="demo-btn demo-btn-primary" onClick={() => handleSignup("topbar")}>
            Sign up free
          </button>
        </div>
      </header>

      {/* 3-pane grid */}
      <div className="demo-grid">
        {/* Left: Explorer */}
        <aside className="demo-pane demo-pane-left">
          <div className="demo-pane-header">
            <h3>Explorer</h3>
          </div>

          <div className="demo-explorer-section">
            <div className="demo-explorer-label">DATASETS</div>
            <div className="demo-dataset demo-dataset-active">
              <span className="demo-dataset-icon">📄</span>
              <div className="demo-dataset-meta">
                <strong>retail_store_sales.csv</strong>
                <span>{totalRows > 0 ? `${totalRows.toLocaleString()} rows` : "Loading…"} · 11 cols</span>
              </div>
            </div>
            <button className="demo-add-source" onClick={() => handleBlockedAction("Sign up to upload your own data")}>
              + Upload your own file
            </button>
          </div>

          <div className="demo-explorer-section">
            <div className="demo-explorer-label">DATA SOURCES</div>
            <ul className="demo-source-list">
              {["PostgreSQL", "Snowflake", "BigQuery", "Google Sheets"].map((src) => (
                <li key={src}>
                  <span>{src}</span>
                  <button onClick={() => handleBlockedAction(`Sign up to connect ${src}`)}>+</button>
                </li>
              ))}
            </ul>
          </div>

          <div className="demo-explorer-section">
            <div className="demo-explorer-label">PROJECTS</div>
            <div className="demo-project-item demo-project-active">
              <span>Demo — Retail Store Sales</span>
              <span className="demo-project-badge">demo</span>
            </div>
            <button className="demo-add-source" onClick={() => handleBlockedAction("Sign up to create new projects")}>
              + New project
            </button>
          </div>

          <div className="demo-left-cta">
            <button className="demo-btn demo-btn-primary demo-cta-wide" onClick={() => handleSignup("left_pane")}>
              Sign up free →
            </button>
            <p className="demo-cta-foot">No card · Free forever plan</p>
          </div>
        </aside>

        {/* Center: Data table */}
        <main className="demo-pane demo-pane-mid">
          <div className="demo-pane-header">
            <h3>{initDone ? "retail_store_sales.csv" : "Loading…"}</h3>
            <div className="demo-pane-actions">
              <button className="demo-btn-ghost" onClick={() => handleBlockedAction("Sign up to export results")}>⬇ Export CSV</button>
              <button className="demo-btn-ghost" onClick={() => handleBlockedAction("Sign up to save pipelines")}>⏺ Save pipeline</button>
            </div>
          </div>

          {!initDone ? (
            <div className="demo-loading">
              <div className="demo-thinking"><span /><span /><span /></div>
              <p>Loading retail dataset…</p>
            </div>
          ) : (
            <>
              <div className="demo-table-wrap">
                <table className="demo-table">
                  <thead>
                    <tr>{tableColumns.map((col) => <th key={col}>{col}</th>)}</tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, ri) => (
                      <tr key={ri}>
                        {(row as unknown[]).map((cell, ci) => (
                          <td key={ci} className={typeof cell === "number" ? "demo-num" : undefined}>
                            {cell === null || cell === undefined
                              ? <span className="demo-null">null</span>
                              : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="demo-table-footnote">
                Showing {tableRows.length} of {totalRows.toLocaleString()} rows
                {totalRows > 100 && " · Sign up to query the full dataset"}
              </p>
            </>
          )}
        </main>

        {/* Right: AI Agent */}
        <aside className="demo-pane demo-pane-right demo-ai-pane">
          <div className="demo-pane-header">
            <h3>✦ AI Agent</h3>
            {commandsRun > 0 && (
              <span className="demo-one-done-chip">
                {commandsRun} / {COMMAND_LIMIT_MODAL} free commands used
              </span>
            )}
          </div>

          {commandsRun === 0 && initDone && (
            <div className="demo-chips">
              {SUGGESTED_COMMANDS.map((cmd) => (
                <button
                  key={cmd.key}
                  className="demo-chip"
                  onClick={() => runCommand(cmd.label)}
                  disabled={isThinking}
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          )}

          <div className="demo-chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`demo-msg demo-msg-${msg.role}`}>
                <span className={`demo-msg-avatar ${msg.role === "ai" ? "demo-msg-avatar-ai" : "demo-msg-avatar-user"}`}>
                  {msg.role === "ai" ? "✦" : "You"}
                </span>
                <div className="demo-msg-body">
                  {msg.role === "ai"
                    ? <AiText text={msg.text} />
                    : <p className="demo-msg-text">{msg.text}</p>}

                  {msg.sql && (
                    <details className="demo-sql">
                      <summary>View generated SQL</summary>
                      <pre>{msg.sql}</pre>
                    </details>
                  )}

                  {msg.commandKey && msg.columns && msg.rows && (() => {
                    const opt = buildChartOption(msg.commandKey, msg.columns, msg.rows);
                    return opt ? (
                      <div className="demo-inline-chart">
                        <ReactECharts option={opt} style={{ height: 200, width: "100%" }} notMerge />
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="demo-msg demo-msg-ai">
                <span className="demo-msg-avatar demo-msg-avatar-ai">✦</span>
                <div className="demo-msg-body">
                  <div className="demo-thinking"><span /><span /><span /></div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="demo-chat-input-row">
            <textarea
              className="demo-chat-input"
              placeholder={
                commandsRun >= COMMAND_LIMIT_MODAL
                  ? "Sign up free to keep asking questions…"
                  : "Ask anything about this data…"
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              disabled={inputDisabled}
              onClick={() => {
                if (commandsRun >= COMMAND_LIMIT_MODAL) {
                  capture("demo_signup_prompt_shown", { trigger: "input_click_after_limit" });
                  setGateReason("command_limit");
                  setShowModal(true);
                }
              }}
            />
            <button
              className="demo-chat-send"
              onClick={() => runCommand(inputText)}
              disabled={inputDisabled || !inputText.trim()}
              aria-label="Send"
            >
              &#x27A4;
            </button>
          </div>

          {showBanner && commandsRun < COMMAND_LIMIT_MODAL && (
            <div className="demo-soft-banner">
              <span>You&apos;re in the demo workspace. Sign up free to use your own data.</span>
              <button className="demo-btn demo-btn-primary demo-soft-banner-btn" onClick={() => handleSignup("soft_banner")}>
                Sign up Free
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Blocking modal */}
      {showModal && (
        <div className="demo-gate-overlay" onClick={() => setShowModal(false)}>
          <div
            className="demo-gate"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button className="demo-gate-close" onClick={() => setShowModal(false)} aria-label="Close">×</button>

            {gateReason === "command_limit" ? (
              <>
                <div className="demo-gate-icon">🎯</div>
                <h2>You&apos;ve seen what DataHub can do on real data.</h2>
                <p>Ready to bring your own? Create a free account in 30 seconds — no card needed.</p>
              </>
            ) : (
              <>
                <div className="demo-gate-icon">🔒</div>
                <h2>{gateReason}</h2>
                <p>Create a free account to unlock this and every other DataHub feature.</p>
              </>
            )}

            <ul className="demo-gate-list">
              <li>Upload CSV, Excel, JSON, or Parquet files</li>
              <li>Ask unlimited AI questions about your data</li>
              <li>Connect PostgreSQL, Snowflake, BigQuery, Google Sheets &amp; more</li>
              <li>Save pipelines, export results, and build dashboards</li>
              <li>Share with your team with role-based access</li>
            </ul>

            <div className="demo-gate-actions">
              <button className="demo-btn demo-btn-primary demo-gate-btn" onClick={() => handleSignup("gate_google")}>
                Sign up with Google
              </button>
              <button className="demo-btn demo-btn-secondary demo-gate-btn" onClick={() => handleSignup("gate_email")}>
                Sign up with email
              </button>
            </div>

            <button className="demo-gate-continue" onClick={() => setShowModal(false)}>
              Continue exploring demo
            </button>

            <p className="demo-cta-foot">Free forever · 100 AI messages/month · No credit card</p>
          </div>
        </div>
      )}
    </div>
  );
}
