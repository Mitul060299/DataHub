import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { usePipelineContext } from "../contexts/PipelineContext";
import { useWorkspaceContext, type Dataset } from "../contexts/WorkspaceContext";
import { useChatSession, type AgentEvent, type ConversationMessage, type PlanStep, type TransformationPayload } from "../hooks/useChatSession";
import { usePipeline } from "../hooks/usePipeline";
import { IconBarChart, IconEdit, IconRefresh, IconZap } from "./Icons";
import PlanCard from "./PlanCard";
import PlanDAG from "./PlanDAG";
import { StepCard } from "./StepCard";
import { EChartsRenderer } from "./EChartsRenderer";
import { api, saveVisualization } from "../api";
import { ErrorBubble } from "./ErrorBubble";
import { EmptyStateChatPanel } from "./EmptyStateChatPanel";
import { type ColSchema } from "./SuggestionChips";
import { capture } from "../lib/posthog";
import { humaniseError, isRetryableError } from "../utils/errorMessages";
import { notify } from "../utils/notify";
import { getAuthToken } from "../utils/auth";

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

interface DataProfile {
  row_count: number;
  sample_size: number;
  duplicate_rows: number;
  duplicate_pct: number;
  columns: Record<string, ColProfile>;
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
      `Add this chart to a dashboard`,
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

function DataProfileCard({ profile }: { profile: DataProfile }) {
  const [open, setOpen] = useState(false);
  const cols = Object.entries(profile.columns);
  const highNullCols = cols.filter(([, c]) => c.null_pct >= 20).length;
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
                <span style={{ fontSize: 10, color: c.null_pct >= 20 ? "#f87171" : c.null_pct >= 5 ? "#fbbf24" : "#71717a" }}>
                  {c.null_pct}% null
                </span>
              </div>
              {/* Null bar: green = valid portion, red/amber = null portion */}
              <div style={{ height: 6, background: "#27272a", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                <div style={{ height: "100%", width: `${100 - Math.min(c.null_pct, 100)}%`, background: "#22c55e", transition: "width 300ms" }} />
                <div style={{ height: "100%", width: `${Math.min(c.null_pct, 100)}%`, background: c.null_pct >= 20 ? "#ef4444" : c.null_pct >= 5 ? "#f59e0b" : "transparent", transition: "width 300ms" }} />
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
                  {c.top_values.slice(0, 3).map((tv) => (
                    <span key={tv.value} style={{ background: "#1f1f22", borderRadius: 4, padding: "1px 5px" }}>
                      {tv.value.length > 12 ? tv.value.slice(0, 11) + "…" : tv.value} ({tv.count})
                    </span>
                  ))}
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
  dataProfile?: DataProfile;
  followUpChips?: string[];
  isClarification?: boolean;
};

interface AIPanelProps {
  dataset: Dataset | null;
  workspaceId: string;
  projectId: string;
  width?: number;
  onStepApplied: () => void;
  onDatasetMutated?: () => void;
}

export function AIPanel({ dataset, workspaceId, projectId, width, onStepApplied, onDatasetMutated }: AIPanelProps) {
  const { addStep, steps } = usePipelineContext();
  const { setActiveDataset } = useWorkspaceContext();
  const { executeTransformation } = usePipeline();
  const { sendMessage, sending, resetSession, cancelMessage, restoreSession, saveHistory, sessionId } = useChatSession();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [editHoverId, setEditHoverId] = useState<string | null>(null);
  const lastSentInputRef = useRef<string>("");
  const [savingVizIds, setSavingVizIds] = useState<Set<string>>(new Set());
  const [savedVizIds, setSavedVizIds] = useState<Set<string>>(new Set());
  const [savingCheckpointIds, setSavingCheckpointIds] = useState<Set<string>>(new Set());
  const [savedCheckpointIds, setSavedCheckpointIds] = useState<Set<string>>(new Set());
  const [analyzingDataset, setAnalyzingDataset] = useState(false);
  const [columnSchema, setColumnSchema] = useState<ColSchema[]>([]);
  const [currentStepInfo, setCurrentStepInfo] = useState<{ stepNumber: number; operation: string; totalSteps: number } | null>(null);
  const [showAllRowsIds, setShowAllRowsIds] = useState<Set<string>>(new Set());
  // Tracks dataset IDs that have already been auto-analyzed on first load
  const autoQualityRunRef = useRef<Set<string>>(new Set());
  // ── Auto-save ──────────────────────────────────────────────────────────────
  const [autoSaveStatus, setAutoSaveStatus] = useState<{ savedAt: Date; tableName: string } | null>(null);
  // Tracks what we last saved so we skip unchanged state
  const autoSaveRef = useRef<{ stepCount: number; tableName: string } | null>(null);

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
    let cancelled = false;
    const token = getAuthToken();
    fetch(`/api/chat/sessions/${storedId}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { data?: { messages?: Array<{ role: string; content: string }> } } | null) => {
        if (cancelled || !json?.data?.messages?.length) return;
        restoreSession(storedId);
        setMessages(
          json.data.messages.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role as "user" | "assistant",
            content: m.content,
          }))
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id]);



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

  const history = useMemo<ConversationMessage[]>(() => messages.map(({ role, content }) => ({ role, content })), [messages]);

  const handleAgentEvent = (event: AgentEvent) => {
    switch (event.type) {
      case "agent.plan": {
        const plan = (event.plan as PlanStep[] | undefined) || [];
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

        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: responseText,
            tileCreated: tileCreatedData,
            followUpChips,
          },
        ]);
        // Persist conversation to DB so it survives page reloads
        if (dataset?.id) {
          const historyToSave = [
            ...history,
            { role: "assistant" as const, content: responseText },
          ];
          void saveHistory(dataset.id, historyToSave);
        }
        break;
      }
      case "agent.step.done": {
        // Show a compact inline progress row: "✔ Step N (operation): before → after rows"
        const stepNum = typeof event.step === "number" ? event.step : null;
        const opName = typeof event.operation === "string"
          ? event.operation.replace(/_/g, " ")
          : "step";
        const rowsBefore = typeof event.row_count_before === "number" ? event.row_count_before : null;
        const rowsAfter = typeof event.row_count_after === "number" ? event.row_count_after : null;
        const execMs = typeof event.execution_time_ms === "number" ? event.execution_time_ms : null;
        const rowDelta = rowsBefore !== null && rowsAfter !== null ? rowsAfter - rowsBefore : null;
        const label = [
          stepNum !== null ? `Step ${stepNum}` : null,
          `(${opName})`,
          rowsBefore !== null && rowsAfter !== null
            ? `${rowsBefore.toLocaleString()} → ${rowsAfter.toLocaleString()} rows`
            : null,
          rowDelta !== null && rowDelta !== 0
            ? `(${rowDelta >= 0 ? "+" : ""}${rowDelta.toLocaleString()})`
            : null,
          execMs !== null ? `${execMs}ms` : null,
        ].filter(Boolean).join(" ");
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: `✔ ${label}`,
          },
        ]);
        break;
      }
      case "agent.step.error": {
        const stepNum = typeof event.step === "number" ? `Step ${event.step}` : "Step";
        const errMsg = typeof event.error === "string" ? event.error : "Unknown error";
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: `✗ ${stepNum} failed: ${errMsg}`,
          },
        ]);
        break;
      }
      case "agent.error": {
        setCurrentStepInfo(null);
        // Use the raw backend message for agent.error events — they are already
        // concise server-side strings. Only fall through humaniseError for
        // network-layer errors (handled in the catch block below).
        const errorText = typeof event.error === "string" && event.error.trim()
          ? event.error.trim()
          : "The AI agent encountered an unexpected error. Please try again.";
        capture("ai_error", { error_type: "agent.error", message: errorText.slice(0, 200) });
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: errorText,
          },
        ]);
        break;
      }
      case "column_added": {
        onDatasetMutated?.();
        break;
      }
      case "tile_created": {
        window.dispatchEvent(new CustomEvent("datahub:dashboard:refresh"));
        // Also render the chart inline if echarts_config is present on this event
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
          setMessages((previous) => [
            ...previous,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `${opLabel} (${results.length} row${results.length !== 1 ? "s" : ""}):`  ,
              queryResults: results,
              sessionTableName,
            },
          ]);
        }
        break;
      }
      case "agent.step.start": {
        setCurrentStepInfo({
          stepNumber: Number(event.step_number ?? 0),
          operation: typeof event.operation === "string" ? event.operation : "",
          totalSteps: Number(event.total_steps ?? 0),
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
    const token = getAuthToken();
    try {
      const res = await fetch("/api/artifacts/save-checkpoint", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ session_id: sessionId, table_name: tableName, artifact_name: tableName }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSavedCheckpointIds((prev) => new Set([...prev, messageId]));
      onDatasetMutated?.();
    } catch (err) {
      console.error("Save checkpoint failed:", err);
    } finally {
      setSavingCheckpointIds((prev) => { const n = new Set(prev); n.delete(messageId); return n; });
    }
  };

  const handleSend = async (text?: string, approvePlan?: boolean, pendingPlan?: PlanStep[], isPlanModification?: boolean) => {
    if (!dataset) return;
    const content = (text || input).trim();
    if (!content && !approvePlan) return;

    if (content && !approvePlan) {
      setCurrentStepInfo(null);
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "user", content },
      ]);
      lastSentInputRef.current = content;
      capture("ai_message_sent", { dataset_id: dataset.id, workspace_id: workspaceId });
    }
    setInput("");

    try {
      await sendMessage({
        message: content,
        dataset_id: dataset.id,
        workspace_id: workspaceId,
        project_id: projectId,
        conversation_history: [...history, ...(content && !approvePlan ? [{ role: "user" as const, content }] : [])],
        pipeline_steps: steps.map((step) => ({
          operation: step.operation,
          description: step.description,
          sql: step.sql,
          rows_affected: step.affectedRows,
        })),
        plan_approved: approvePlan ?? false,
        plan_pending_modification: isPlanModification ?? false,
        pending_plan: pendingPlan,
        onEvent: handleAgentEvent,
      });
    } catch (error: unknown) {
      const humanised = humaniseError(error);
      capture("ai_error", { error_type: "send_failed", retryable: isRetryableError(error) });
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "assistant", content: `Error: ${humanised}` },
      ]);
    }
  };

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
      const res = await api.post<{
        issues: unknown[];
        suggestions: unknown[];
        data_profile?: DataProfile;
        error?: string;
      }>(`/cleaning/datasets/${dataset.id}/analyze`);
      const profile = res.data.data_profile;
      const issueCount = (res.data.issues ?? []).length;
      const content = profile
        ? `Found ${issueCount} issue${issueCount !== 1 ? "s" : ""} in your dataset. Here is the data quality report:`
        : res.data.error ?? "Analysis complete.";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          dataProfile: profile,
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
    const t = setTimeout(() => { void runDataQualityReport(); }, 800);
    return () => clearTimeout(t);
  }, [dataset?.id]); // intentionally omit runDataQualityReport — stable enough for one-shot

  // Auto-save the latest leaf session table to S3 every 2 minutes.
  // Silent — never interrupts the user. Only fires when there is an active
  // session with at least one transform step that produced a named DuckDB table.
  useEffect(() => {
    const AUTO_SAVE_MS = 2 * 60 * 1000;

    const doAutoSave = async () => {
      if (!sessionId || sending) return;

      // Find the most recent step that holds a DuckDB session table name.
      // Chart/visualise steps don't produce one, so they are naturally skipped.
      const stepsWithTable = steps.filter((s) => {
        const raw = s.rawConfig as Record<string, unknown> | undefined;
        return Boolean(raw?.session_table_name ?? raw?.output_table);
      });
      if (stepsWithTable.length === 0) return;

      const lastStep = stepsWithTable[stepsWithTable.length - 1];
      const raw = lastStep.rawConfig as Record<string, unknown> | undefined;
      const tableName = String(raw?.session_table_name ?? raw?.output_table ?? "");
      if (!tableName) return;

      // Skip if nothing has changed since the last save.
      if (
        autoSaveRef.current?.stepCount === steps.length &&
        autoSaveRef.current?.tableName === tableName
      ) return;

      const token = getAuthToken();
      try {
        const res = await fetch("/api/artifacts/save-checkpoint", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            session_id: sessionId,
            table_name: tableName,
            artifact_name: `autosave_${tableName}`,
          }),
        });
        if (!res.ok) return; // silent — auto-save failures must never disrupt UX
        autoSaveRef.current = { stepCount: steps.length, tableName };
        setAutoSaveStatus({ savedAt: new Date(), tableName });
        onDatasetMutated?.();
      } catch {
        // silent — non-critical background save
      }
    };

    const id = setInterval(() => { void doAutoSave(); }, AUTO_SAVE_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, steps, sending]);

  return (
    <aside style={{ width: width ?? "var(--rw)", minWidth: width ?? 280, borderLeft: "1px solid var(--bd)", background: "var(--bg1)", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <header data-tour="ai-agent-header" style={{ height: 40, borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span className="badge-dot pulse" style={{ background: "var(--gr)" }} />
          <IconZap size={14} />
          AI Agent
          {autoSaveStatus ? (
            <span
              style={{ fontSize: 10, color: "var(--tx2)", opacity: 0.55, fontWeight: 400 }}
              title={`Session progress auto-saved · table: ${autoSaveStatus.tableName}`}
            >
              · ↑ saved {autoSaveStatus.savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
        </span>
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          {dataset ? (
            <button
              className="btn"
              style={{ fontSize: 10, padding: "2px 7px", opacity: analyzingDataset ? 0.6 : 1 }}
              onClick={() => void runDataQualityReport()}
              disabled={analyzingDataset}
              title="Run data quality report"
            >
              {analyzingDataset ? "Analyzing…" : <><span style={{ marginRight: 3, verticalAlign: "middle", display: "inline-flex" }}><IconBarChart size={12} /></span>Quality</>}
            </button>
          ) : null}

          <button className="btn" style={{ width: 28, padding: 0 }} onClick={() => { if (dataset?.id) localStorage.removeItem(`datahub_chat_session_${dataset.id}`); setMessages([]); resetSession(); }}>
            <IconRefresh size={14} />
          </button>
        </span>
      </header>


      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 10, display: "grid", gap: 10, alignContent: "start" }}>
        {!dataset ? (
          <EmptyStateChatPanel
            hasDataset={false}
            onSuggestionSelect={(s) => { setInput(s); }}
            onUploadClick={() => {}}
          />
        ) : messages.length === 0 ? (
          <EmptyStateChatPanel
            hasDataset
            datasetName={dataset.name}
            columnSchema={columnSchema}
            onSuggestionSelect={(s) => { setInput(s); void handleSend(s); }}
            onUploadClick={() => {}}
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
            {message.role === "assistant" && message.content.startsWith("Error:") ? (
              <ErrorBubble
                message={message.content.replace(/^Error:\s*/, "")}
                onRetry={isRetryableError(message.content) ? () => {
                  const last = [...messages].reverse().find((m) => m.role === "user");
                  if (last) void handleSend(last.content);
                } : undefined}
              />
            ) : (
            <div style={{ border: `1px solid ${message.isClarification ? "#7c3aed" : "var(--bd2)"}`, borderLeft: message.isClarification ? "3px solid #7c3aed" : undefined, background: message.role === "user" ? "var(--acg)" : "var(--bg2)", borderRadius: "var(--r8)", padding: 8 }}>
              {message.isClarification ? (
                <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, marginBottom: 6, letterSpacing: "0.04em" }}>❓ NEEDS YOUR INPUT</div>
              ) : null}
              <div className="ai-message-body"><ReactMarkdown>{message.content}</ReactMarkdown></div>
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
              {message.plan ? (
                message.planType === "dag" ? (
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
                  <EChartsRenderer
                    config={message.tileCreated.echarts_config}
                    height={280}
                  />
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
                              workspace_id: workspaceId,
                            });
                            setSavedVizIds((prev) => new Set([...prev, chartId]));
                            window.dispatchEvent(new CustomEvent("datahub:visualizations:refresh"));
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
              {message.queryResults && message.queryResults.length > 0 ? (
                <div style={{ marginTop: 8, overflowX: "auto", maxHeight: 220 }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 11, whiteSpace: "nowrap" }}>
                    <thead>
                      <tr>
                        {Object.keys(message.queryResults[0]).map((col) => (
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
                      {message.queryResults.slice(0, showAllRowsIds.has(message.id) ? undefined : 20).map((row, ri) => (
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
                  {message.queryResults.length > 20 ? (
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--tx1)" }}>
                        {showAllRowsIds.has(message.id)
                          ? `All ${message.queryResults.length} rows`
                          : `Showing first 20 of ${message.queryResults.length} rows`}
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
                <DataProfileCard profile={message.dataProfile} />
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
          </div>
        ))}
        {sending ? (
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center", color: "var(--tx1)" }}>
            <span>
              {currentStepInfo && currentStepInfo.totalSteps > 0
                ? `Step ${currentStepInfo.stepNumber}/${currentStepInfo.totalSteps}: ${currentStepInfo.operation.replace(/_/g, " ")}`
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

      <div style={{ borderTop: "1px solid var(--bd)", padding: 10 }}>
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
      </div>
    </aside>
  );
}
