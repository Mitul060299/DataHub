import { useEffect, useState } from "react";
import { IconChevronDown, IconClock, IconCopy, IconDownload, IconPlay, IconTrash, IconX } from "./Icons";
import { usePipelineContext } from "../contexts/PipelineContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import { usePipeline, type PipelineRunArtifact } from "../hooks/usePipeline";
import { api } from "../api";
import { TemplatePickerModal } from "./modals/TemplatePickerModal";

interface PipelineSectionProps {
  onSchedule: () => void;
  onExport: () => void;
}

type WorkflowTemplate = {
  id: string;
  name: string;
};

type RunStatusSummary = {
  status: "success" | "failure";
  elapsedMs: number;
  rows: number | null;
};

export function PipelineSection({ onSchedule, onExport }: PipelineSectionProps) {
  const { steps, removeStep, clearSteps, keepStepsThrough, runPipeline, scheduleInfo, renameStep } = usePipelineContext();
  const { activeProject, activeDataset, setActiveDataset } = useWorkspaceContext();
  const { runPipelineWorkflow, getPipelineRunArtifact } = usePipeline();

  const [open, setOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingStepName, setEditingStepName] = useState("");

  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [pipelineWorkflowId, setPipelineWorkflowId] = useState("");
  const [runtimeParametersText, setRuntimeParametersText] = useState("{}");

  const [runningWorkflow, setRunningWorkflow] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [runStatusSummary, setRunStatusSummary] = useState<RunStatusSummary | null>(null);

  const [runCtaHovered, setRunCtaHovered] = useState(false);
  const [resultsHovered, setResultsHovered] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());

  const [availableDatasets, setAvailableDatasets] = useState<Array<{ id: string; name: string }>>([]);
  const [bindingAlias, setBindingAlias] = useState("ref_data");
  const [bindingDatasetId, setBindingDatasetId] = useState("");
  const [bindingAliasToRemove, setBindingAliasToRemove] = useState("");

  const [artifactRunId, setArtifactRunId] = useState("");
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactData, setArtifactData] = useState<PipelineRunArtifact | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [nlPrompt, setNlPrompt] = useState("");
  const [nlApplying, setNlApplying] = useState(false);
  const [nlFeedback, setNlFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const formatStepLabel = (operation: string) => {
    const normalized = operation.replace(/_/g, " ").trim();
    if (!normalized) return "Step";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const getStepLabel = (step: (typeof steps)[0]) =>
    (step.description || formatStepLabel(step.operation));

  const formatElapsed = (elapsedMs: number) => {
    const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  };

  const getStepVisual = (operation: string) => {
    const normalized = operation.toLowerCase();
    if (normalized === "source") return { background: "#1a2a1a", color: "#4ade80" };
    if (["transform", "group_by", "join", "filter"].includes(normalized)) return { background: "#1a1a2e", color: "#818cf8" };
    if (["output", "export"].includes(normalized)) return { background: "#1a2a2a", color: "#38bdf8" };
    return { background: "#27272a", color: "#71717a" };
  };

  const parseRuntimeParameters = () => {
    try {
      const parsed = JSON.parse(runtimeParametersText || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const getCurrentDatasetBindings = (): Record<string, unknown> => {
    const parsed = parseRuntimeParameters();
    if (!parsed) return {};
    const bindings = parsed.dataset_bindings;
    if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
      return {};
    }
    return bindings as Record<string, unknown>;
  };

  const currentBindings = getCurrentDatasetBindings();
  const currentBindingAliases = Object.keys(currentBindings);

  useEffect(() => {
    const loadDatasets = async () => {
      try {
        const response = await api.get("/datasets", {
          params: { project_id: activeProject?.id },
          timeout: 120000,
        });
        const mapped = (response.data ?? [])
          .map((item: Record<string, unknown>) => ({
            id: String(item.id ?? item.dataset_id ?? ""),
            name: String(item.name ?? item.filename ?? item.table_name ?? "dataset"),
          }))
          .filter((item: { id: string }) => Boolean(item.id));

        setAvailableDatasets(mapped);
        if (!bindingDatasetId && mapped.length) {
          setBindingDatasetId(mapped[0].id);
        }
      } catch {
        setAvailableDatasets([]);
      }
    };

    void loadDatasets();
  }, [activeProject?.id]);

  useEffect(() => {
    const loadWorkflowTemplates = async () => {
      try {
        const response = await api.get("/api/pipelines");
        const payload = response.data as { data?: unknown; pipelines?: unknown } | unknown[];
        const source = Array.isArray(payload)
          ? payload
          : (Array.isArray((payload as { data?: unknown })?.data)
            ? (payload as { data: unknown[] }).data
            : Array.isArray((payload as { pipelines?: unknown })?.pipelines)
              ? (payload as { pipelines: unknown[] }).pipelines
              : []);

        const mapped = source
          .map((item) => {
            const row = item as Record<string, unknown>;
            const id = String(row.id ?? "").trim();
            const name = String(row.name ?? row.title ?? `Pipeline ${id}`);
            return { id, name };
          })
          .filter((item) => Boolean(item.id));

        setWorkflowTemplates(mapped);
      } catch {
        setWorkflowTemplates([]);
      }
    };

    void loadWorkflowTemplates();
  }, [activeProject?.id]);

  const addBindingToRuntimeParameters = () => {
    const alias = bindingAlias.trim();
    if (!alias || !bindingDatasetId) {
      setWorkflowMessage("Alias and dataset are required for binding.");
      return;
    }

    const parsedParameters = parseRuntimeParameters();
    if (!parsedParameters) {
      setWorkflowMessage("Runtime parameters JSON is invalid.");
      return;
    }

    const nextBindings = {
      ...(typeof parsedParameters.dataset_bindings === "object" && parsedParameters.dataset_bindings && !Array.isArray(parsedParameters.dataset_bindings)
        ? (parsedParameters.dataset_bindings as Record<string, unknown>)
        : {}),
      [alias]: bindingDatasetId,
    };

    const nextParameters = {
      ...parsedParameters,
      dataset_bindings: nextBindings,
    };

    setRuntimeParametersText(JSON.stringify(nextParameters, null, 2));
    setWorkflowMessage(`Added binding: ${alias} -> ${bindingDatasetId}`);
  };

  const removeBindingFromRuntimeParameters = () => {
    const alias = bindingAliasToRemove.trim();
    if (!alias) {
      setWorkflowMessage("Select a binding alias to remove.");
      return;
    }

    const parsedParameters = parseRuntimeParameters();
    if (!parsedParameters) {
      setWorkflowMessage("Runtime parameters JSON is invalid.");
      return;
    }

    const existingBindings = getCurrentDatasetBindings();
    if (!(alias in existingBindings)) {
      setWorkflowMessage(`Binding alias not found: ${alias}`);
      return;
    }

    const nextBindings = { ...existingBindings };
    delete nextBindings[alias];

    const nextParameters = {
      ...parsedParameters,
      dataset_bindings: nextBindings,
    };

    setRuntimeParametersText(JSON.stringify(nextParameters, null, 2));
    setBindingAliasToRemove("");
    setWorkflowMessage(`Removed binding: ${alias}`);
  };

  const getRunIdFromResponse = (response: unknown): string | null => {
    const root = response as Record<string, unknown>;
    const candidates = [
      root?.run_id,
      root?.runId,
      (root?.data as Record<string, unknown> | undefined)?.run_id,
      (root?.data as Record<string, unknown> | undefined)?.runId,
      (root?.data as Record<string, unknown> | undefined)?.id,
      root?.id,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
    return null;
  };

  const getRowsFromResponse = (response: unknown): number | null => {
    const root = response as Record<string, unknown>;
    const candidates = [
      root?.rows_affected,
      root?.row_count,
      (root?.data as Record<string, unknown> | undefined)?.rows_affected,
      (root?.data as Record<string, unknown> | undefined)?.row_count,
      ((root?.data as Record<string, unknown> | undefined)?.output as Record<string, unknown> | undefined)?.row_count,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  const handleNlEdit = async () => {
    if (!pipelineWorkflowId.trim() || !nlPrompt.trim() || nlApplying) return;
    setNlApplying(true);
    setNlFeedback(null);
    try {
      const res = await api.post<{ change_summary: string }>(
        `/api/pipelines/${pipelineWorkflowId}/nl-edit`,
        { prompt: nlPrompt.trim() },
      );
      setNlFeedback({ ok: true, msg: res.data.change_summary ?? "Applied." });
      setNlPrompt("");
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setNlFeedback({ ok: false, msg: detail ?? "Failed to apply edit." });
    } finally {
      setNlApplying(false);
    }
  };

  const handleRunWorkflowPipeline = async () => {
    const effectivePipelineId = pipelineWorkflowId.trim() || selectedTemplateId.trim();
    if (!activeDataset?.id || !effectivePipelineId || runningWorkflow) return;

    const parsedParameters = parseRuntimeParameters();
    if (!parsedParameters) {
      setWorkflowMessage("Runtime parameters JSON is invalid.");
      return;
    }

    setRunningWorkflow(true);
    setWorkflowMessage(null);
    const startedAt = Date.now();

    try {
      const response = await runPipelineWorkflow(effectivePipelineId, {
        input_dataset_id: activeDataset.id,
        runtime_parameters: parsedParameters,
        triggered_by: "manual",
      });

      const elapsedMs = Date.now() - startedAt;
      const runId = getRunIdFromResponse(response);
      const rows = getRowsFromResponse(response);

      if (runId) {
        setArtifactRunId(runId);
      }

      setRunStatusSummary({
        status: "success",
        elapsedMs,
        rows,
      });
      setWorkflowMessage(runId ? "Workflow pipeline run completed." : "Workflow pipeline run completed. Run ID unavailable.");
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: string } }; message?: string };
      setWorkflowMessage(maybeError.response?.data?.detail ?? maybeError.message ?? "Unable to run workflow pipeline.");
      setRunStatusSummary({
        status: "failure",
        elapsedMs: Date.now() - startedAt,
        rows: null,
      });
    } finally {
      setRunningWorkflow(false);
    }
  };

  const handleLoadRunArtifact = async () => {
    if (!artifactRunId.trim() || artifactLoading) return;

    setArtifactLoading(true);
    setWorkflowMessage(null);

    try {
      const response = await getPipelineRunArtifact(artifactRunId.trim(), 20);
      setArtifactData(response.data);
      setWorkflowMessage("Run artifact loaded.");
      if (response.data?.output?.row_count != null && runStatusSummary) {
        setRunStatusSummary({
          ...runStatusSummary,
          rows: response.data.output.row_count,
        });
      }
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: string } }; message?: string };
      setArtifactData(null);
      setWorkflowMessage(maybeError.response?.data?.detail ?? maybeError.message ?? "Unable to load run artifact.");
    } finally {
      setArtifactLoading(false);
    }
  };

  const handleCopyRunId = async (runId: string) => {
    if (!runId.trim()) {
      setWorkflowMessage("Run ID is unavailable for this run.");
      return;
    }

    try {
      await navigator.clipboard.writeText(runId.trim());
      setWorkflowMessage("Run ID copied.");
    } catch {
      setWorkflowMessage("Unable to copy run ID.");
    }
  };

  const handleDownloadArtifactJson = () => {
    if (!artifactData) {
      setWorkflowMessage("Load a run artifact before downloading.");
      return;
    }

    const blob = new Blob([JSON.stringify(artifactData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pipeline-run-artifact-${artifactData.run.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setWorkflowMessage("Artifact JSON downloaded.");
  };

  const handleUndoLast = async () => {
    const lastStep = steps[steps.length - 1];
    if (!lastStep?.inputDataset || undoing) return;

    const confirmed = window.confirm("Undo last step? This will remove 1 pipeline step.");
    if (!confirmed) return;

    setUndoing(true);
    try {
      setActiveDataset({
        id: lastStep.inputDataset.id,
        name: lastStep.inputDataset.name,
        rows: lastStep.inputDataset.rows,
      });
      keepStepsThrough(steps[Math.max(steps.length - 2, 0)]?.id ?? "");
      if (steps.length <= 1) {
        clearSteps();
      }
    } finally {
      setUndoing(false);
    }
  };

  const handleUndoFromStep = async (stepId: string) => {
    if (undoing) return;

    const stepIndex = steps.findIndex((step) => step.id === stepId);
    if (stepIndex < 0) return;

    const selectedStep = steps[stepIndex];
    if (!selectedStep.inputDataset) return;

    const removedCount = steps.length - stepIndex;
    const confirmed = window.confirm(
      `Undo from this step? This will remove ${removedCount} pipeline ${removedCount === 1 ? "step" : "steps"}.`,
    );
    if (!confirmed) return;

    setUndoing(true);
    try {
      setActiveDataset({
        id: selectedStep.inputDataset.id,
        name: selectedStep.inputDataset.name,
        rows: selectedStep.inputDataset.rows,
      });

      if (stepIndex === 0) {
        clearSteps();
        return;
      }

      keepStepsThrough(steps[stepIndex - 1].id);
    } finally {
      setUndoing(false);
    }
  };

  return (
    <section style={{ borderTop: "1px solid var(--bd)", paddingTop: 8, marginTop: 10, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button onClick={() => setOpen((value) => !value)} style={{ color: "var(--tx1)", fontSize: 11, letterSpacing: "0.08em", display: "inline-flex", alignItems: "center", gap: 6 }}>
          {open ? "▼" : "▶"} PIPELINE
          <span
            style={{
              background: "#27272a",
              borderRadius: 10,
              padding: "1px 7px",
              fontSize: 10,
              color: "#71717a",
              letterSpacing: "normal",
            }}
          >
            {steps.length} {steps.length === 1 ? "step" : "steps"}
          </span>
        </button>
        {open ? (
          <button className="btn" style={{ width: 26, padding: 0 }} onClick={clearSteps} aria-label="Clear steps">
            <IconTrash size={14} />
          </button>
        ) : null}
      </header>

      {open ? (
        <div style={{ flex: 1, overflow: "auto", display: "grid", gap: 8, paddingRight: 4 }}>
          <div style={{ border: "1px solid var(--bd2)", borderRadius: "var(--r8)", background: "var(--bg2)", overflow: "hidden" }}>
            <div style={{ borderBottom: "1px solid var(--bd)", padding: "6px 8px", fontSize: 11, letterSpacing: "0.08em", color: "var(--tx1)", fontWeight: 600 }}>
              APPLIED STEPS
            </div>

            <div style={{ borderBottom: "1px solid var(--bd)", minHeight: 28, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", color: "var(--tx1)" }}>
              <span style={{ fontSize: 12 }}>Source</span>
              <span className="mono" style={{ fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeDataset?.name ?? "No dataset"}
              </span>
            </div>

            {!steps.length ? (
              <div style={{ minHeight: 36, display: "grid", placeItems: "center", color: "var(--tx2)", fontSize: 12 }}>
                No steps yet
              </div>
            ) : null}

            {steps.map((step, index) => {
              const isActiveStep = index === steps.length - 1;
              const stepStatus: "completed" | "active" | "pending" = step.status === "failed"
                ? "pending"
                : isActiveStep
                ? "active"
                : (index < steps.length - 1 ? "completed" : "pending");
              const statusColor = step.status === "failed"
                ? "#ef4444"
                : stepStatus === "completed"
                ? "#22c55e"
                : (stepStatus === "active" ? "#5B6AF0" : "#3f3f46");
              const stepVisual = getStepVisual(step.operation);
              const isSqlExpanded = expandedStepIds.has(step.id);
              const rowDelta =
                step.row_count_after != null && step.row_count_before != null
                  ? step.row_count_after - step.row_count_before
                  : null;

              return (
                <div
                  key={step.id}
                  onMouseEnter={() => setHoveredStepId(step.id)}
                  onMouseLeave={() => setHoveredStepId((current) => (current === step.id ? null : current))}
                  style={{
                    padding: "6px 8px",
                    borderBottom: index === steps.length - 1 ? "none" : "1px solid var(--bd)",
                    background: isActiveStep ? "#1c1c3a" : "transparent",
                    borderLeft: `2px solid ${isActiveStep ? "#5B6AF0" : "transparent"}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {/* Row 1: icon + label + status dot + action buttons */}
                  <div style={{ display: "grid", gridTemplateColumns: "18px 1fr auto auto", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: stepVisual.background,
                        color: stepVisual.color,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 10,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                      title={getStepLabel(step)}
                    >
                      {formatStepLabel(step.operation).charAt(0)}
                    </div>

                    {editingStepId === step.id ? (
                      <input
                        autoFocus
                        value={editingStepName}
                        onChange={(e) => setEditingStepName(e.target.value)}
                        onBlur={() => {
                          renameStep(step.id, editingStepName);
                          setEditingStepId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            renameStep(step.id, editingStepName);
                            setEditingStepId(null);
                          } else if (e.key === "Escape") {
                            setEditingStepId(null);
                          }
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: 22,
                          fontSize: 12,
                          background: "var(--bg3)",
                          border: "1px solid var(--ac)",
                          borderRadius: 4,
                          color: "var(--tx0)",
                          padding: "0 6px",
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          minWidth: 0,
                          color: "var(--tx0)",
                          fontSize: 12,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontWeight: isActiveStep ? 600 : 400,
                        }}
                        title={getStepLabel(step)}
                      >
                        {getStepLabel(step).length > 28
                          ? getStepLabel(step).slice(0, 26) + "\u2026"
                          : getStepLabel(step)}
                      </span>
                    )}

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        opacity: hoveredStepId === step.id && editingStepId !== step.id ? 1 : 0,
                        pointerEvents: hoveredStepId === step.id && editingStepId !== step.id ? "auto" : "none",
                        transition: "opacity 120ms ease",
                      }}
                    >
                      <button
                        className="btn"
                        style={{ height: 20, width: 20, padding: 0, fontSize: 11 }}
                        title="Rename step"
                        onClick={() => {
                          setEditingStepName(getStepLabel(step));
                          setEditingStepId(step.id);
                        }}
                      >
                        ✏
                      </button>
                      <button
                        className="btn"
                        style={{ height: 20, width: 20, padding: 0, fontSize: 11 }}
                        title="Undo from this step"
                        onClick={() => void handleUndoFromStep(step.id)}
                        disabled={undoing}
                      >
                        ↺
                      </button>
                      <button
                        className="btn"
                        style={{ height: 20, width: 20, padding: 0 }}
                        title="Remove step"
                        onClick={() => removeStep(step.id)}
                        disabled={undoing}
                      >
                        <IconX size={12} />
                      </button>
                    </div>

                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: statusColor,
                        flexShrink: 0,
                        boxShadow: stepStatus === "active" ? "0 0 8px rgba(91,106,240,0.45)" : "none",
                      }}
                    />
                  </div>

                  {/* Row 2: input → output table flow */}
                  {(step.input_tables?.length || step.output_table) ? (
                    <div style={{ paddingLeft: 24, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      {step.input_tables?.map((t) => (
                        <span key={t} className="mono" style={{ fontSize: 10, color: "#a1a1aa", background: "#18181b", borderRadius: 3, padding: "1px 4px", border: "1px solid #27272a" }}>
                          {t}
                        </span>
                      ))}
                      {step.input_tables?.length && step.output_table ? (
                        <span style={{ fontSize: 10, color: "#52525b" }}>→</span>
                      ) : null}
                      {step.output_table ? (
                        <span className="mono" style={{ fontSize: 10, color: "#818cf8", background: "#1e1b4b", borderRadius: 3, padding: "1px 4px", border: "1px solid #312e81" }}>
                          {step.output_table}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Row 3: row count delta + execution time */}
                  {(rowDelta !== null || step.row_count_after != null || step.execution_time_ms != null) ? (
                    <div style={{ paddingLeft: 24, display: "flex", alignItems: "center", gap: 8, color: "var(--tx2)", fontSize: 10 }}>
                      {step.row_count_after != null ? (
                        <span>
                          <span style={{ color: "#71717a" }}>{step.row_count_after.toLocaleString()} rows</span>
                          {rowDelta !== null ? (
                            <span style={{ marginLeft: 4, color: rowDelta >= 0 ? "#22c55e" : "#f87171" }}>
                              ({rowDelta >= 0 ? "+" : ""}{rowDelta.toLocaleString()})
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      {step.execution_time_ms != null ? (
                        <span style={{ color: "#52525b" }}>{step.execution_time_ms}ms</span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Row 4: error message */}
                  {step.error_message ? (
                    <div style={{ paddingLeft: 24, fontSize: 10, color: "#f87171", wordBreak: "break-word" }}>
                      {step.error_message}
                    </div>
                  ) : null}

                  {/* Row 5: SQL toggle */}
                  {step.sql ? (
                    <div style={{ paddingLeft: 24 }}>
                      <button
                        onClick={() =>
                          setExpandedStepIds((prev) => {
                            const next = new Set(prev);
                            isSqlExpanded ? next.delete(step.id) : next.add(step.id);
                            return next;
                          })
                        }
                        style={{ fontSize: 10, color: "#52525b", textDecoration: "underline", cursor: "pointer" }}
                      >
                        {isSqlExpanded ? "hide SQL" : "show SQL"}
                      </button>
                      {isSqlExpanded ? (
                        <pre
                          className="mono"
                          style={{
                            marginTop: 4,
                            fontSize: 10,
                            color: "#a1a1aa",
                            background: "#09090b",
                            borderRadius: 4,
                            padding: "6px 8px",
                            overflowX: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            maxHeight: 120,
                            overflowY: "auto",
                          }}
                        >
                          {step.sql}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {open && (steps.length || activeDataset?.id) ? (
        <footer style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <div style={{ border: "1px solid var(--bd2)", borderRadius: "var(--r8)", background: "var(--bg2)", padding: 8, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "var(--tx1)", fontSize: 11, letterSpacing: "0.08em", fontWeight: 600 }}>WORKFLOW TEMPLATE</div>
              <button
                className="btn"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => setTemplatePickerOpen(true)}
              >
                Browse Templates
              </button>
            </div>
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              style={{
                width: "100%",
                height: 34,
                background: "#111113",
                border: "1px solid #27272a",
                borderRadius: 6,
                padding: "7px 10px",
                color: selectedTemplateId ? "#d4d4d8" : "#52525b",
              }}
            >
              <option value="">Select a workflow template…</option>
              {workflowTemplates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
            {pipelineWorkflowId.trim() ? (
              <div style={{ display: "grid", gap: 6, borderTop: "1px solid #1e1e24", paddingTop: 8, marginTop: 2 }}>
                <div style={{ color: "var(--tx1)", fontSize: 11, letterSpacing: "0.08em", fontWeight: 600 }}>EDIT WITH AI</div>
                <textarea
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  placeholder='E.g. "Add a step to remove duplicates by email column"'
                  rows={2}
                  style={{
                    width: "100%",
                    background: "#111113",
                    border: "1px solid #27272a",
                    borderRadius: 6,
                    padding: "7px 10px",
                    color: "#d4d4d8",
                    fontSize: 12,
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleNlEdit();
                    }
                  }}
                />
                {nlFeedback && (
                  <div style={{ fontSize: 12, color: nlFeedback.ok ? "#22b573" : "#c94040", padding: "2px 0" }}>
                    {nlFeedback.ok ? "✓ " : "✗ "}{nlFeedback.msg}
                  </div>
                )}
                <button
                  onClick={() => void handleNlEdit()}
                  disabled={!nlPrompt.trim() || nlApplying}
                  style={{
                    background: nlApplying ? "#3f3f46" : "#18181e",
                    border: "1px solid #27272a",
                    borderRadius: 6,
                    color: !nlPrompt.trim() || nlApplying ? "#52525b" : "#5B6AF0",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "6px 12px",
                    cursor: !nlPrompt.trim() || nlApplying ? "not-allowed" : "pointer",
                    transition: "all 120ms",
                  }}
                >
                  {nlApplying ? "Applying…" : "Apply Edit"}
                </button>
              </div>
            ) : null}
            {runStatusSummary ? (
              <div
                style={{
                  background: "#111113",
                  border: "1px solid #27272a",
                  borderRadius: 6,
                  padding: "8px 10px",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: runStatusSummary.status === "success" ? "#22c55e" : "#ef4444",
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--tx1)" }}>
                  {runStatusSummary.status === "success"
                    ? `Completed · ${runStatusSummary.rows != null ? `${runStatusSummary.rows} rows` : "see results"}`
                    : "Failed · see results"}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "#3f3f46" }}>
                  {formatElapsed(runStatusSummary.elapsedMs)}
                </span>
              </div>
            ) : null}

            <button
              onClick={() => void handleRunWorkflowPipeline()}
              disabled={!activeDataset?.id || !(pipelineWorkflowId.trim() || selectedTemplateId.trim()) || runningWorkflow}
              onMouseEnter={() => setRunCtaHovered(true)}
              onMouseLeave={() => setRunCtaHovered(false)}
              style={{
                width: "100%",
                borderRadius: 7,
                padding: 10,
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                transition: "all 120ms ease",
                background: runningWorkflow ? "#3f3f46" : (runCtaHovered ? "#4f5edb" : "#5B6AF0"),
                transform: runCtaHovered && !runningWorkflow ? "translateY(-1px)" : "translateY(0)",
                boxShadow: runningWorkflow ? "none" : "0 2px 12px rgba(91,106,240,0.25)",
                cursor: runningWorkflow ? "not-allowed" : "pointer",
                opacity: runningWorkflow ? 0.9 : 1,
              }}
            >
              {runningWorkflow ? (
                <>
                  <span className="badge-dot pulse" style={{ background: "#a1a1aa" }} />
                  Running…
                </>
              ) : (
                <>
                  <IconPlay size={14} />
                  Run Pipeline
                </>
              )}
            </button>

            {runStatusSummary ? (
              <button
                onClick={() => void handleLoadRunArtifact()}
                onMouseEnter={() => setResultsHovered(true)}
                onMouseLeave={() => setResultsHovered(false)}
                disabled={!artifactRunId.trim() || artifactLoading}
                style={{
                  width: "100%",
                  border: `1px solid ${resultsHovered ? "#3f3f46" : "#27272a"}`,
                  borderRadius: 6,
                  background: resultsHovered ? "#1f1f22" : "transparent",
                  fontSize: 12,
                  color: resultsHovered ? "#a1a1aa" : "#71717a",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  padding: "8px 10px",
                  transition: "all 120ms ease",
                }}
                title={artifactRunId ? "Load artifact for the latest run" : "No run id available yet"}
              >
                <IconCopy size={13} />
                {artifactLoading ? "Loading Results..." : "View Run Results"}
              </button>
            ) : null}

            <button
              onClick={() => setAdvancedOpen((value) => !value)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "#3f3f46",
                fontSize: 11,
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              <span style={{ display: "inline-flex", transform: advancedOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>
                <IconChevronDown size={12} />
              </span>
              Advanced config
            </button>

            {advancedOpen ? (
              <div style={{ border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg3)", padding: 8, display: "grid", gap: 6 }}>
                <input
                  value={pipelineWorkflowId}
                  onChange={(event) => setPipelineWorkflowId(event.target.value)}
                  placeholder="Pipeline ID (optional override)"
                  className="mono"
                  style={{ width: "100%", height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
                  <input
                    value={bindingAlias}
                    onChange={(event) => setBindingAlias(event.target.value)}
                    placeholder="Alias"
                    style={{ height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
                  />
                  <select
                    value={bindingDatasetId}
                    onChange={(event) => setBindingDatasetId(event.target.value)}
                    style={{ height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
                  >
                    {availableDatasets.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                    ))}
                  </select>
                  <button className="btn" onClick={addBindingToRuntimeParameters} disabled={!availableDatasets.length}>
                    Add
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                  <select
                    value={bindingAliasToRemove}
                    onChange={(event) => setBindingAliasToRemove(event.target.value)}
                    style={{ height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
                    disabled={!currentBindingAliases.length}
                  >
                    <option value="">Select binding to remove</option>
                    {currentBindingAliases.map((alias) => (
                      <option key={alias} value={alias}>{alias}</option>
                    ))}
                  </select>
                  <button className="btn" onClick={removeBindingFromRuntimeParameters} disabled={!currentBindingAliases.length || !bindingAliasToRemove}>
                    Remove
                  </button>
                </div>

                {!currentBindingAliases.length ? (
                  <div style={{ color: "var(--tx2)", fontSize: 11 }}>No bindings configured.</div>
                ) : (
                  <div style={{ display: "grid", gap: 4 }}>
                    {currentBindingAliases.map((alias) => {
                      const value = currentBindings[alias];
                      const matchedDataset = availableDatasets.find((dataset) => dataset.id === String(value));
                      return (
                        <div key={alias} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                          <span className="mono" style={{ color: "var(--tx0)" }}>{alias}</span>
                          <span className="mono" style={{ color: "var(--tx1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {matchedDataset ? matchedDataset.id : String(value ?? "")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <button className="btn" onClick={() => void handleCopyRunId(artifactRunId)} disabled={!artifactRunId.trim()}>
                    Copy Run ID
                  </button>
                  <button className="btn" onClick={handleDownloadArtifactJson} disabled={!artifactData}>
                    Download Artifact JSON
                  </button>
                </div>
              </div>
            ) : null}

            {workflowMessage ? <div style={{ color: "var(--tx1)", fontSize: 11 }}>{workflowMessage}</div> : null}
          </div>

          <button className="btn" style={{ width: "100%" }} onClick={() => void runPipeline()} disabled={!steps.length}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconPlay size={14} />Run Applied Steps</span>
          </button>

          <button className="btn" style={{ width: "100%" }} onClick={() => void handleUndoLast()} disabled={!steps.length || undoing}>
            {undoing ? "Undoing..." : "Undo Last"}
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button className="btn" onClick={onSchedule}>Schedule</button>
            <button className="btn" onClick={onExport}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconDownload size={14} />Export</span></button>
          </div>

          {scheduleInfo ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--gr)" }}>
              <span className="badge-dot pulse" style={{ background: "var(--gr)" }} />
              <IconClock size={12} />
              <span className="mono" style={{ fontSize: 11 }}>{scheduleInfo.label}</span>
            </div>
          ) : null}
        </footer>
      ) : null}

      <TemplatePickerModal
        open={templatePickerOpen}
        workspaceId={activeProject?.workspaceId ?? "default"}
        onClose={() => setTemplatePickerOpen(false)}
        onCreated={(pipelineId, _pipelineName) => {
          setSelectedTemplateId(pipelineId);
          setPipelineWorkflowId(pipelineId);
          setWorkflowMessage(`Pipeline created from template. Ready to run.`);
        }}
      />
    </section>
  );
}
