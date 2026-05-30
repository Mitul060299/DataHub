import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { usePipelineContext } from "../contexts/PipelineContext";
import { useWorkspaceContext, type Dataset } from "../contexts/WorkspaceContext";
import { useChatSession, type AgentEvent, type ConversationMessage, type PlanStep, type TransformationPayload } from "../hooks/useChatSession";
import { usePipeline } from "../hooks/usePipeline";
import { IconBarChart, IconEdit, IconRefresh, IconZap } from "./Icons";
import PlanCard from "./PlanCard";
import { StepCard } from "./StepCard";
import { ExecutionProgressCard, type ExecStep } from "./ExecutionProgressCard";
import { AutoGoalReport } from "./AutoGoalReport";
import { ErrorBoundary } from "./ErrorBoundary";
import { api, saveVisualization } from "../api";
import { ErrorBubble } from "./ErrorBubble";
import { EmptyStateChatPanel } from "./EmptyStateChatPanel";
import { type ColSchema } from "./SuggestionChips";
import { AiSuggestionStrip } from "./AiSuggestionStrip";
import { capture } from "../lib/posthog";
import { recordMilestone } from "../lib/activation";
import { humaniseError, isRetryableError } from "../utils/errorMessages";
import { notify } from "../utils/notify";
import { getAuthToken } from "../utils/auth";
import type { WorkspaceMode } from "../pages/WorkspacePage";
import { useAutoRunSession } from "../hooks/useAutoRunSession";
import { AutoRunFeed } from "./AutoRunFeed";
import { AutoInterruptCard } from "./AutoInterruptCard";

// Lazy-loaded — only mounted when AI returns step plans or chart configs.
const PlanDAG = lazy(() => import("./PlanDAG"));
const EChartsRenderer = lazy(() => import("./EChartsRenderer").then(m => ({ default: m.EChartsRenderer })));

interface TileCreatedData {
  chart_id: string;
  title: string;
  chart_type: string;
  echarts_config: Record<string, unknown> | null;
  source_table?: string;
  saveable?: boolean;
}

// ── Data Quality Profile types ─────────────────────────────────────────────

interface ColProfile {
  null_count: number;
  null_pct: number;
  unique_count: number;
  unique_pct: number;
  min?: number;
  max?: number;
  mean?: number;
  std?: number;
  outlier_count?: number;
  outlier_pct?: number;
  top_values?: Array<{ value: string; count: number }>;
}

interface QualityIssue {
  type: string;
  column?: string | null;
  severity: "high" | "medium" | "low";
  count?: number;
  percentage?: number;
  description: string;
  examples?: string[];
}

interface DataProfile {
  row_count: number;
  sample_size: number;
  duplicate_rows: number;
  duplicate_pct: number;
  columns: Record<string, ColProfile>;
}

