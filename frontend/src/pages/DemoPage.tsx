import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { useSEO } from "../hooks/useSEO";
import { capture } from "../lib/posthog";
import { useAuth } from "../contexts/AuthContext";
import "./DemoPage.css";

/**
 * /try — Anonymous TRIAL workspace.
 *
 * Visually mimics the real WorkspaceHomePage + WorkspacePage. Anonymous
 * visitors see one pre-created "Trial — Retail Store Sales" project. Opening
 * it loads the retail dataset into a server-side DuckDB session and exposes
 * the same 3-pane layout (Explorer / Data table / AI chat).
 *
 * Constraints:
 *  - 5 AI commands max → blocking signup gate.
 *  - Upload, new project, save, export, connect → signup gate.
 *  - Pipeline / Visualizations / Dashboards tabs are visible but show a
 *    "Sign up to unlock" empty state.
 *  - Authenticated users are redirected to /workspace immediately.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
type Msg = {
  id: string;
  role: "user" | "ai";
  text: string;
  sql?: string;
  columns?: string[];
  rows?: unknown[][];
  rowCount?: number;
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

type View = "home" | "workspace";
type CanvasTab = "data" | "pipeline" | "visualizations" | "dashboards";

// ── Constants ─────────────────────────────────────────────────────────────────
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

const COMMAND_LIMIT = 5;

const SUGGESTED_COMMANDS = [
  { key: "revenue_by_category", label: "Show total revenue by category" },
  { key: "missing_values",      label: "Find missing values across all columns" },
  { key: "monthly_sales_trend", label: "Show monthly sales trend" },
  { key: "payment_breakdown",   label: "Breakdown sales by payment method" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function buildChartOption(commandKey: string, columns: string[], rows: unknown[][]): object | null {
  if (!rows.length || !columns.length) return null;
  if (commandKey === "revenue_by_category") {
    const labels = rows.map((r) => String(r[0]));
    const values = rows.map((r) => Number(r[1]) || 0);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 130, right: 20, top: 12, bottom: 28 },
      xAxis: { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } }, axisLabel: { fontSize: 10, color: "#a0a0b0" } },
      yAxis: { type: "category", data: labels, axisLabel: { fontSize: 10, color: "#a0a0b0" } },
      series: [{ type: "bar", data: values, itemStyle: { color: "#6366f1", borderRadius: [0, 4, 4, 0] }, barWidth: "55%" }],
    };
  }
  if (commandKey === "monthly_sales_trend") {
    const labels = rows.map((r) => String(r[0]));
    const values = rows.map((r) => Number(r[1]) || 0);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 56, right: 16, top: 14, bottom: 50 },
      xAxis: { type: "category", data: labels, axisLabel: { rotate: 45, fontSize: 9, color: "#a0a0b0" } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } }, axisLabel: { fontSize: 10, color: "#a0a0b0" } },
      series: [{ type: "line", smooth: true, data: values, itemStyle: { color: "#10b981" }, areaStyle: { color: "rgba(16,185,129,0.18)" }, lineStyle: { width: 2 } }],
    };
  }
  if (commandKey === "payment_breakdown") {
    const pieData = rows.map((r) => ({ name: String(r[0]), value: Number(r[2]) || 0 }));
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0, textStyle: { color: "#a0a0b0", fontSize: 10 } },
      series: [{
        type: "pie",
        radius: ["35%", "65%"],
        center: ["50%", "44%"],
        data: pieData,
        itemStyle: { borderRadius: 6, borderColor: "#0d0d12", borderWidth: 2 },
        label: { color: "#a0a0b0", fontSize: 10 },
      }],
    };
  }
  if (commandKey === "missing_values" && rows.length === 1) {
    const colHeaders = columns.filter((c) => c !== "total_rows");
    const values = colHeaders.map((_c, i) => Number(rows[0][i]) || 0);
    const labels = colHeaders.map((c) => c.replace("missing_", "").replace(/_/g, " "));
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 130, right: 20, top: 8, bottom: 28 },
      xAxis: { type: "value", splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } }, axisLabel: { fontSize: 10, color: "#a0a0b0" } },
      yAxis: { type: "category", data: labels, axisLabel: { fontSize: 10, color: "#a0a0b0" } },
      series: [{ type: "bar", data: values, itemStyle: { color: "#f59e0b", borderRadius: [0, 4, 4, 0] }, barWidth: "55%" }],
    };
  }
  return null;
}

function renderInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function AiText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("- ")) return <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} />;
        if (line === "") return <br key={i} />;
        return <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(line) }} />;
      })}
    </>
  );
}

function getAiReply(commandKey: string, rowCount: number): string {
  switch (commandKey) {
    case "revenue_by_category":
      return `Grouped all 12,575 transactions by **Category** and summed \`Total Spent\` (skipping 604 null rows). Returned **${rowCount} categories**. Beverages and Patisserie tend to lead. Chart on the right.`;
    case "missing_values":
      return "Scanned all 11 columns for NULLs and blanks:\n- **Discount Applied** missing in ~4,199 rows (33%)\n- **Item** missing in ~1,213 rows (10%)\n- **Price Per Unit**, **Quantity**, **Total Spent** each missing in ~604 rows\n\nSign up to run a one-click cleaning pipeline.";
    case "monthly_sales_trend":
      return `Grouped revenue by month (2022-01 → 2025-01). ${rowCount} months returned. Peaks visible mid-2023 and early 2024.`;
    case "payment_breakdown":
      return `Split transactions by **Payment Method** — ${rowCount} methods. Credit Card and Digital Wallet dominate by revenue.`;
    default:
      return `Query returned **${rowCount} row${rowCount === 1 ? "" : "s"}**. See results in the table.`;
  }
}

// ── Tour steps ───────────────────────────────────────────────────────────────
const TOUR_STEPS = [
  { target: "[data-tour='explorer']", title: "Explorer", body: "Datasets, projects, and connectors live here. The retail dataset is preloaded for the trial." },
  { target: "[data-tour='canvas-tabs']", title: "Canvas tabs", body: "Switch between Data, Pipeline, Visualizations, and Dashboards. The full power is unlocked once you sign up." },
  { target: "[data-tour='ai-panel']", title: "AI Agent", body: "Type any question in plain English. The agent generates DuckDB SQL and runs it instantly. You have 5 free commands in the trial." },
];

export function DemoPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  // Redirect signed-in users straight to the real workspace.
  useEffect(() => {
    if (session) navigate("/workspace", { replace: true });
  }, [session, navigate]);

  useSEO({
    title: "Try DataHub Free — Real workspace, no signup",
    description: "A real DataHub trial workspace pre-loaded with retail sales data. Ask AI questions, see SQL, get charts. No signup needed.",
    canonical: "https://datahub.org.in/try",
  });

  const sessionId = useMemo(() => getSessionId(), []);
  const [view, setView] = useState<View>("home");

  // Workspace data
  const [initDone, setInitDone] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState("retail_store_sales.csv");
  const [totalRows, setTotalRows] = useState<number>(0);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [tableRows, setTableRows] = useState<unknown[][]>([]);
  const [showingResult, setShowingResult] = useState(false);
  const [resultLabel, setResultLabel] = useState<string>("");
  const [originalColumns, setOriginalColumns] = useState<string[]>([]);
  const [originalRows, setOriginalRows] = useState<unknown[][]>([]);

  // Chat
  const [messages, setMessages] = useState<Msg[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [commandsRun, setCommandsRun] = useState(getCommandsRun);

  // Tabs
  const [canvasTab, setCanvasTab] = useState<CanvasTab>("data");

  // Gate
  const [showGate, setShowGate] = useState(false);
  const [gateTitle, setGateTitle] = useState("");
  const [gateSub, setGateSub] = useState("");

  // Tour
  const [tourActive, setTourActive] = useState(false);
  const [tourIdx, setTourIdx] = useState(0);
  const [tourBox, setTourBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Init demo session when entering workspace view ──────────────────────────
  useEffect(() => {
    if (view !== "workspace" || initDone) return;
    capture("trial_workspace_opened");

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
        setOriginalColumns(data.columns);
        setOriginalRows(data.rows);
        setInitDone(true);
        setMessages([{
          id: "init",
          role: "ai",
          text: `Loaded **${data.dataset_name}** (${data.total_rows.toLocaleString()} rows, ${data.columns.length} columns) — data from 2022 to 2025.\n\nTry one of the suggested commands or type your own question.`,
        }]);

        // Start tour first time we open the workspace.
        const tourSeen = localStorage.getItem("demo_tour_seen");
        if (!tourSeen) {
          setTimeout(() => {
            setTourActive(true);
            localStorage.setItem("demo_tour_seen", "1");
          }, 600);
        }
      } catch {
        setInitError("Couldn't connect to the trial server. Please refresh.");
      }
    };
    init();
  }, [view, initDone, sessionId]);

  // Cleanup demo session on unload
  useEffect(() => {
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

  // Auto-scroll AI chat
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isThinking]);

  // Reposition tour spotlight on step change / window resize
  useEffect(() => {
    if (!tourActive) return;
    const update = () => {
      const step = TOUR_STEPS[tourIdx];
      if (!step) return;
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el) { setTourBox(null); return; }
      const r = el.getBoundingClientRect();
      setTourBox({ top: r.top - 4, left: r.left - 4, width: r.width + 8, height: r.height + 8 });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [tourActive, tourIdx]);

  // ── Gates ───────────────────────────────────────────────────────────────────
  const openSignup = useCallback((source: string) => {
    capture("demo_converted_to_signup", { source });
    try {
      sessionStorage.setItem("datahub_signup_intent", JSON.stringify({ source: "demo", at: Date.now() }));
    } catch { /* non-fatal */ }
    navigate("/signup");
  }, [navigate]);

  const blockedAction = useCallback((title: string, sub: string) => {
    capture("demo_signup_prompt_shown", { trigger: "blocked_action", reason: title });
    setGateTitle(title);
    setGateSub(sub);
    setShowGate(true);
  }, []);

  // ── Run command ─────────────────────────────────────────────────────────────
  const runCommand = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return;
    const n = getCommandsRun();
    if (n >= COMMAND_LIMIT) {
      capture("demo_signup_prompt_shown", { trigger: "command_limit", command_number: n + 1 });
      setGateTitle("Trial ended — sign up to keep going");
      setGateSub(`You've used all ${COMMAND_LIMIT} free commands. Create a free account to continue analysing your own data.`);
      setShowGate(true);
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
      setShowingResult(true);
      setResultLabel(text.length > 50 ? text.slice(0, 47) + "…" : text);
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

      if (newCount >= COMMAND_LIMIT) {
        // Final push: show gate after a beat so the result is visible first.
        setTimeout(() => {
          setGateTitle("Trial ended — sign up to keep going");
          setGateSub(`That was your ${COMMAND_LIMIT}th and last free command. Create a free account to continue.`);
          setShowGate(true);
        }, 800);
      }
    } catch (err: unknown) {
      setMessages((prev) => [...prev, {
        id: `e_${Date.now()}`,
        role: "ai",
        text: `Sorry, something went wrong: ${err instanceof Error ? err.message : "unknown error"}. Try a suggested command instead.`,
      }]);
    } finally {
      setIsThinking(false);
    }
  }, [sessionId, isThinking]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runCommand(inputText);
    }
  };

  const showOriginal = () => {
    setTableColumns(originalColumns);
    setTableRows(originalRows);
    setShowingResult(false);
    setResultLabel("");
  };

  // ── Top bar (shared between views) ──────────────────────────────────────────
  const TopBar = (
    <header className="dp-topbar">
      <Link to="/" className="dp-brand" aria-label="Back to homepage">
        <span className="dp-brand-mark">▣</span>
        <span>DataHub</span>
        <span className="dp-trial-chip">FREE TRIAL</span>
      </Link>
      <div className="dp-tabs">
        <button
          className={`dp-tab ${view === "home" ? "dp-tab-active" : ""}`}
          onClick={() => setView("home")}
        >
          Workspace
        </button>
        <button
          className="dp-tab"
          onClick={() => navigate("/marketplace")}
        >
          Marketplace
        </button>
        <button
          className="dp-tab"
          onClick={() => navigate("/pricing")}
        >
          Pricing
        </button>
      </div>
      <div className="dp-topbar-right">
        <Link to="/login" className="dp-link">Sign in</Link>
        <button className="dp-btn dp-btn-primary" onClick={() => openSignup("topbar")}>Sign up free</button>
      </div>
    </header>
  );

  // ── Error state ─────────────────────────────────────────────────────────────
  if (initError && view === "workspace") {
    return (
      <div className="dp-shell">
        {TopBar}
        <div className="dp-error">
          <p>{initError}</p>
          <button className="dp-btn dp-btn-primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  // ── HOME VIEW ───────────────────────────────────────────────────────────────
  if (view === "home") {
    return (
      <div className="dp-shell">
        {TopBar}
        <div className="dp-home">
          <div className="dp-home-header">
            <div>
              <h1>Workspace</h1>
              <p>You're in a free trial. Open the demo project to explore — sign up to create your own.</p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input className="dp-home-search" placeholder="Search projects…" disabled />
              <button
                className="dp-btn dp-btn-primary"
                onClick={() => blockedAction("Sign up to create projects", "Free accounts let you create unlimited projects with your own data.")}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New Project
              </button>
            </div>
          </div>

          <section className="dp-section">
            <h2 className="dp-section-h">Projects (1)</h2>
            <div className="dp-grid">
              <div
                className="dp-card"
                onClick={() => { capture("trial_project_opened"); setView("workspace"); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") setView("workspace"); }}
              >
                <div className="dp-card-head">
                  <span className="dp-card-icon">📊</span>
                  <span className="dp-card-name">Trial — Retail Store Sales</span>
                  <span className="dp-card-badge">DEMO</span>
                </div>
                <p className="dp-card-desc">12,575 transactions across 8 categories (2022–2025)</p>
                <div className="dp-card-meta">
                  <span>1 dataset</span>
                  <span>Pre-loaded</span>
                </div>
              </div>
              <div
                className="dp-card-add"
                onClick={() => blockedAction("Sign up to create projects", "Free accounts include unlimited projects with your own data.")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") blockedAction("Sign up to create projects", "Free accounts include unlimited projects with your own data."); }}
              >
                <span style={{ fontSize: 20 }}>+</span> New Project
              </div>
            </div>
          </section>

          <section className="dp-section">
            <h2 className="dp-section-h">Recent Pipelines</h2>
            <div style={{ background: "var(--bg2)", borderRadius: 12, border: "1px solid var(--bd)", padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--tx1)" }}>
              No pipelines yet. Open the trial project to start.
            </div>
          </section>
        </div>

        {showGate && <GateModal title={gateTitle} sub={gateSub} onClose={() => setShowGate(false)} onSignup={openSignup} />}
      </div>
    );
  }

  // ── WORKSPACE VIEW ──────────────────────────────────────────────────────────
  return (
    <div className="dp-shell">
      {TopBar}

      <div className="dp-breadcrumb">
        <a onClick={(e) => { e.preventDefault(); setView("home"); }} href="#" style={{ cursor: "pointer" }}>Workspace</a>
        <span className="sep">›</span>
        <a onClick={(e) => { e.preventDefault(); setView("home"); }} href="#" style={{ cursor: "pointer" }}>Trial — Retail Store Sales</a>
        <span className="sep">›</span>
        <span className="cur">{datasetName}</span>
      </div>

      <div className="dp-trial-banner">
        <span>
          You're in <strong>trial mode</strong>. {Math.max(0, COMMAND_LIMIT - commandsRun)} of {COMMAND_LIMIT} free commands remaining ·{" "}
          <button
            className="dp-link"
            style={{ display: "inline", padding: 0, color: "var(--ac)", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontSize: 12.5 }}
            onClick={() => openSignup("trial_banner")}
          >
            Sign up free
          </button>{" "}
          to use unlimited commands with your own data.
        </span>
        <button className="dp-btn dp-btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => openSignup("trial_banner_btn")}>
          Sign up free
        </button>
      </div>

      <div className="dp-ws">
        {/* Explorer */}
        <aside className="dp-explorer" data-tour="explorer">
          <div className="dp-explorer-h">
            <span>DATASETS</span>
            <button className="dp-explorer-h-add" onClick={() => blockedAction("Sign up to upload data", "Trial mode is locked to the demo dataset. Create a free account to upload your own CSV, Excel, JSON, or Parquet files.")} title="Upload">+</button>
          </div>
          <div className="dp-explorer-section">
            <div className="dp-ds-item dp-ds-item-active" onClick={showOriginal}>
              <span className="dp-ds-icon">📄</span>
              <div className="dp-ds-meta">
                <span className="dp-ds-name">retail_store_sales.csv</span>
                <span className="dp-ds-rows">{initDone ? `${totalRows.toLocaleString()} rows` : "Loading…"} · 11 cols</span>
              </div>
            </div>
          </div>

          <div className="dp-explorer-h">
            <span>CONNECTORS</span>
            <button className="dp-explorer-h-add" onClick={() => blockedAction("Sign up to connect databases", "Connect PostgreSQL, Snowflake, BigQuery, MySQL, Google Sheets, S3 and more on the free plan.")} title="Add connector">+</button>
          </div>
          <div className="dp-explorer-section">
            {["PostgreSQL", "Snowflake", "BigQuery", "Google Sheets"].map((src) => (
              <div key={src} className="dp-ds-item" onClick={() => blockedAction(`Sign up to connect ${src}`, "All connectors are free.")}>
                <span className="dp-ds-icon">🔌</span>
                <div className="dp-ds-meta"><span className="dp-ds-name">{src}</span></div>
                <span className="dp-locked-icon">🔒</span>
              </div>
            ))}
          </div>

          <div className="dp-explorer-h">
            <span>ARTIFACTS</span>
          </div>
          <div className="dp-explorer-section">
            <p style={{ padding: "0 10px", margin: 0, fontSize: 11.5, color: "var(--tx2)", lineHeight: 1.5 }}>
              Saved checkpoints appear here when you save a step in the AI agent.
            </p>
          </div>
        </aside>

        {/* Canvas */}
        <main className="dp-canvas">
          <div className="dp-canvas-tabs" data-tour="canvas-tabs">
            <button className={`dp-c-tab ${canvasTab === "data" ? "dp-c-tab-active" : ""}`} onClick={() => setCanvasTab("data")}>📊 Data</button>
            <button className={`dp-c-tab ${canvasTab === "pipeline" ? "dp-c-tab-active" : ""}`} onClick={() => setCanvasTab("pipeline")}>🔀 Pipeline</button>
            <button className={`dp-c-tab ${canvasTab === "visualizations" ? "dp-c-tab-active" : ""}`} onClick={() => setCanvasTab("visualizations")}>📈 Visualizations</button>
            <button className={`dp-c-tab ${canvasTab === "dashboards" ? "dp-c-tab-active" : ""}`} onClick={() => setCanvasTab("dashboards")}>🗂️ Dashboards</button>
          </div>

          <div className="dp-canvas-body">
            {!initDone ? (
              <div className="dp-loading">
                <div className="dp-loading-spinner" />
                <p>Loading retail dataset…</p>
              </div>
            ) : canvasTab === "data" ? (
              <>
                <div className="dp-canvas-toolbar">
                  <div className="dp-canvas-toolbar-l">
                    <strong>{showingResult ? `Result: ${resultLabel}` : datasetName}</strong>
                    <span>{tableRows.length} of {showingResult ? tableRows.length : totalRows.toLocaleString()} rows · {tableColumns.length} cols</span>
                    {showingResult && (
                      <button className="dp-btn dp-btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={showOriginal}>← Show original</button>
                    )}
                  </div>
                  <div className="dp-canvas-toolbar-r">
                    <button className="dp-btn dp-btn-ghost" onClick={() => blockedAction("Sign up to export results", "Export to CSV, Excel, Parquet, Tableau, or Google Sheets.")}>⬇ Export</button>
                    <button className="dp-btn dp-btn-ghost" onClick={() => blockedAction("Sign up to save artifacts", "Save cleaned datasets as named checkpoints you can refer to later.")}>⏺ Save</button>
                  </div>
                </div>
                <div className="dp-table-wrap">
                  <table className="dp-table">
                    <thead>
                      <tr>{tableColumns.map((c) => <th key={c}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row, ri) => (
                        <tr key={ri}>
                          {(row as unknown[]).map((cell, ci) => (
                            <td key={ci} className={typeof cell === "number" ? "dp-num" : undefined}>
                              {cell === null || cell === undefined ? <span className="dp-null">null</span> : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="dp-table-foot">
                  Showing first {tableRows.length} of {showingResult ? tableRows.length : totalRows.toLocaleString()} rows.
                  {!showingResult && totalRows > tableRows.length && " Sign up to query the full dataset."}
                </div>
              </>
            ) : canvasTab === "pipeline" ? (
              <div className="dp-empty-tab">
                <div style={{ fontSize: 36 }}>🔀</div>
                <h3>Pipeline view</h3>
                <p>Every AI command becomes a versioned, replayable pipeline step. Sign up to save and run pipelines with your own data.</p>
                <button className="dp-btn dp-btn-primary" onClick={() => openSignup("pipeline_tab")}>Sign up free</button>
              </div>
            ) : canvasTab === "visualizations" ? (
              <div className="dp-empty-tab">
                <div style={{ fontSize: 36 }}>📈</div>
                <h3>Visualizations</h3>
                <p>Generated charts from AI commands appear here. Drag to dashboards, embed, or share. Sign up to save and re-use charts.</p>
                <button className="dp-btn dp-btn-primary" onClick={() => openSignup("viz_tab")}>Sign up free</button>
              </div>
            ) : (
              <div className="dp-empty-tab">
                <div style={{ fontSize: 36 }}>🗂️</div>
                <h3>Dashboards</h3>
                <p>Compose multiple charts and tables into a shareable dashboard. Available on the free plan.</p>
                <button className="dp-btn dp-btn-primary" onClick={() => openSignup("dash_tab")}>Sign up free</button>
              </div>
            )}
          </div>
        </main>

        {/* AI Panel */}
        <aside className="dp-ai" data-tour="ai-panel">
          <div className="dp-ai-h">
            <span className="dp-ai-h-title"><span className="star">✦</span> AI Agent</span>
            <span className={`dp-ai-h-counter ${commandsRun >= COMMAND_LIMIT ? "dp-ai-h-counter-stop" : commandsRun >= COMMAND_LIMIT - 1 ? "dp-ai-h-counter-warn" : ""}`}>
              {commandsRun}/{COMMAND_LIMIT}
            </span>
          </div>

          {commandsRun === 0 && initDone && (
            <div className="dp-ai-chips">
              <div className="dp-ai-chips-h">SUGGESTED</div>
              {SUGGESTED_COMMANDS.map((cmd) => (
                <button
                  key={cmd.key}
                  className="dp-chip"
                  onClick={() => runCommand(cmd.label)}
                  disabled={isThinking}
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          )}

          <div className="dp-ai-msgs">
            {messages.map((msg) => (
              <div key={msg.id} className={`dp-msg dp-msg-${msg.role}`}>
                <span className={`dp-msg-avatar ${msg.role === "ai" ? "dp-msg-avatar-ai" : "dp-msg-avatar-user"}`}>
                  {msg.role === "ai" ? "✦" : "U"}
                </span>
                <div className="dp-msg-body">
                  {msg.role === "ai" ? <AiText text={msg.text} /> : <p>{msg.text}</p>}
                  {msg.sql && (
                    <details className="dp-sql">
                      <summary>View SQL</summary>
                      <pre>{msg.sql}</pre>
                    </details>
                  )}
                  {msg.commandKey && msg.columns && msg.rows && (() => {
                    const opt = buildChartOption(msg.commandKey, msg.columns, msg.rows);
                    return opt ? (
                      <div className="dp-inline-chart">
                        <ReactECharts option={opt} style={{ height: 200, width: "100%" }} notMerge />
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="dp-msg">
                <span className="dp-msg-avatar dp-msg-avatar-ai">✦</span>
                <div className="dp-msg-body"><div className="dp-thinking"><span /><span /><span /></div></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="dp-ai-input-wrap">
            <textarea
              className="dp-ai-input"
              placeholder={commandsRun >= COMMAND_LIMIT ? "Trial ended — sign up to continue." : "Ask anything about this data…"}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isThinking || commandsRun >= COMMAND_LIMIT}
              rows={1}
              onClick={() => {
                if (commandsRun >= COMMAND_LIMIT) {
                  setGateTitle("Trial ended — sign up to keep going");
                  setGateSub(`You've used all ${COMMAND_LIMIT} free commands. Create a free account to continue.`);
                  setShowGate(true);
                }
              }}
            />
            <button
              className="dp-ai-send"
              disabled={isThinking || !inputText.trim() || commandsRun >= COMMAND_LIMIT}
              onClick={() => runCommand(inputText)}
              aria-label="Send"
            >
              ➤
            </button>
          </div>
        </aside>
      </div>

      {/* Tour overlay */}
      {tourActive && tourBox && (() => {
        const step = TOUR_STEPS[tourIdx];
        // Position tip beside the spotlight: prefer right, then below
        const vw = window.innerWidth;
        const tipW = 280;
        const right = tourBox.left + tourBox.width + 16;
        const willOverflow = right + tipW > vw - 16;
        const tipLeft = willOverflow ? Math.max(16, tourBox.left - tipW - 16) : right;
        const tipTop = Math.max(16, Math.min(tourBox.top, window.innerHeight - 200));
        return (
          <div className="dp-tour-overlay">
            <div className="dp-tour-spot" style={{ top: tourBox.top, left: tourBox.left, width: tourBox.width, height: tourBox.height }} />
            <div className="dp-tour-tip" style={{ top: tipTop, left: tipLeft }}>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
              <div className="dp-tour-tip-foot">
                <span>{tourIdx + 1} of {TOUR_STEPS.length}</span>
                <div className="dp-tour-tip-foot-btns">
                  <button onClick={() => setTourActive(false)}>Skip</button>
                  {tourIdx < TOUR_STEPS.length - 1 ? (
                    <button className="primary" onClick={() => setTourIdx((i) => i + 1)}>Next</button>
                  ) : (
                    <button className="primary" onClick={() => setTourActive(false)}>Got it</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showGate && <GateModal title={gateTitle} sub={gateSub} onClose={() => setShowGate(false)} onSignup={openSignup} />}
    </div>
  );
}

// ── Gate modal ────────────────────────────────────────────────────────────────
function GateModal({ title, sub, onClose, onSignup }: {
  title: string; sub: string; onClose: () => void; onSignup: (source: string) => void;
}) {
  return (
    <div className="dp-gate-overlay" onClick={onClose}>
      <div className="dp-gate" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="dp-gate-close" onClick={onClose} aria-label="Close">×</button>
        <div className="dp-gate-icon">🔒</div>
        <h2>{title}</h2>
        <p>{sub}</p>
        <ul className="dp-gate-list">
          <li>Upload CSV, Excel, JSON, Parquet — your own data</li>
          <li>Unlimited AI questions on the free plan</li>
          <li>Connect PostgreSQL, Snowflake, BigQuery &amp; more</li>
          <li>Save pipelines, export results, build dashboards</li>
        </ul>
        <div className="dp-gate-actions">
          <button className="dp-btn dp-btn-primary" onClick={() => onSignup("gate_signup")}>Sign up free</button>
          <button className="dp-btn dp-btn-secondary" onClick={() => onSignup("gate_signin")}>Already have an account? Sign in</button>
        </div>
        <button className="dp-gate-continue" onClick={onClose}>Continue exploring trial</button>
      </div>
    </div>
  );
}