// ── GeneratedDashboardCard ────────────────────────────────────────────────
function GeneratedDashboardCard({ dashboardId }: { dashboardId: string }) {
  return (
    <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(34,197,94,0.08)", borderRadius: 8, border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "#22c55e", flex: 1 }}>📊 Dashboard auto-generated from your goal results</span>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("datahub:navigate:dashboard", { detail: { dashboardId } }))}
        style={{ fontSize: 12, padding: "4px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}
      >
        View Dashboard →
      </button>
    </div>
  );
}

function buildFollowUpChips(
  intent: string,
  pipelineSteps: Array<Record<string, unknown>>,
  dataset: Dataset | null,
): string[] {
  if (intent === "clarify" || intent === "converse") return [];
  const name = dataset?.name ?? "dataset";
  const ops = pipelineSteps.map((s) => String(s.operation ?? "")).filter(Boolean);
  const hasClean = ops.some((o) => ["fill_nulls", "drop_nulls", "dedup", "filter"].includes(o));
  const hasAgg = ops.some((o) => ["aggregate", "group_by"].includes(o));
  const hasJoin = ops.some((o) => o === "join");

  if (intent === "validate") {
    return [
      "Fix all detected issues automatically",
      `Show me a null distribution chart for ${name}`,
      "Export the quality report",
    ];
  }
  if (intent === "visualise") {
    return [
      `Show me a different chart type for ${name}`,
      `Pin this chart to a Dashboard`,
      `What are the top 5 values?`,
    ];
  }
  if (hasJoin) {
    return [
      `Show me a summary of the joined data`,
      `Visualise the combined dataset`,
      `Export the joined result`,
    ];
  }
  if (hasClean) {
    return [
      `Show me the data quality report now`,
      `Visualise the cleaned ${name}`,
      `Export the cleaned data`,
    ];
  }
  if (hasAgg) {
    return [
      `Visualise these results as a chart`,
      `Sort by the largest values`,
      `Export the summary`,
    ];
  }
  // Generic transform / converse fallback
  return [
    `Show me a preview of the results`,
    `Create a chart from this data`,
    `Export the output`,
  ];
}

function DataProfileCard({ profile, issues }: { profile: DataProfile; issues?: QualityIssue[] }) {
  const [open, setOpen] = useState(false);
  if (!profile?.columns) return null;
  const cols = Object.entries(profile.columns);
  const highNullCols = cols.filter(([, c]) => c.null_pct > 0).length;
  const colsWithOutliers = cols.filter(([, c]) => (c.outlier_count ?? 0) > 0).length;

  return (
    <div style={{ marginTop: 8, border: "1px solid #27272a", borderRadius: 8, overflow: "hidden", fontSize: 12 }}>
      {/* Summary header */}
      <div style={{ background: "#111113", padding: "8px 10px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#71717a", fontSize: 10, letterSpacing: "0.06em" }}>ROWS</div>
          <div style={{ fontWeight: 700, color: "#d4d4d8" }}>{profile.row_count.toLocaleString()}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#71717a", fontSize: 10, letterSpacing: "0.06em" }}>COLUMNS</div>
          <div style={{ fontWeight: 700, color: "#d4d4d8" }}>{cols.length}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#71717a", fontSize: 10, letterSpacing: "0.06em" }}>DUPES</div>
          <div style={{ fontWeight: 700, color: profile.duplicate_pct > 5 ? "#f87171" : "#22c55e" }}>{profile.duplicate_pct}%</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#71717a", fontSize: 10, letterSpacing: "0.06em" }}>NULL COLS</div>
          <div style={{ fontWeight: 700, color: highNullCols > 0 ? "#fbbf24" : "#22c55e" }}>{highNullCols}</div>
        </div>
      </div>

      {colsWithOutliers > 0 ? (
        <div style={{ background: "#1c1200", borderTop: "1px solid #27272a", padding: "4px 10px", color: "#fbbf24", fontSize: 11 }}>
          ⚠ {colsWithOutliers} column{colsWithOutliers > 1 ? "s" : ""} contain outliers (z-score &gt; 3)
        </div>
      ) : null}

      {/* Issues breakdown — only show issues that actually have occurrences */}
      {issues && issues.filter((iss) => (iss.count ?? 1) > 0).length > 0 ? (
        <div style={{ borderTop: "1px solid #27272a" }}>
          {issues.filter((iss) => (iss.count ?? 1) > 0).map((issue, i) => {
            const severityColor = issue.severity === "high" ? "#f87171" : issue.severity === "medium" ? "#fbbf24" : "#a3a3a3";
            const typeLabel = issue.type.replace(/_/g, " ");
            return (
              <div key={i} style={{ padding: "5px 10px", borderTop: i > 0 ? "1px solid #1f1f22" : undefined, display: "grid", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: severityColor, flexShrink: 0, display: "inline-block" }} />
                  <span className="mono" style={{ fontSize: 11, color: "#d4d4d8", textTransform: "capitalize", fontWeight: 600 }}>{typeLabel}</span>
                  {issue.column ? <span className="mono" style={{ fontSize: 10, color: "#71717a" }}>· {issue.column}</span> : null}
                  {issue.count != null ? <span className="mono" style={{ fontSize: 10, color: "#71717a", marginLeft: "auto" }}>{issue.count.toLocaleString()}{issue.percentage != null ? ` (${issue.percentage}%)` : ""}</span> : null}
                </div>
                <div style={{ fontSize: 11, color: "#a1a1aa", paddingLeft: 12 }}>{issue.description}</div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Per-column breakdown toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", textAlign: "left", padding: "6px 10px", background: "#18181b", borderTop: "1px solid #27272a", color: "#a1a1aa", fontSize: 11, cursor: "pointer" }}
      >
        {open ? "▲ Hide column details" : "▼ Show column details"}
      </button>

      {open ? (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {cols.map(([col, c]) => (
            <div key={col} style={{ padding: "5px 10px", borderTop: "1px solid #27272a", display: "grid", gap: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="mono" style={{ color: "#d4d4d8", fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{col}</span>
                <span style={{ fontSize: 10, color: c.null_pct >= 20 ? "#f87171" : c.null_pct >= 5 ? "#fbbf24" : c.null_pct > 0 ? "#d97706" : "#71717a" }}>
                  {c.null_pct}% null
                </span>
              </div>
              {/* Null bar: green = valid portion, red/amber/yellow = null portion */}
              <div style={{ height: 6, background: "#27272a", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                <div style={{ height: "100%", width: `${100 - Math.min(c.null_pct, 100)}%`, background: "#22c55e", transition: "width 300ms" }} />
                <div style={{ height: "100%", width: `${Math.min(c.null_pct, 100)}%`, background: c.null_pct >= 20 ? "#ef4444" : c.null_pct >= 5 ? "#f59e0b" : c.null_pct > 0 ? "#92400e" : "transparent", transition: "width 300ms" }} />
              </div>
              {/* Numeric extras */}
              {c.min !== undefined ? (
                <div style={{ fontSize: 10, color: "#71717a", display: "flex", gap: 8 }}>
                  <span>min {c.min}</span><span>max {c.max}</span><span>mean {c.mean}</span>
                  {(c.outlier_count ?? 0) > 0 ? <span style={{ color: "#f87171" }}>{c.outlier_count} outliers</span> : null}
                </div>
              ) : null}
              {/* Categorical top values */}
              {c.top_values && c.top_values.length > 0 ? (
                <div style={{ fontSize: 10, color: "#71717a", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {c.top_values.slice(0, 3).map((tv, tvi) => {
                    const v = String(tv.value ?? "");
                    return (
                      <span key={tvi} style={{ background: "#1f1f22", borderRadius: 4, padding: "1px 5px" }}>
                        {v.length > 12 ? v.slice(0, 11) + "…" : v} ({tv.count})
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type Message = ConversationMessage & {
  id: string;
  transformation?: TransformationPayload;
  stepStatus?: "pending" | "applying" | "applied" | "discarded";
  plan?: PlanStep[];
  planType?: "linear" | "dag";
  planPending?: boolean;
  planApproved?: boolean;
  planRejected?: boolean;
  tileCreated?: TileCreatedData;
  artifactUrl?: string;
  queryResults?: Array<Record<string, unknown>>;
  sessionTableName?: string;
  /** When set, render this short English description instead of any data table
   *  for write-op step results (clean / filter / transform / pivot / union / reconcile).
   *  The full preview is shown in the Data tab — the chat just summarises what changed. */
  stepSummary?: string;
  dataProfile?: DataProfile;
  qualityIssues?: QualityIssue[];
  followUpChips?: string[];
  isClarification?: boolean;
  /** When set, render a "View Dashboard →" link card after auto-run dashboard generation */
  generatedDashboard?: { dashboard_id: string };
  /** Execution progress card — mutated in-place as pipeline steps run */
  execSteps?: ExecStep[];
  execDone?: boolean;
  /** Goal completion report — rendered as AutoGoalReport component */
  goalReport?: {
    rules_satisfied: number;
    rules_failed: number;
    rules_skipped: number;
    total_rules: number;
    duration_seconds: number;
  };
};

interface AIPanelProps {
  dataset: Dataset | null;
  projectId: string;
  width?: number;
  onStepApplied: () => void;
  onDatasetMutated?: () => void;
  /** Called after a write-op completes with a 50-row preview of the resulting table */
  onSessionPreview?: (rows: Record<string, unknown>[], columns: string[]) => void;
  /** Opens the import/upload modal (wired from WorkspacePage) */
  onUploadClick?: () => void;
  /** Fired once when the user receives their first AI answer (activation aha moment) */
  onFirstAiAnswer?: (meta?: { hadError: boolean }) => void;
  /** Fired once when the user submits their first AI prompt */
  onFirstPrompt?: () => void;
  /** Pipeline step selected in the graph — provides context to the next message */
  selectedPipelineStep?: { id: string; stepNumber: number; operation: string; description: string; rowsBefore?: number; rowsAfter?: number } | null;
  /** Called to clear the pipeline step selection */
  onStepDeselect?: () => void;
  /** Current workspace mode — used for tab-context guidance */
  mode?: WorkspaceMode;
}

export function AIPanel({ dataset, projectId, width, onStepApplied, onDatasetMutated, onSessionPreview, onUploadClick, onFirstAiAnswer, onFirstPrompt, selectedPipelineStep, onStepDeselect, mode }: AIPanelProps) {
  const { addStep, steps, liveArtifact, setLiveArtifact, pendingForkParentStepId } = usePipelineContext();
  const { setActiveDataset, activeLanes } = useWorkspaceContext();
  const { executeTransformation } = usePipeline();
  const { sendMessage, sending, resetSession, cancelMessage, restoreSession, saveHistory, sessionId, sessionIdRef } = useChatSession();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [aiMode, setAiMode] = useState<"chat" | "auto">("chat");
  const [autoGoal, setAutoGoal] = useState("");
  const [editHoverId, setEditHoverId] = useState<string | null>(null);
  /** IDs of secondary datasets to include in the next message */
  const [secondaryDatasetIds, setSecondaryDatasetIds] = useState<string[]>([]);
  const [showSecondaryPicker, setShowSecondaryPicker] = useState(false);
  const lastSentInputRef = useRef<string>("");
  const [savingVizIds, setSavingVizIds] = useState<Set<string>>(new Set());
  const [savedVizIds, setSavedVizIds] = useState<Set<string>>(new Set());
  const [savingCheckpointIds, setSavingCheckpointIds] = useState<Set<string>>(new Set());
  const [savedCheckpointIds, setSavedCheckpointIds] = useState<Set<string>>(new Set());
  const [analyzingDataset, setAnalyzingDataset] = useState(false);
  const [columnSchema, setColumnSchema] = useState<ColSchema[]>([]);
  const [currentStepInfo, setCurrentStepInfo] = useState<{ stepNumber: number; operation: string; totalSteps: number } | null>(null);
  const [isAwaitingExecution, setIsAwaitingExecution] = useState(false);
  const [showAllRowsIds, setShowAllRowsIds] = useState<Set<string>>(new Set());
  // Tracks dataset IDs that have already been auto-analyzed on first load
  const autoQualityRunRef = useRef<Set<string>>(new Set());
  // Stable ref to the latest runDataQualityReport so setTimeout doesn't
  // capture a stale closure where liveArtifact is still null from mount.
  const runQualityRef = useRef<() => Promise<void>>();
  // Guard: fire onFirstAiAnswer only once per component lifetime
  const firstAiAnswerFiredRef = useRef(false);
  // Guard: fire onFirstPrompt only once per component lifetime
  const firstPromptFiredRef = useRef(false);
  // Counter: how many AI transformations have completed this session
  const aiTransformCountRef = useRef(0);

  // Fetch typed column schema whenever the active dataset changes
  useEffect(() => {
    if (!dataset?.id) { setColumnSchema([]); return; }
    let cancelled = false;
    api.get<{ columns: ColSchema[] }>(`/datasets/${dataset.id}/schema`)
      .then((r) => { if (!cancelled) setColumnSchema(r.data.columns ?? []); })
      .catch(() => { if (!cancelled) setColumnSchema([]); });
    return () => { cancelled = true; };
  }, [dataset?.id]);

  // Restore chat history from DB when the dataset changes
  useEffect(() => {
    if (!dataset?.id) return;
    const storedId = localStorage.getItem(`datahub_chat_session_${dataset.id}`);
    if (!storedId) return;
    // Restore session ID synchronously so it's available for sendMessage
    // immediately — don't wait for the async chat history fetch.
    restoreSession(storedId);
    let cancelled = false;
    const token = getAuthToken();
    fetch(`/api/chat/sessions/${storedId}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { data?: { messages?: Array<{ role: string; content: string | null }> } } | null) => {
        if (cancelled || !json?.data?.messages?.length) return;
        setMessages(
          json.data.messages.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role as "user" | "assistant",
            content: m.content ?? "",
          }))
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id]);

  const { state: autoState, start: startAutoRun, resume: resumeAutoRun, cancel: cancelAutoRun, approvePlan: approveAutoPlan, reset: resetAutoRun } = useAutoRunSession();


  // Press "/" anywhere (when not typing in an input) to focus the AI input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      textareaRef.current?.focus();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Focus textarea when DashboardCanvas "Ask AI" CTA is clicked
  useEffect(() => {
    const handler = () => requestAnimationFrame(() => textareaRef.current?.focus());
    window.addEventListener("datahub:ai:focus", handler);
    return () => window.removeEventListener("datahub:ai:focus", handler);
  }, []);

  const history = useMemo<ConversationMessage[]>(() => messages.map(({ role, content }) => ({ role, content })), [messages]);

  const handleAgentEvent = (event: AgentEvent) => {
    switch (event.type) {
      case "agent.plan": {
        const rawPlan = (event.plan as PlanStep[] | undefined) || [];
        // Defense-in-depth: sanitize the plan payload at the boundary so
        // PlanDAG / PlanCard never receive malformed step_number / depends_on.
        // (Backend planner is the primary source of truth — see planner.py
        // depends_on sanitizer — but stale in-flight responses or future
        // regressions could still emit holes/forward-refs that crash the
        // sparse-array depth grouping.)
        const validNumbers = new Set<number>();
        const cleanedPlan: PlanStep[] = [];
        for (const step of rawPlan) {
          if (!step || typeof step !== "object") continue;
          const sn = Number((step as Record<string, unknown>).step_number);
          if (!Number.isInteger(sn) || sn <= 0) continue;
          validNumbers.add(sn);
          cleanedPlan.push(step);
        }
        const plan: PlanStep[] = cleanedPlan.map((step) => {
          const sn = Number((step as Record<string, unknown>).step_number);
          const rawDeps = (step as Record<string, unknown>).depends_on;
          const deps = Array.isArray(rawDeps)
            ? rawDeps
                .map((d) => Number(d))
                .filter((d) => Number.isInteger(d) && d > 0 && d < sn && validNumbers.has(d))
            : [];
          return { ...step, depends_on: deps } as PlanStep;
        });
        const planType = (event.plan_type as "linear" | "dag" | undefined) ?? "linear";
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Here's my plan:",
            plan,
            planType,
            planPending: true,
            planApproved: false,
          },
        ]);
        break;
      }
      case "agent.done": {
        setCurrentStepInfo(null);
        setIsAwaitingExecution(false);
        const responseText = typeof event.response === "string" ? event.response : "Done.";
        const doneIntent = typeof event.intent === "string" ? event.intent : "transform";
        // Short-circuit for clarification — no execution happened, just show the question
        if (doneIntent === "clarify") {
          setMessages((previous) => [
            ...previous,
            {
              id: crypto.randomUUID(),
              role: "assistant" as const,
              content: responseText,
              isClarification: true,
            },
          ]);
          break;
        }

        const runId = typeof event.run_id === "string" ? event.run_id : null;
        const runSteps = Array.isArray(event.run_steps)
          ? (event.run_steps as Array<Record<string, unknown>>)
          : [];
        const pipelineSteps = Array.isArray(event.pipeline_steps)
          ? (event.pipeline_steps as Array<Record<string, unknown>>)
          : [];
        const completedSteps = runSteps.length > 0
          ? runSteps
          : runId
            ? pipelineSteps.filter((step) => {
                const agentRunId = step.agent_run_id;
                const stepRunId = step.run_id;
                return (
                  (typeof agentRunId === "string" && agentRunId === runId)
                  || (typeof stepRunId === "string" && stepRunId === runId)
                );
              })
            : [];

        const sortedCompletedSteps = [...completedSteps].sort((a, b) => {
          const left = Number(a.step_number ?? 0);
          const right = Number(b.step_number ?? 0);
          return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
        });
        const lastCompletedStep = sortedCompletedSteps.length
          ? sortedCompletedSteps[sortedCompletedSteps.length - 1]
          : null;

        const finalOutputDatasetIdFromEvent = typeof event.output_dataset_id === "string" ? event.output_dataset_id : "";
        const finalOutputDatasetIdFromSteps = lastCompletedStep && typeof lastCompletedStep.output_dataset_id === "string"
          ? lastCompletedStep.output_dataset_id
          : "";
        const finalOutputDatasetId = finalOutputDatasetIdFromEvent || finalOutputDatasetIdFromSteps;

        const maxStepNumber = sortedCompletedSteps.reduce((max, step) => {
          const stepNum = Number(step.step_number ?? 0);
          return Number.isFinite(stepNum) ? Math.max(max, stepNum) : max;
        }, 0);

        for (const stepRecord of sortedCompletedSteps) {
          const operation = String(stepRecord.operation ?? "transform");
          const description = String(stepRecord.description ?? "Execute transformation step");
          const sql = typeof stepRecord.sql === "string" ? stepRecord.sql : undefined;
          const stepNumber = Number(stepRecord.step_number ?? Date.now());
          const rawRows = stepRecord.rows_affected;
          const numericRows = typeof rawRows === "number"
            ? rawRows
            : Number.isFinite(Number(rawRows))
              ? Number(rawRows)
              : undefined;
          const affectedRows = numericRows !== undefined ? String(numericRows) : undefined;

          const inputDatasetId = typeof stepRecord.input_dataset_id === "string"
            ? stepRecord.input_dataset_id
            : dataset?.id;
          const outputDatasetId = typeof stepRecord.output_dataset_id === "string"
            ? stepRecord.output_dataset_id
            : undefined;
          const isFinalStep = maxStepNumber > 0 ? stepNumber === maxStepNumber : true;
          const effectiveOutputDatasetId = (
            isFinalStep && finalOutputDatasetId
              ? finalOutputDatasetId
              : outputDatasetId
          );
          const hasDerivedOutput = Boolean(
            effectiveOutputDatasetId
            && effectiveOutputDatasetId !== inputDatasetId
            && effectiveOutputDatasetId !== dataset?.id
          );

          // Truncate long AI-generated descriptions so pipeline step labels
          // and artifact names stay short and readable (max 40 chars).
          const shortDescription = description.length > 40
            ? `${description.slice(0, 38)}\u2026`
            : description;
          // Build a concise artifact output name: "<operation>: <short desc>"
          const opLabel = operation.replace(/_/g, " ");
          const rawArtifactName = `${opLabel}: ${shortDescription}`;
          const shortArtifactName = rawArtifactName.length > 40
            ? `${rawArtifactName.slice(0, 38)}\u2026`
            : rawArtifactName;
          addStep({
            id: crypto.randomUUID(),
            stepNumber,
            operation,
            description: shortDescription,
            sql,
            affectedRows,
            appliedAt: new Date(),
            rawConfig: stepRecord,
            output_table: typeof stepRecord.output_table === "string" ? stepRecord.output_table : undefined,
            input_tables: Array.isArray(stepRecord.input_tables) ? (stepRecord.input_tables as string[]) : undefined,
            inputDataset: dataset
              ? {
                  id: inputDatasetId || dataset.id,
                  name: dataset.name,
                  rows: dataset.rows,
                }
              : undefined,
            outputDataset: hasDerivedOutput && isFinalStep
              ? {
                  id: effectiveOutputDatasetId!,
                  name: shortArtifactName,
                  rowCount: numericRows ?? 0,
                  parentId: inputDatasetId ?? null,
                }
              : undefined,
          });
        }

        if (sortedCompletedSteps.length > 0) {
          onStepApplied();
        }

        if (finalOutputDatasetId) {
          if (dataset?.id !== finalOutputDatasetId) {
            const finalStep = sortedCompletedSteps.find((step) => Number(step.step_number ?? 0) === maxStepNumber) ?? lastCompletedStep;
            const finalRowsRaw = finalStep?.rows_affected;
            const finalRows = typeof finalRowsRaw === "number"
              ? finalRowsRaw
              : Number.isFinite(Number(finalRowsRaw))
                ? Number(finalRowsRaw)
                : 0;
            const rawName = finalStep?.description ? String(finalStep.description) : "AI Output";
            const shortName = rawName.length > 40 ? `${rawName.slice(0, 38)}\u2026` : rawName;
            setActiveDataset({
              id: finalOutputDatasetId,
              name: shortName,
              rows: finalRows,
            });
          }
          onDatasetMutated?.();
        }

        // Extract tile_created from execution_results (where the backend actually puts it)
        let tileCreatedData: TileCreatedData | undefined;

        const executionResults = Array.isArray(event.execution_results)
          ? (event.execution_results as Array<Record<string, unknown>>)
          : [];

        // Also check sortedCompletedSteps as fallback for backwards compatibility
        const allStepsToCheck = [...executionResults, ...sortedCompletedSteps];

        for (const step of allStepsToCheck) {
          const tc = step.tile_created as Record<string, unknown> | undefined;
          if (tc && tc.echarts_config && tc.saveable) {
            tileCreatedData = {
              chart_id: String(tc.chart_id ?? crypto.randomUUID()),
              title: String(tc.title ?? "Chart"),
              chart_type: String(tc.chart_type ?? "bar"),
              echarts_config: tc.echarts_config as Record<string, unknown>,
              source_table: tc.source_table ? String(tc.source_table) : undefined,
              saveable: true,
            };
            break; // take the first chart found
          }
        }

        // Build context-aware follow-up chips based on THIS run's completed steps only
        const followUpChips = buildFollowUpChips(doneIntent, sortedCompletedSteps, dataset);

        // Surface the 50-row preview from the last write-op step so the Canvas Data
        // tab can show the transformed data without a full dataset reload.
        const SESSION_WRITE_OPS = new Set(["clean", "filter", "transform", "pivot", "union", "reconcile", "summarise"]);
        const lastWriteResult = [...executionResults].reverse().find((r) =>
          SESSION_WRITE_OPS.has(String(r.operation ?? ""))
        );
        if (lastWriteResult && onSessionPreview) {
          const previewRows = Array.isArray(lastWriteResult.query_results)
            ? (lastWriteResult.query_results as Record<string, unknown>[])
            : [];
          if (previewRows.length > 0 && previewRows[0]) {
            const previewColumns = Object.keys(previewRows[0]);
            onSessionPreview(previewRows, previewColumns);
          }
        }
        // Track the live in-session table so the sidebar can show a "LIVE" entry
        if (lastWriteResult && sessionId) {
          const tableName = String(lastWriteResult.session_table_name ?? lastWriteResult.output_table ?? "");
          const rowCount = Number(lastWriteResult.row_count_after ?? lastWriteResult.rows_affected ?? 0);
          const stepLabel = String(lastWriteResult.description ?? lastWriteResult.operation ?? "transform");
          if (tableName) setLiveArtifact({ tableName, rowCount, stepLabel, sessionId });
        }

        setMessages((previous) => {
          // Mark the ExecutionProgressCard as done if it exists
          const withDoneCard = previous.map((m) =>
            m.id === "execution_progress_card" ? { ...m, execDone: true } : m
          );
          return [
            ...withDoneCard,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: responseText,
              tileCreated: tileCreatedData,
              followUpChips,
            },
          ];
        });
        // Persist conversation to DB so it survives page reloads
        if (dataset?.id) {
          const historyToSave = [
            ...history,
            { role: "assistant" as const, content: responseText },
          ];
          void saveHistory(dataset.id, historyToSave);
        }
        // Track every AI transformation (not just the first) for lifecycle analytics
        if (sortedCompletedSteps.length > 0) {
          aiTransformCountRef.current += 1;
          const now = new Date().toISOString();
          const isFirst = aiTransformCountRef.current === 1;
          recordMilestone("ai_transformation_completed", {
            step_count: sortedCompletedSteps.length,
            intent: doneIntent,
            // PostHog person properties
            $set: { last_ai_transform_at: now, ...(isFirst && { is_activated_user: true }), ...(aiTransformCountRef.current >= 2 && { is_active_user: true }) },
            $set_once: { first_ai_transform_at: now },
            $add: { total_ai_transforms: 1 },
          });
        }
        // Fire aha milestone once per component lifetime
        if (!firstAiAnswerFiredRef.current && onFirstAiAnswer) {
          firstAiAnswerFiredRef.current = true;
          // Detect whether any executed step failed so the caller can suppress
          // the celebration overlay on errors (e.g. SQL binder error).
          const hadError = executionResults.some((r) => {
            const ok = (r as { success?: unknown }).success;
            const err = (r as { error?: unknown }).error;
            return ok === false || (typeof err === "string" && err.trim().length > 0);
          });
          onFirstAiAnswer({ hadError });
        }
        break;
      }
      case "agent.step.done": {
        // Mutate the existing ExecutionProgressCard in-place — no new bubble spawned
        const stepNum = typeof event.step === "number" ? event.step : null;
        const opName = typeof event.operation === "string" ? event.operation : "step";
        const rowsBefore = typeof event.row_count_before === "number" ? event.row_count_before : null;
        const rowsAfter = typeof event.row_count_after === "number" ? event.row_count_after : null;
        const execMs = typeof event.execution_time_ms === "number" ? event.execution_time_ms : null;
        setMessages((previous) => previous.map((m) => {
          if (!m.execSteps) return m;
          return {
            ...m,
            execSteps: m.execSteps.map((s) =>
              s.stepNumber === stepNum
                ? { ...s, status: "done" as const, rowsBefore, rowsAfter, execMs }
                : s
            ),
          };
        }));
        break;
      }
      case "agent.step.error": {
        const stepNum = typeof event.step === "number" ? event.step : null;
        const errMsg = typeof event.error === "string" ? event.error : "Unknown error";
        setMessages((previous) => previous.map((m) => {
          if (!m.execSteps) return m;
          return {
            ...m,
            execSteps: m.execSteps.map((s) =>
              s.stepNumber === stepNum
                ? { ...s, status: "error" as const, errorMsg: errMsg }
                : s
            ),
          };
        }));
        break;
      }
      case "agent.error": {
        setCurrentStepInfo(null);
        setIsAwaitingExecution(false);
        // Use the raw backend message for agent.error events — they are already
        // concise server-side strings. Only fall through humaniseError for
        // network-layer errors (handled in the catch block below).
        const errorText = typeof event.error === "string" && event.error.trim()
          ? event.error.trim()
          : "The AI agent encountered an unexpected error. Please try again.";
        capture("ai_error", { error_type: "agent.error", message: errorText.slice(0, 200) });
        // Session-expired errors are routed through ErrorBubble so the user gets
        // a retry button. The DB-backed session replay in context_loader will
        // automatically reconstruct the DuckDB tables on the next request.
        const isSessionExpired = /session has expired|session.*expired|expired.*session/i.test(errorText);
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: isSessionExpired ? `Error: ${errorText}` : errorText,
          },
        ]);
        break;
      }
      case "ping": {
        // Server-sent keep-alive — silently ignore.
        break;
      }
      case "agent.goal.parsed": {
        // Emitted when a multi-rule goal is detected and parsed
        const summary = typeof event.goal_summary === "string" ? event.goal_summary : "";
        const total = typeof event.total_rules === "number" ? event.total_rules : 0;
        if (summary) {
          setMessages((previous) => [
            ...previous,
            {
              id: crypto.randomUUID(),
              role: "assistant" as const,
              content: `⚒ Identified ${total} rule${total !== 1 ? "s" : ""}: “${summary}”`,
            },
          ]);
        }
        break;
      }
      case "agent.clarify": {
        // pre_plan_clarifier needs more info before it can plan
        const question = typeof event.question === "string" ? event.question : "Could you clarify your request?";
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: question,
            isClarification: true,
          },
        ]);
        break;
      }
      case "agent.goal.report": {
        // Render AutoGoalReport component instead of plain text
        const satisfied = typeof event.rules_satisfied === "number" ? event.rules_satisfied : 0;
        const failed = typeof event.rules_failed === "number" ? event.rules_failed : 0;
        const skipped = typeof event.rules_skipped === "number" ? event.rules_skipped : 0;
        const total = typeof event.total_rules === "number" ? event.total_rules : 0;
        const secs = typeof event.duration_seconds === "number" ? event.duration_seconds : 0;
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: "",
            goalReport: { rules_satisfied: satisfied, rules_failed: failed, rules_skipped: skipped, total_rules: total, duration_seconds: secs },
          },
        ]);
        break;
      }
      case "agent.dashboard.generated": {
        const dashId = typeof event.dashboard_id === "string" ? event.dashboard_id : "";
        if (!dashId) break;
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: "",
            generatedDashboard: { dashboard_id: dashId },
          },
        ]);
        break;
      }
      case "agent.rule.validated": {
        // Per-rule validation tick — show compact inline progress
        const ruleId = event.rule_id != null ? `Rule ${event.rule_id as number}` : "Rule";
        const passed = event.passed === true;
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: `${passed ? "✔" : "✘"} ${ruleId} ${passed ? "satisfied" : "failed"}`,
          },
        ]);
        break;
      }
      case "column_added": {
        onDatasetMutated?.();
        break;
      }
      case "tile_created": {
        // Chart rendered inline — no external event needed
        const tc = event as unknown as Record<string, unknown>;
        if (tc.echarts_config && tc.saveable) {
          const tileData: TileCreatedData = {
            chart_id: String(tc.chart_id ?? crypto.randomUUID()),
            title: String(tc.title ?? "Chart"),
            chart_type: String(tc.chart_type ?? "bar"),
            echarts_config: tc.echarts_config as Record<string, unknown>,
            source_table: tc.source_table ? String(tc.source_table) : undefined,
            saveable: true,
          };
          setMessages((previous) => {
            // Attach to the last assistant message if it exists, otherwise create one
            const last = [...previous].reverse().find((m) => m.role === "assistant");
            if (last) {
              return previous.map((m) =>
                m.id === last.id ? { ...m, tileCreated: tileData } : m
              );
            }
            return [
              ...previous,
              {
                id: crypto.randomUUID(),
                role: "assistant" as const,
                content: "Here's your chart:",
                tileCreated: tileData,
              },
            ];
          });
        }
        break;
      }
      case "agent.artifact": {
        const url = typeof event.artifact_url === "string" ? event.artifact_url : null;
        if (url) {
          setMessages((previous) => [
            ...previous,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "Export ready — click to download:",
              artifactUrl: url,
            },
          ]);
        } else if (typeof event.artifact_s3_key === "string") {
          const tableName = typeof event.table_name === "string" ? event.table_name : "table";
          const rowCount = typeof event.row_count === "number" ? event.row_count : null;
          const label = rowCount !== null ? `${rowCount} row${rowCount !== 1 ? "s" : ""}` : "saved";
          setMessages((previous) => [
            ...previous,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `✓ Saved: ${tableName} (${label})`,
            },
          ]);
        }
        // Always refresh — both export URLs and S3-key artifacts should
        // update the ArtifactsSection and dataset list immediately.
        onDatasetMutated?.();
        break;
      }
      case "agent.query_results": {
        const results = Array.isArray(event.results)
          ? (event.results as Array<Record<string, unknown>>)
          : [];
        if (results.length > 0) {
          const opLabel = typeof event.operation === "string" ? event.operation : "Results";
          const sessionTableName = typeof event.session_table_name === "string" ? event.session_table_name : undefined;
          const WRITE_OPS = new Set(["clean", "filter", "transform", "pivot", "union", "reconcile"]);
          const isWriteOp = WRITE_OPS.has(String(event.operation ?? ""));
          const description = typeof event.description === "string" ? event.description.trim() : "";
          const rowCountAfter = event.row_count_after != null ? Number(event.row_count_after) : null;
          const rowCountBefore = event.row_count_before != null ? Number(event.row_count_before) : null;
          const rowsChangedRaw = event.rows_changed != null ? Number(event.rows_changed) : null;

          // For data-changing steps the user can already see the result in the
          // Data tab — dumping the rows back into chat is redundant. Show a
          // short English summary instead.
          const buildSummary = (): string => {
            const fmt = (n: number | null) => (n != null ? n.toLocaleString() : null);
            const after = fmt(rowCountAfter);
            const before = fmt(rowCountBefore);
            const changed = fmt(rowsChangedRaw);
            let metric = "";
            if (changed != null) metric = `${changed} row${rowsChangedRaw === 1 ? "" : "s"} affected`;
            else if (after != null && before != null && rowCountBefore !== rowCountAfter) metric = `${before} → ${after} rows`;
            else if (after != null) metric = `${after} rows`;
            const base = description || `${opLabel} step applied.`;
            return metric ? `${base} (${metric})` : base;
          };

          if (isWriteOp) {
            setMessages((previous) => [
              ...previous,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: buildSummary(),
                stepSummary: buildSummary(),
                sessionTableName,
              },
            ]);
          } else {
            setMessages((previous) => [
              ...previous,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: `${opLabel} (${results.length} row${results.length !== 1 ? "s" : ""}):`,
                queryResults: results,
                sessionTableName,
              },
            ]);
          }
          // Push transformed preview to the Canvas Data tab for write operations.
          // agent.done never carries execution_results, so this is the correct hook.
          if (isWriteOp && onSessionPreview && results.length > 0 && results[0]) {
            onSessionPreview(results, Object.keys(results[0]));
          }
          // Set the LIVE artifact entry so the sidebar shows the editable save card.
          // Use row_count_after from the server for the true total — results[] is
          // capped at 50 rows (preview), so results.length is NOT the full count.
          if (sessionTableName && isWriteOp) {
            const currentSid = sessionIdRef.current || sessionId;
            if (currentSid) {
              const actualRowCount = Number(
                event.row_count_after ?? event.total_rows ?? event.rows_affected ?? results.length
              );
              const rowsChanged = rowsChangedRaw != null ? rowsChangedRaw : undefined;
              setLiveArtifact({ tableName: sessionTableName, rowCount: actualRowCount, stepLabel: opLabel, sessionId: currentSid, rowsChanged });
            }
          }
        }
        break;
      }
      case "agent.step.start": {
        setIsAwaitingExecution(false);
        const stepNumber = Number(event.step_number ?? 0);
        const operation = typeof event.operation === "string" ? event.operation : "";
        const totalSteps = Number(event.total_steps ?? 0);
        setCurrentStepInfo({ stepNumber, operation, totalSteps });
        // Create or update the ExecutionProgressCard message
        setMessages((previous) => {
          const cardIdx = previous.findIndex((m) => m.id === "execution_progress_card");
          const newStep: ExecStep = { stepNumber, operation, totalSteps, status: "running" };
          if (cardIdx >= 0) {
            // Add step to existing card (avoid duplicate stepNumber)
            const existing = previous[cardIdx];
            const steps = (existing.execSteps ?? []).filter((s) => s.stepNumber !== stepNumber);
            return previous.map((m) =>
              m.id === "execution_progress_card"
                ? { ...m, execSteps: [...steps, newStep], execDone: false }
                : m
            );
          }
          // First step.start — create the card
          return [
            ...previous,
            {
              id: "execution_progress_card",
              role: "assistant" as const,
              content: "",
              execSteps: [newStep],
              execDone: false,
            },
          ];
        });
        break;
      }
      default:
        break;
    }
  };

  const handleSaveCheckpoint = async (messageId: string, tableName: string) => {
    if (!sessionId || savingCheckpointIds.has(messageId) || savedCheckpointIds.has(messageId)) return;
    setSavingCheckpointIds((prev) => new Set([...prev, messageId]));
    try {
      const res = await api.post("/artifacts/save-checkpoint", { session_id: sessionId, table_name: tableName, artifact_name: tableName }, {
        headers: { "Content-Type": "application/json" },
      });
      if (res.status < 200 || res.status >= 300) throw new Error(String(res.data));
      setSavedCheckpointIds((prev) => new Set([...prev, messageId]));
      onDatasetMutated?.();
    } catch (err) {
      console.error("Save checkpoint failed:", err);
    } finally {
      setSavingCheckpointIds((prev) => { const n = new Set(prev); n.delete(messageId); return n; });
    }
  };

  // ── Tab-context keyword intercepts ─────────────────────────────────────────
  const DATA_OP_RE = /\b(filter|sort|clean|transform|merge|join|drop|rename|fill\s*null|group\s*by|aggregate|pivot)\b/i;
  const CHART_RE   = /\b(chart|visuali[sz]|dashboard|plot|bar chart|line chart|pie chart|scatter)\b/i;
  const SCHED_RE   = /\b(schedule|automate|run pipeline|pipeline run|auto.?run)\b/i;

  const handleSend = async (text?: string, approvePlan?: boolean, pendingPlan?: PlanStep[], isPlanModification?: boolean) => {
    if (!dataset) return;
    const rawContent = (text || input).trim();

    // ── Tab-separation intercept: catch obvious cross-tab requests ──────────
    if (rawContent && !approvePlan) {
      let redirectMsg: string | null = null;
      if (mode === "dashboard" && DATA_OP_RE.test(rawContent)) {
        redirectMsg = "Data operations (filter, transform, clean, etc.) belong in the **Data tab** — switch there to edit your dataset, then return here to visualize the results.";
      } else if (mode === "pipeline" && CHART_RE.test(rawContent)) {
        redirectMsg = "Charts and visualizations are created in the **Dashboard tab** — switch there and ask the AI to create a visualization from your data.";
      } else if (mode === "data" && SCHED_RE.test(rawContent)) {
        redirectMsg = "Scheduling and pipeline automation are in the **Pipeline tab** — switch there to configure your schedule and run settings.";
      }
      if (redirectMsg) {
        setInput("");
        setMessages((previous) => [
          ...previous,
          { id: crypto.randomUUID(), role: "user", content: rawContent },
          { id: crypto.randomUUID(), role: "assistant", content: redirectMsg },
        ]);
        return;
      }
    }

    // Prepend tab context so the backend AI knows which tab the user is on
    const tabPrefix = mode ? `[workspace_tab:${mode}] ` : "";
    // Prepend selected pipeline step context if set
    const content = rawContent && selectedPipelineStep && !approvePlan
      ? `${tabPrefix}[Selected pipeline step ${selectedPipelineStep.stepNumber} — ${selectedPipelineStep.operation}]: ${rawContent}`
      : rawContent
        ? `${tabPrefix}${rawContent}`
        : rawContent;
    if (!content && !approvePlan) return;

    if (content && !approvePlan) {
      setCurrentStepInfo(null);
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "user", content: rawContent },
      ]);
      lastSentInputRef.current = rawContent;
      if (selectedPipelineStep) onStepDeselect?.();
      capture("ai_message_sent", { dataset_id: dataset.id });
      if (!firstPromptFiredRef.current && onFirstPrompt) {
        firstPromptFiredRef.current = true;
        onFirstPrompt();
      }
    }
    setInput("");

    try {
      // Phase 2 fork: if the user just clicked ⫰ on step N, truncate the
      // pipeline_steps payload to the ancestor chain ending at step N so the
      // backend agent treats step N's output as the current data state.
      // Without this the agent sees the trunk leaf and operates on its data.
      const stepsForBackend = (() => {
        if (!pendingForkParentStepId) return steps;
        const idx = steps.findIndex((s) => s.id === pendingForkParentStepId);
        return idx >= 0 ? steps.slice(0, idx + 1) : steps;
      })();

      await sendMessage({
        message: content,
        dataset_id: dataset.id,
        project_id: projectId,
        secondary_dataset_ids: secondaryDatasetIds.length > 0 ? secondaryDatasetIds : undefined,
        conversation_history: [...history, ...(content && !approvePlan ? [{ role: "user" as const, content }] : [])],
        pipeline_steps: stepsForBackend.map((step) => ({
          step_number: step.stepNumber,
          operation: step.operation,
          description: step.description,
          sql: step.sql,
          rows_affected: step.affectedRows,
          output_table: step.output_table,
        })),
        plan_approved: approvePlan ?? false,
        plan_pending_modification: isPlanModification ?? false,
        pending_plan: pendingPlan,
        onEvent: handleAgentEvent,
      });
    } catch (error: unknown) {
      const humanised = humaniseError(error);
      capture("ai_error", { error_type: "send_failed", retryable: isRetryableError(error) });
      setIsAwaitingExecution(false);
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "assistant", content: `Error: ${humanised}` },
      ]);
    }
  };

  // Keep a ref to the latest handleSend so window event listeners (registered
  // once) always call the current closure. Used by the cross-dataset drill-through
  // flow: DataTable cell click → WorkspacePage switches active dataset →
  // dispatches "datahub:chat:send-prompt" with the filter prompt.
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string; datasetId?: string }>).detail;
      const prompt = detail?.prompt?.trim();
      if (!prompt) return;
      // If the event targets a specific dataset, ignore it unless we ARE that dataset.
      if (detail?.datasetId && dataset?.id && detail.datasetId !== dataset.id) return;
      setInput(prompt);
      void handleSendRef.current(prompt);
    };
    window.addEventListener("datahub:chat:send-prompt", handler);
    return () => window.removeEventListener("datahub:chat:send-prompt", handler);
  }, [dataset?.id]);

  const handleCancel = () => {
    cancelMessage();
    const restored = lastSentInputRef.current;
    if (restored) {
      setInput(restored);
      setMessages((prev) => {
        const lastUserIdx = prev.reduce((acc, m, i) => (m.role === "user" ? i : acc), -1);
        return lastUserIdx >= 0 ? prev.slice(0, lastUserIdx) : prev;
      });
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const approvePlan = () => {
    const latestUserPrompt = [...messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.content
      ?.trim() || "";

    // Collect the pending plan steps from the plan message so the backend can
    // execute them without relying on in-process MemorySaver checkpoints.
    const pendingPlanSteps = messages
      .filter((m) => m.planPending && Array.isArray(m.plan))
      .flatMap((m) => m.plan ?? []);

    setMessages((previous) => previous.map((message) => (
      message.planPending
        ? { ...message, planPending: false, planApproved: true }
        : message
    )));
    recordMilestone("pipeline_step_approved");
    setIsAwaitingExecution(true);
    void handleSend(latestUserPrompt, true, pendingPlanSteps);
  };

  const rejectPlan = () => {
    setMessages((previous) => previous.map((message) => (
      message.planPending
        ? { ...message, planPending: false, planRejected: true }
        : message
    )));
  };

  const modifyPlan = (instruction: string) => {
    if (sending) return;
    const pendingPlanSteps = messages
      .filter((m) => m.planPending && Array.isArray(m.plan))
      .flatMap((m) => m.plan ?? []);
    // Mark the current pending plan as rejected so it turns red
    setMessages((previous) => previous.map((message) => (
      message.planPending
        ? { ...message, planPending: false, planRejected: true }
        : message
    )));
    void handleSend(instruction, false, pendingPlanSteps, true);
  };

  const applyStep = async (messageId: string, transformation: TransformationPayload) => {
    if (!dataset || !transformation.sql) return;
    setMessages((current) => current.map((msg) => (msg.id === messageId ? { ...msg, stepStatus: "applying" } : msg)));
    try {
      const response = await executeTransformation({
        dataset_id: dataset.id,
        sql: transformation.sql,
        operation: transformation.operation,
        description: transformation.description,
        affectedRows: transformation.affectedRows,
      });
      const outputDataset = response.result?.outputDataset;
      if (outputDataset?.id) {
        setActiveDataset({
          id: outputDataset.id,
          name: outputDataset.name,
          rows: outputDataset.rowCount,
        });
      }
      addStep({
        id: crypto.randomUUID(),
        stepNumber: Date.now(),
        operation: transformation.operation,
        description: transformation.description,
        sql: transformation.sql,
        affectedRows: transformation.affectedRows,
        appliedAt: new Date(),
        inputDataset: {
          id: dataset.id,
          name: dataset.name,
          rows: dataset.rows,
        },
        outputDataset: outputDataset
          ? {
              id: outputDataset.id,
              name: outputDataset.name,
              rowCount: outputDataset.rowCount,
              parentId: outputDataset.parentId,
            }
          : undefined,
      });
      setMessages((current) => current.map((msg) => (msg.id === messageId ? { ...msg, stepStatus: "applied" } : msg)));
      onStepApplied();
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: string } }; message?: string };
      const detail = maybeError.response?.data?.detail ?? maybeError.message ?? "Transformation failed.";
      setMessages((current) => current.map((msg) => (
        msg.id === messageId
          ? { ...msg, stepStatus: "pending", content: `${msg.content}\n\nApply failed: ${detail}` }
          : msg
      )));
    }
  };

  const discardStep = (messageId: string) => {
    setMessages((current) => current.map((msg) => (msg.id === messageId ? { ...msg, stepStatus: "discarded" } : msg)));
  };

  const runDataQualityReport = async () => {
    if (!dataset || analyzingDataset) return;
    setAnalyzingDataset(true);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: "📊 Run data quality report" },
    ]);
    try {
      // Determine the right dataset + session params for the quality report.
      // Priority: liveArtifact (restored or live) → steps rawConfig → raw dataset.
      let analyzeDatasetId = dataset.id;
      let analyzeBody: Record<string, unknown> = {};
      if (liveArtifact) {
        // Live DuckDB session — query the session view.
        // (After the v3 fix, liveArtifact ALWAYS carries a real session id;
        // the legacy "replayed" sentinel branch was removed.)
        analyzeBody = { session_id: liveArtifact.sessionId, table_name: liveArtifact.tableName };
      } else {
        // No liveArtifact — try to find session + output_table from steps.
        const currentSid = sessionIdRef.current || sessionId;
        const lastStep = [...steps].reverse().find((s) =>
          s.output_table
          || typeof s.rawConfig?.output_table === "string"
          || typeof s.rawConfig?.session_table_name === "string"
        );
        const tableName = lastStep?.output_table
          || (typeof lastStep?.rawConfig?.output_table === "string" ? lastStep.rawConfig.output_table as string : undefined)
          || (typeof lastStep?.rawConfig?.session_table_name === "string" ? lastStep.rawConfig.session_table_name as string : undefined);
        if (currentSid && tableName) {
          analyzeBody = { session_id: currentSid, table_name: tableName };
        }
      }
      const res = await api.post<{
        issues: unknown[];
        suggestions: unknown[];
        data_profile?: DataProfile;
        used_session_data?: boolean;
        session_fallback_reason?: string | null;
        error?: string;
      }>(`/cleaning/datasets/${analyzeDatasetId}/analyze`, analyzeBody);
      const profile = res.data.data_profile;
      const issues = (res.data.issues ?? []) as QualityIssue[];
      const issueCount = issues.length;
      const fallbackReason = res.data.session_fallback_reason || undefined;
      const baseContent = profile
        ? `Found ${issueCount} issue${issueCount !== 1 ? "s" : ""} in your dataset. Here is the data quality report:`
        : res.data.error ?? "Analysis complete.";
      // Surface a banner when the backend silently fell back to the raw dataset
      // because the session table could not be restored (the user's "I cleaned
      // this earlier but the report shows the original" failure mode).
      const content = fallbackReason
        ? `⚠️ ${fallbackReason}\n\n${baseContent}`
        : baseContent;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          dataProfile: profile,
          qualityIssues: issueCount > 0 ? issues : undefined,
        },
      ]);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: `Error: ${detail ?? "Could not run analysis."}` },
      ]);
    } finally {
      setAnalyzingDataset(false);
    }
  };
  // Keep ref in sync so deferred callbacks always call the latest version.
  runQualityRef.current = runDataQualityReport;

  // Auto-trigger quality report for fresh datasets with no prior chat history
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dataset?.id || analyzingDataset) return;
    if (autoQualityRunRef.current.has(dataset.id)) return;
    // If there is stored history for this dataset, skip — user has prior context
    const storedId = localStorage.getItem(`datahub_chat_session_${dataset.id}`);
    if (storedId) return;
    autoQualityRunRef.current.add(dataset.id);
    // Small delay so any in-flight history restore can settle first
    const t = setTimeout(() => { void runQualityRef.current?.(); }, 800);
    return () => clearTimeout(t);
  }, [dataset?.id]); // intentionally omit runDataQualityReport — stable enough for one-shot

  // NOTE: A previous version of this file ran a 2-minute background interval
  // that silently POSTed `/api/artifacts/save-checkpoint` for the live session
  // table.  That was removed because it (a) created `autosave_*` DatasetMetaDB
  // rows that the user never asked for, polluting the workspace, and (b)
  // could materialise rows from a stale session that did NOT match the
  // current pipeline state.  Materialisation is now an explicit user action:
  // the "Save ↑" button on the live artifact in the Artifacts panel.

  return (
    <aside style={{ width: width ?? "var(--rw)", minWidth: width ?? 280, borderLeft: "1px solid var(--bd3)", background: "var(--bg2)", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <header style={{ height: 42, borderBottom: "1px solid var(--bd3)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", background: "var(--bg2)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
          <span className="badge-dot pulse" style={{ background: "var(--gr)", width: 7, height: 7 }} />
          <IconZap size={14} color="var(--ac)" />
          <span style={{ color: "var(--tx0)" }}>AI Agent</span>
          {/* Chat / Auto mode toggle */}
          <span style={{ display: "inline-flex", marginLeft: 6, border: "1px solid var(--bd2)", borderRadius: 999, overflow: "hidden", fontSize: 10 }}>
            <button
              onClick={() => setAiMode("chat")}
              style={{ padding: "2px 9px", background: aiMode === "chat" ? "var(--acl)" : "transparent", color: aiMode === "chat" ? "var(--ac)" : "var(--tx2)", border: "none", cursor: "pointer", fontWeight: aiMode === "chat" ? 700 : 400 }}
            >
              💬 Chat
            </button>
            <button
              onClick={() => setAiMode("auto")}
              style={{ padding: "2px 9px", background: aiMode === "auto" ? "var(--acl)" : "transparent", color: aiMode === "auto" ? "var(--ac)" : "var(--tx2)", border: "none", cursor: "pointer", fontWeight: aiMode === "auto" ? 700 : 400 }}
            >
              ⚡ Auto
            </button>
          </span>
        </span>
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center", minWidth: 0 }}>
          {/* Quality report button */}
          {dataset ? (
            <button
              className="btn"
              style={{ fontSize: 10, padding: "3px 7px", opacity: analyzingDataset ? 0.45 : 1, flexShrink: 0 }}
              onClick={() => { void runDataQualityReport(); }}
              disabled={analyzingDataset}
              title="Run data quality report"
            >
              {analyzingDataset ? "…" : <><span style={{ marginRight: 3, verticalAlign: "middle", display: "inline-flex" }}><IconBarChart size={12} /></span>Quality</>}
            </button>
          ) : null}

          <button className="btn" style={{ width: 28, padding: 0, flexShrink: 0 }} onClick={() => { if (dataset?.id) localStorage.removeItem(`datahub_chat_session_${dataset.id}`); setMessages([]); resetSession(); if (aiMode === "auto") { resetAutoRun(); setAutoGoal(""); } }} title="Clear conversation">
            <IconRefresh size={14} />
          </button>
        </span>
      </header>

      {/* ── Auto Mode Panel ──────────────────────────────────────────── */}
      {aiMode === "auto" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Goal input */}
          {autoState.status === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx1)" }}>⚡ Auto Mode — Goal-driven analytics</div>
              <div style={{ fontSize: 11, color: "var(--tx2)", lineHeight: 1.6 }}>
                Describe what you want to achieve and the AI will build, review, and execute a full pipeline automatically.
              </div>
              <textarea
                value={autoGoal}
                onChange={(e) => setAutoGoal(e.target.value)}
                placeholder='e.g. "Standardize all date columns to YYYY-MM-DD, remove duplicates, and fill nulls with median"'
                rows={3}
                style={{
                  width: "100%",
                  resize: "none",
                  border: "1px solid var(--bd2)",
                  borderRadius: "var(--r8)",
                  background: "var(--bg1)",
                  color: "var(--tx)",
                  padding: 8,
                  fontSize: 12,
                  boxSizing: "border-box",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && dataset) {
                    e.preventDefault();
                    if (autoGoal.trim()) {
                      void startAutoRun({ datasetId: dataset.id, projectId, goal: autoGoal.trim() });
                    }
                  }
                }}
              />
              <button
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background: autoGoal.trim() && dataset ? "var(--ac)" : "var(--bg3)",
                  color: autoGoal.trim() && dataset ? "#fff" : "var(--tx2)",
                  border: "none",
                  borderRadius: "var(--r8)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: autoGoal.trim() && dataset ? "pointer" : "not-allowed",
                }}
                disabled={!autoGoal.trim() || !dataset}
                onClick={() => {
                  if (dataset && autoGoal.trim()) {
                    void startAutoRun({ datasetId: dataset.id, projectId, goal: autoGoal.trim() });
                  }
                }}
              >
                {!dataset ? "Select a dataset first" : "⚡ Run Goal"}
              </button>
            </div>
          )}

          {/* Live feed */}
          {autoState.status !== "idle" && (
            <>
              <div style={{ fontSize: 11, color: "var(--tx2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Goal: <strong style={{ color: "var(--tx1)" }}>{autoState.goalSummary || autoGoal}</strong>
              </div>
              <AutoRunFeed
                status={autoState.status}
                planSteps={autoState.planSteps}
                planApproved={autoState.planApproved}
                driftAmber={autoState.driftAmber}
                driftRed={autoState.driftRed}
                events={autoState.events}
                onApprovePlan={approveAutoPlan}
              />
              {autoState.interruptQuestion && (
                <AutoInterruptCard
                  question={autoState.interruptQuestion}
                  onAnswer={(ans) => {
                    if (autoState.runId) void resumeAutoRun(autoState.runId, ans);
                  }}
                />
              )}
              {(autoState.status === "complete" || autoState.status === "error") && (
                <button
                  className="btn"
                  style={{ width: "100%", fontSize: 12 }}
                  onClick={() => { resetAutoRun(); setAutoGoal(""); }}
                >
                  ↩ Start new goal
                </button>
              )}
              {autoState.status === "running" || autoState.status === "interrupted" ? (
                <button
                  className="btn"
                  style={{ width: "100%", fontSize: 12, color: "var(--rd)", borderColor: "var(--rd)" }}
                  onClick={() => void cancelAutoRun()}
                >
                  ✕ Cancel
                </button>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* Chat UI — shown only in chat mode */}
      {aiMode === "chat" && (
      <>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 10, display: "grid", gap: 10, alignContent: "start" }}>
        {!dataset ? (
          <EmptyStateChatPanel
            hasDataset={false}
            onSuggestionSelect={(s) => { setInput(s); }}
            onUploadClick={() => onUploadClick?.()}
          />
        ) : messages.length === 0 ? (
          <EmptyStateChatPanel
            hasDataset
            datasetName={dataset.name}
            columnSchema={columnSchema}
            onSuggestionSelect={(s) => { setInput(s); void handleSend(s); }}
            onUploadClick={() => onUploadClick?.()}
          />
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            style={{ position: "relative", justifySelf: message.role === "user" ? "end" : "start", maxWidth: "90%" }}
            onMouseEnter={() => { if (message.role === "user") setEditHoverId(message.id); }}
            onMouseLeave={() => setEditHoverId(null)}
          >
            {message.role === "user" && editHoverId === message.id && !sending ? (
              <button
                title="Edit message"
                onClick={() => {
                  const idx = messages.findIndex((m) => m.id === message.id);
                  setMessages((prev) => prev.slice(0, idx));
                  setInput(message.content);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
                style={{
                  position: "absolute",
                  top: -8,
                  right: -8,
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  border: "1px solid var(--bd2)",
                  background: "var(--bg3)",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--tx2)",
                  zIndex: 10,
                  padding: 0,
                }}
              >
                <IconEdit size={11} />
              </button>
            ) : null}
            <ErrorBoundary key={message.id} fallback={<div style={{ padding: "6px 10px", fontSize: 12, color: "var(--tx2)", border: "1px solid var(--bd)", borderRadius: 6, opacity: 0.7 }}>⚠ Message render failed</div>}>
            {message.role === "assistant" && message.content?.startsWith("Error:") ? (
              <ErrorBubble
                message={(message.content ?? "").replace(/^Error:\s*/, "")}
                onRetry={isRetryableError(message.content ?? "") ? () => {
                  const last = [...messages].reverse().find((m) => m.role === "user");
                  if (last) void handleSend(last.content);
                } : undefined}
              />
            ) : (
            <div style={{ border: `1px solid ${message.isClarification ? "#7c3aed" : "var(--bd2)"}`, borderLeft: message.isClarification ? "3px solid #7c3aed" : undefined, background: message.role === "user" ? "var(--acg)" : "var(--bg2)", borderRadius: "var(--r8)", padding: 8 }}>
              {message.isClarification ? (
                <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, marginBottom: 6, letterSpacing: "0.04em" }}>❓ NEEDS YOUR INPUT</div>
              ) : null}
              <div className="ai-message-body"><ReactMarkdown>{message.content ?? ""}</ReactMarkdown></div>
              {message.isClarification ? (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--tx1)" }}>↓ Type your answer below</div>
              ) : null}
              {message.transformation ? (
                <StepCard
                  operation={message.transformation.operation}
                  sql={message.transformation.sql}
                  description={message.transformation.description}
                  affectedRows={message.transformation.affectedRows}
                  status={message.stepStatus ?? "pending"}
                  onApply={() => void applyStep(message.id, message.transformation!)}
                  onDiscard={() => discardStep(message.id)}
                />
              ) : null}
              {message.execSteps && message.execSteps.length > 0 ? (
                <ExecutionProgressCard steps={message.execSteps} done={message.execDone} />
              ) : null}
              {message.goalReport ? (
                <AutoGoalReport report={message.goalReport} />
              ) : null}
              {message.generatedDashboard ? (
                <GeneratedDashboardCard dashboardId={message.generatedDashboard.dashboard_id} />
              ) : null}
              {message.plan ? (
                message.planType === "dag" ? (
                  <Suspense fallback={null}>
                    <PlanDAG
                      steps={message.plan}
                      pending={Boolean(message.planPending)}
                      approved={message.planApproved}
                      rejected={message.planRejected}
                      sending={sending}
                      onApprove={approvePlan}
                      onReject={rejectPlan}
                      onModify={modifyPlan}
                    />
                  </Suspense>
                ) : (
                  <PlanCard
                    steps={message.plan}
                    pending={Boolean(message.planPending)}
                    approved={message.planApproved}
                    rejected={message.planRejected}
                    sending={sending}
                    onApprove={approvePlan}
                    onReject={rejectPlan}
                    onModify={modifyPlan}
                  />
                )
              ) : null}
              {message.tileCreated?.echarts_config ? (
                <div style={{ marginTop: 8 }}>
                  <ErrorBoundary fallback={<div style={{ padding: "8px 12px", fontSize: 12, color: "var(--tx2)", border: "1px solid var(--bd)", borderRadius: 6 }}>Chart render failed — the config may be unsupported.</div>}>
                    <Suspense fallback={null}>
                      <EChartsRenderer
                        config={message.tileCreated.echarts_config}
                        height={280}
                        onChartClick={(params) => {
                          const p = params as { name?: string };
                          if (p?.name) {
                            window.dispatchEvent(new CustomEvent("datahub:chart-click-filter", { detail: { value: p.name } }));
                          }
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                  {(() => {
                    const chartId = message.tileCreated!.chart_id;
                    const isSaving = savingVizIds.has(chartId);
                    const isSaved = savedVizIds.has(chartId);
                    return (
                      <button
                        disabled={isSaving || isSaved}
                        onClick={async () => {
                          if (!message.tileCreated?.echarts_config) return;
                          setSavingVizIds((prev) => new Set([...prev, chartId]));
                          try {
                            await saveVisualization({
                              name: message.tileCreated!.title || "AI Chart",
                              chart_type: message.tileCreated!.chart_type || "bar",
                              echarts_config: message.tileCreated!.echarts_config!,
                              project_id: projectId || undefined,
                            });
                            setSavedVizIds((prev) => new Set([...prev, chartId]));
                            window.dispatchEvent(new CustomEvent("datahub:visualizations:refresh"));
                            // If not in dashboard tab, nudge the user to go see it
                            if (mode !== "dashboard") {
                              setMessages((prev) => [
                                ...prev,
                                {
                                  id: crypto.randomUUID(),
                                  role: "assistant",
                                  content: "→ Chart saved — switch to the **Dashboard tab** to see it.",
                                },
                              ]);
                            }
                          } catch {
                            notify.error("Failed to save chart. Please try again.");
                          } finally {
                            setSavingVizIds((prev) => { const n = new Set(prev); n.delete(chartId); return n; });
                          }
                        }}
                        style={{
                          marginTop: 6,
                          background: isSaved ? "#22c55e" : "#5B6AF0",
                          border: "none",
                          borderRadius: 6,
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "4px 12px",
                          cursor: isSaving || isSaved ? "default" : "pointer",
                          opacity: isSaving ? 0.7 : 1,
                        }}
                      >
                        {isSaved ? "✓ Saved" : isSaving ? "Saving…" : "☁ Save to Visualizations"}
                      </button>
                    );
                  })()}
                </div>
              ) : null}
              {message.artifactUrl ? (
                <div style={{ marginTop: 8 }}>
                  <a
                    href={message.artifactUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#5B6AF0", fontWeight: 600, fontSize: 12, textDecoration: "underline" }}
                  >
                    ⬇ Download export
                  </a>
                </div>
              ) : null}
              {message.queryResults && message.queryResults.length > 0 && message.queryResults[0] ? (
                <div style={{ marginTop: 8, overflowX: "auto", maxHeight: 220 }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 11, whiteSpace: "nowrap" }}>
                    <thead>
                      <tr>
                        {Object.keys(message.queryResults[0] ?? {}).map((col) => (
                          <th
                            key={col}
                            style={{ border: "1px solid var(--bd)", padding: "3px 8px", background: "var(--bg1)", fontWeight: 600 }}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(message.queryResults ?? []).slice(0, showAllRowsIds.has(message.id) ? undefined : 20).map((row, ri) => (
                        <tr key={ri}>
                          {Object.values(row).map((val, ci) => (
                            <td key={ci} style={{ border: "1px solid var(--bd)", padding: "2px 8px" }}>
                              {String(val ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(message.queryResults?.length ?? 0) > 20 ? (
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--tx1)" }}>
                        {showAllRowsIds.has(message.id)
                          ? `All ${message.queryResults?.length ?? 0} rows`
                          : `Showing first 20 of ${message.queryResults?.length ?? 0} rows`}
                      </span>
                      <button
                        onClick={() => setShowAllRowsIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(message.id)) next.delete(message.id); else next.add(message.id);
                          return next;
                        })}
                        style={{ fontSize: 11, background: "none", border: "1px solid var(--bd2)", borderRadius: 4, padding: "1px 6px", cursor: "pointer", color: "var(--tx2)" }}
                      >
                        {showAllRowsIds.has(message.id) ? "Show less" : "Show all"}
                      </button>
                    </div>
                  ) : null}
                  {message.sessionTableName && sessionId ? (
                    <div style={{ marginTop: 6 }}>
                      <button
                        onClick={() => { void handleSaveCheckpoint(message.id, message.sessionTableName!); }}
                        disabled={savingCheckpointIds.has(message.id) || savedCheckpointIds.has(message.id)}
                        style={{
                          fontSize: 11,
                          background: savedCheckpointIds.has(message.id) ? "var(--bg1)" : "transparent",
                          border: "1px solid var(--bd2)",
                          borderRadius: 4,
                          padding: "2px 8px",
                          cursor: savedCheckpointIds.has(message.id) ? "default" : "pointer",
                          color: savedCheckpointIds.has(message.id) ? "var(--green, #22c55e)" : "var(--tx2)",
                        }}
                      >
                        {savedCheckpointIds.has(message.id)
                          ? "✓ Saved as dataset"
                          : savingCheckpointIds.has(message.id)
                          ? "Saving…"
                          : "⬆ Save as dataset"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {message.dataProfile ? (
                <DataProfileCard profile={message.dataProfile} issues={message.qualityIssues} />
              ) : null}
              {message.followUpChips && message.followUpChips.length > 0 && !sending ? (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {message.followUpChips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => { void handleSend(chip); }}
                      style={{
                        background: "var(--bg1)",
                        border: "1px solid var(--bd2)",
                        borderRadius: 16,
                        color: "var(--tx2)",
                        cursor: "pointer",
                        fontSize: 11,
                        padding: "3px 10px",
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#5B6AF0"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--bd2)"; }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            )}
            </ErrorBoundary>
          </div>
        ))}
        {sending ? (
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center", color: "var(--tx1)" }}>
            <span>
              {currentStepInfo && currentStepInfo.totalSteps > 0
                ? `Step ${currentStepInfo.stepNumber}/${currentStepInfo.totalSteps}: ${currentStepInfo.operation.replace(/_/g, " ")}`
                : isAwaitingExecution
                  ? "Executing..."
                  : "Thinking"}
            </span>
            <span className="dot-bounce" />
            <span className="dot-bounce" style={{ animationDelay: "0.14s" }} />
            <span className="dot-bounce" style={{ animationDelay: "0.28s" }} />
            <style>{`.dot-bounce{width:6px;height:6px;border-radius:99px;background:var(--tx1);display:inline-block;animation:dotBounce 0.8s infinite ease-in-out;}@keyframes dotBounce{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}`}</style>
            <button
              onClick={handleCancel}
              title="Stop generation and restore your message"
              style={{
                marginLeft: 6,
                background: "transparent",
                border: "1px solid var(--bd2)",
                borderRadius: 6,
                color: "var(--tx2)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                lineHeight: 1.4,
              }}
            >
              ↩ Stop & Edit
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ borderTop: "1px solid var(--bd)", padding: 10, position: "relative" }}>
        {selectedPipelineStep && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--acl, rgba(91,106,240,0.12))", border: "1px solid var(--acg, rgba(91,106,240,0.35))", borderRadius: 6, padding: "5px 8px", marginBottom: 4, fontSize: 11, color: "var(--tx1)" }}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Step {selectedPipelineStep.stepNumber}: <strong>{selectedPipelineStep.operation.replace(/_/g, " ")}</strong>
              {selectedPipelineStep.description ? ` — ${selectedPipelineStep.description}` : ""}
              {selectedPipelineStep.rowsBefore != null && selectedPipelineStep.rowsAfter != null
                ? ` (${selectedPipelineStep.rowsBefore.toLocaleString()} → ${selectedPipelineStep.rowsAfter.toLocaleString()} rows)`
                : ""}
            </span>
            <button onClick={onStepDeselect} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx2)", padding: "0 2px", lineHeight: 1 }} title="Dismiss">✕</button>
          </div>
        )}
        <AiSuggestionStrip
          columns={columnSchema}
          onSelect={(prompt) => {
            setInput(prompt);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
          alreadyUsed={messages.some((m) => m.role === "user")}
        />
        {/* Secondary dataset chips */}
        {(secondaryDatasetIds.length > 0 || showSecondaryPicker) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
            {secondaryDatasetIds.map((id) => {
              const ds = activeLanes.find((l) => l.id === id);
              if (!ds) return null;
              return (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 7px", borderRadius: 999, background: "var(--acl)", border: "1px solid var(--acg)", color: "var(--ac)" }}>
                  📎 {ds.name}
                  <button onClick={() => setSecondaryDatasetIds((prev) => prev.filter((x) => x !== id))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx2)", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
                </span>
              );
            })}
          </div>
        )}
        {/* + Add file picker dropdown */}
        {showSecondaryPicker && (
          <div style={{ position: "absolute", bottom: "calc(100% + 2px)", left: 10, right: 10, background: "var(--bg2)", border: "1px solid var(--bd2)", borderRadius: 8, padding: "4px 0", zIndex: 40, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
            <div style={{ padding: "6px 12px 4px", fontSize: 11, color: "var(--tx2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Add a secondary dataset</div>
            {activeLanes.filter((l) => l.id !== dataset?.id && !secondaryDatasetIds.includes(l.id)).map((l) => (
              <button
                key={l.id}
                onClick={() => { setSecondaryDatasetIds((prev) => [...prev, l.id]); setShowSecondaryPicker(false); }}
                style={{ display: "flex", width: "100%", padding: "6px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "var(--tx)", fontSize: 12, alignItems: "center", gap: 8 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span>📄</span>{l.name}<span style={{ marginLeft: "auto", fontSize: 10, color: "var(--tx2)" }}>{l.rows?.toLocaleString() ?? ""} rows</span>
              </button>
            ))}
            {activeLanes.filter((l) => l.id !== dataset?.id && !secondaryDatasetIds.includes(l.id)).length === 0 && (
              <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--tx2)" }}>No other open datasets. Import a file first.</div>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask the AI agent… (press / to focus)"
          rows={1}
          style={{ width: "100%", resize: "none", border: "1px solid var(--bd2)", borderRadius: "var(--r8)", background: "var(--bg2)", padding: 8, minHeight: 36, maxHeight: 160, overflowY: "auto", boxSizing: "border-box" }}
          onInput={(event) => {
            const el = event.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && sending) {
              event.preventDefault();
              handleCancel();
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
        />
        {/* Toolbar row below textarea */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          {activeLanes.filter((l) => l.id !== dataset?.id).length > 0 ? (
            <button
              onClick={() => setShowSecondaryPicker((v) => !v)}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                border: "1px solid var(--bd2)",
                background: showSecondaryPicker ? "var(--bg3)" : "none",
                color: "var(--tx2)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              title="Add a second dataset to join or compare with"
            >
              📎 Add file
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "var(--tx2)" }}>Enter to send · Shift+Enter for newline</span>
        </div>
      </div>
      </>
      )} {/* end aiMode === "chat" */}
    </aside>
  );
}
