import { useEffect, useRef, useState } from "react";
import { IconBarChart, IconChevronDown, IconClock, IconCode, IconCopy, IconDownload, IconFilter, IconGrid, IconMerge, IconPlay, IconPlus, IconSortAsc, IconSparkles, IconTrash, IconUpload, IconX } from "./Icons";
import { usePipelineContext, type PipelineStep } from "../contexts/PipelineContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import { usePipeline, type PipelineRunArtifact } from "../hooks/usePipeline";
import { useUser } from "../contexts/UserContext";
import { api } from "../api";
import { TemplatePickerModal } from "./modals/TemplatePickerModal";
import { WORKFLOW_TEMPLATES } from "../lib/workflowTemplates";

const FLAT_FILE_FORMATS = new Set(["csv", "xlsx", "xls", "excel", "json", "parquet", "txt", "tsv"]);

function getOperationIcon(op: string) {
  const n = op.toLowerCase();
  if (n.includes("filter")) return <IconFilter size={12} />;
  if (n.includes("join") || n.includes("merge")) return <IconMerge size={12} />;
  if (n.includes("sort")) return <IconSortAsc size={12} />;
  if (n.includes("clean") || n.includes("dedupe")) return <IconSparkles size={12} />;
  if (n.includes("summarise") || n.includes("group")) return <IconBarChart size={12} />;
  if (n.includes("pivot")) return <IconGrid size={12} />;
  if (n.includes("add_column") || n.includes("add column")) return <IconPlus size={12} />;
  return <IconCode size={12} />;
}

interface PipelineSectionProps {
  onSchedule: () => void;
  onExport: () => void;
  hideHeader?: boolean;
}

type ServerWorkflowTemplate = {
  id: string;
  name: string;
};

type RunStatusSummary = {
  status: "success" | "failure";
  elapsedMs: number;
  rows: number | null;
};

export function PipelineSection({ onSchedule, onExport, hideHeader = false }: PipelineSectionProps) {
  const { steps, removeStep, clearSteps, keepStepsThrough, runPipeline, scheduleInfo, renameStep, replaceSteps } = usePipelineContext();
  const { activeProject, activeDataset, setActiveDataset } = useWorkspaceContext();
  const { runPipelineWorkflow, getPipelineRunArtifact } = usePipeline();
  const { limits } = useUser();

  const [open, setOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [surgicalRemoving, setSurgicalRemoving] = useState(false);
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingStepName, setEditingStepName] = useState("");

  const [workflowTemplates, setWorkflowTemplates] = useState<ServerWorkflowTemplate[]>([]);
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
  const [builtInPickerOpen, setBuiltInPickerOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [nlPrompt, setNlPrompt] = useState("");
  const [nlApplying, setNlApplying] = useState(false);
  const [nlFeedback, setNlFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<{ message: string; run: () => Promise<void> } | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const planAllowsScheduling = limits.features.scheduledPipelines;
  const isFlatFile = Boolean(
    activeDataset?.format &&
    FLAT_FILE_FORMATS.has(activeDataset.format.toLowerCase()),
  );
  const canSchedule = planAllowsScheduling && !isFlatFile;
  const scheduleDisabledReason = !planAllowsScheduling
    ? "Upgrade to Professional or higher to enable pipeline scheduling."
    : isFlatFile
    ? "Scheduling is only available for database connections, not flat files (CSV, Excel, etc.)."
    : "";

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
    if (normalized === "source") return { background: "rgba(52,211,153,0.08)", color: "var(--gr)" };
    if (["transform", "group_by", "join", "filter"].includes(normalized)) return { background: "var(--acl)", color: "var(--accent2)" };
    if (["output", "export"].includes(normalized)) return { background: "#1a2a2a", color: "#38bdf8" };
    return { background: "var(--bg3)", color: "var(--tx2)" };
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
        const response = await api.get("/api/pipelines", { params: { limit: 100 } });
        const payload = response.data as { data?: { pipelines?: unknown[] }; pipelines?: unknown[] } | unknown[];
        let source: unknown[];
        if (Array.isArray(payload)) {
          source = payload;
        } else if (Array.isArray((payload as { data?: { pipelines?: unknown[] } }).data?.pipelines)) {
          source = (payload as { data: { pipelines: unknown[] } }).data.pipelines;
        } else if (Array.isArray((payload as { pipelines?: unknown[] }).pipelines)) {
          source = (payload as { pipelines: unknown[] }).pipelines;
        } else {
          source = [];
        }

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
        {
          prompt: nlPrompt.trim(),
          // Pass the active dataset ID so the LLM receives the real column schema
          dataset_id: activeDataset?.id ?? null,
        },
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

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as { steps?: unknown[] };
        const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
        if (!rawSteps.length) { setWorkflowMessage("No steps found in file."); return; }
        const mapped: PipelineStep[] = rawSteps.map((s, i) => ({
          ...(s as Partial<PipelineStep>),
          id: crypto.randomUUID(),
          stepNumber: i + 1,
          operation: (s as Partial<PipelineStep>).operation ?? "custom_sql",
          description: (s as Partial<PipelineStep>).description ?? `Step ${i + 1}`,
          appliedAt: new Date(),
        } as PipelineStep));
        replaceSteps(mapped);
        setWorkflowMessage(`Imported ${mapped.length} step${mapped.length !== 1 ? "s" : ""}.`);
      } catch {
        setWorkflowMessage("Failed to parse pipeline JSON.");
      }
    };
    reader.readAsText(file);
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

  const handleUndoLast = () => {
    const lastStep = steps[steps.length - 1];
    if (!lastStep?.inputDataset || undoing) return;
    const inputDs = lastStep.inputDataset;
    const prevStepId = steps[Math.max(steps.length - 2, 0)]?.id ?? "";
    const isOnlyStep = steps.length <= 1;
    setPendingAction({
      message: "Undo last step? This will remove 1 pipeline step.",
      run: async () => {
        setUndoing(true);
        try {
          setActiveDataset({ id: inputDs.id, name: inputDs.name, rows: inputDs.rows });
          keepStepsThrough(prevStepId);
          if (isOnlyStep) clearSteps();
        } finally {
          setUndoing(false);
        }
      },
    });
  };

  const handleUndoFromStep = (stepId: string) => {
    if (undoing) return;

    const stepIndex = steps.findIndex((step) => step.id === stepId);
    if (stepIndex < 0) return;

    const selectedStep = steps[stepIndex];
    if (!selectedStep.inputDataset) return;

    const removedCount = steps.length - stepIndex;
    const inputDs = selectedStep.inputDataset;
    const prevStepId = stepIndex > 0 ? steps[stepIndex - 1].id : null;
    setPendingAction({
      message: `Undo from this step? This will remove ${removedCount} pipeline ${removedCount === 1 ? "step" : "steps"}.`,
      run: async () => {
        setUndoing(true);
        try {
          setActiveDataset({ id: inputDs.id, name: inputDs.name, rows: inputDs.rows });
          if (prevStepId === null) { clearSteps(); return; }
          keepStepsThrough(prevStepId);
        } finally {
          setUndoing(false);
        }
      },
    });
  };

  const handleSurgicalRemove = (stepId: string) => {
    if (undoing || surgicalRemoving) return;

    const stepIndex = steps.findIndex((s) => s.id === stepId);
    if (stepIndex < 0) return;

    const stepsAfter = steps.slice(stepIndex + 1);

    // If there are no steps after, behave like undo-from-step
    if (stepsAfter.length === 0) {
      handleUndoFromStep(stepId);
      return;
    }

    // Determine the pivot dataset before prompting
    const pivotStep = stepIndex > 0 ? steps[stepIndex - 1] : null;
    const pivotDatasetId =
      pivotStep?.outputDataset?.id ??
      pivotStep?.inputDataset?.id ??
      steps[0]?.inputDataset?.id ??
      activeDataset?.id;

    if (!pivotDatasetId) {
      setInlineError("Cannot determine pivot dataset — please use Undo from this step instead.");
      return;
    }

    const stepLabel = getStepLabel(steps[stepIndex]);
    const replayStepPayloads = stepsAfter.map((s) => s.rawConfig ?? { operation: s.operation, sql: s.sql });
    const capturedStepsBefore = steps.slice(0, stepIndex);
    const capturedStepsAfter = stepsAfter;
    const capturedActiveDataset = activeDataset;
    setPendingAction({
      message: `Remove step "${stepLabel}" and re-run the ${stepsAfter.length} step${stepsAfter.length === 1 ? "" : "s"} that follow?`,
      run: async () => {
        setSurgicalRemoving(true);
        try {
          const response = await api.post(
            `/api/cleaning/datasets/${pivotDatasetId}/replay`,
            { steps: replayStepPayloads },
          );
          const data = response.data as {
            replayed_steps: Array<{ step_index: number; input_dataset_id: string; output_dataset_id: string; row_count: number | null; skipped: boolean }>;
            final_dataset_id: string;
            final_row_count: number | null;
          };
          const patchedAfter = capturedStepsAfter.map((s, i) => {
            const replay = data.replayed_steps[i];
            if (!replay) return s;
            return {
              ...s,
              inputDataset: s.inputDataset ? { ...s.inputDataset, id: replay.input_dataset_id } : s.inputDataset,
              outputDataset: (!replay.skipped && replay.output_dataset_id !== replay.input_dataset_id)
                ? { id: replay.output_dataset_id, name: s.outputDataset?.name ?? s.description, rowCount: replay.row_count ?? 0, parentId: replay.input_dataset_id }
                : s.outputDataset,
            };
          });
          replaceSteps([...capturedStepsBefore, ...patchedAfter]);
          if (data.final_dataset_id && data.final_dataset_id !== capturedActiveDataset?.id) {
            setActiveDataset({
              id: data.final_dataset_id,
              name: capturedActiveDataset?.name ?? "Cleaned dataset",
              rows: data.final_row_count ?? capturedActiveDataset?.rows ?? 0,
            });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setInlineError(`Surgical remove failed: ${msg} — Use "Undo from this step" to revert instead.`);
        } finally {
          setSurgicalRemoving(false);
        }
      },
    });
  };

  return (
    <section style={{ ...(hideHeader ? { padding: 8 } : { borderTop: "1px solid var(--bd)", paddingTop: 8, marginTop: 10 }), display: "flex", flexDirection: "column", minHeight: 0, gap: 8 }}>
      {!hideHeader && (
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => setOpen((value) => !value)} style={{ color: "var(--tx1)", fontSize: 11, letterSpacing: "0.08em", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {open ? "▼" : "▶"} PIPELINE
            <span
              style={{
                background: "var(--bg3)",
                borderRadius: 10,
                padding: "1px 7px",
                fontSize: 10,
                color: "var(--tx2)",
                letterSpacing: "normal",
              }}
            >
              {steps.length} {steps.length === 1 ? "step" : "steps"}
            </span>
          </button>
          {open ? (
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className="btn"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => setBuiltInPickerOpen(true)}
                title="Browse pipeline templates"
              >
                Templates
              </button>
              <button className="btn" style={{ width: 26, padding: 0 }} onClick={clearSteps} aria-label="Clear steps" title="Clear all steps">
                <IconTrash size={14} />
              </button>
            </div>
          ) : null}
        </header>
      )}

      {pendingAction && (
        <div style={{ background: "var(--bg3)", border: "1px solid var(--bd2)", borderRadius: "var(--r6)", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--tx0)" }}>{pendingAction.message}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn"
              style={{ fontSize: 11, padding: "3px 8px", background: "var(--rd)", border: "1px solid var(--rd)", color: "#fff" }}
              onClick={() => { void pendingAction.run(); setPendingAction(null); }}
            >
              Confirm
            </button>
            <button
              className="btn"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => setPendingAction(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {inlineError && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid var(--rd)", borderRadius: "var(--r6)", padding: "8px 12px", fontSize: 12, color: "var(--rd)", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ flex: 1 }}>{inlineError}</span>
          <button onClick={() => setInlineError(null)} style={{ background: "none", border: "none", color: "var(--tx2)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
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
                ? "var(--rd)"
                : stepStatus === "completed"
                ? "var(--gr)"
                : (stepStatus === "active" ? "var(--ac)" : "var(--bd3)");
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
                    background: isActiveStep ? "var(--acl)" : "transparent",
                    borderLeft: `2px solid ${isActiveStep ? "var(--ac)" : "transparent"}`,
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
                        flexShrink: 0,
                      }}
                      title={getStepLabel(step)}
                    >
                      {getOperationIcon(step.operation)}
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
                        onClick={() => handleUndoFromStep(step.id)}
                        disabled={undoing}
                      >
                        ↺
                      </button>
                      <button
                        className="btn"
                        style={{ height: 20, width: 20, padding: 0 }}
                        title={steps.length > 1 && index < steps.length - 1 ? "Surgical remove (re-runs downstream steps)" : "Remove step"}
                        onClick={() => handleSurgicalRemove(step.id)}
                        disabled={undoing || surgicalRemoving}
                      >
                        {surgicalRemoving ? "…" : <IconX size={12} />}
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
                        <span key={t} className="mono" style={{ fontSize: 10, color: "var(--tx1)", background: "var(--bg2)", borderRadius: 3, padding: "1px 4px", border: "1px solid var(--bd)" }}>
                          {t}
                        </span>
                      ))}
                      {step.input_tables?.length && step.output_table ? (
                        <span style={{ fontSize: 10, color: "var(--tx2)" }}>→</span>
                      ) : null}
                      {step.output_table ? (
                        <span className="mono" style={{ fontSize: 10, color: "var(--accent2)", background: "var(--acl)", borderRadius: 3, padding: "1px 4px", border: "1px solid var(--acg)" }}>
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
                          <span style={{ color: "var(--tx2)" }}>{step.row_count_after.toLocaleString()} rows</span>
                          {rowDelta !== null ? (
                            <span style={{ marginLeft: 4, color: rowDelta >= 0 ? "var(--gr)" : "var(--rd)" }}>
                              ({rowDelta >= 0 ? "+" : ""}{rowDelta.toLocaleString()})
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      {step.execution_time_ms != null ? (
                        <span style={{ color: "var(--tx2)" }}>{step.execution_time_ms}ms</span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Row 4: error message */}
                  {step.error_message ? (
                    <div style={{ paddingLeft: 24, fontSize: 10, color: "var(--rd)", wordBreak: "break-word" }}>
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
                        style={{ fontSize: 10, color: "var(--tx2)", textDecoration: "underline", cursor: "pointer" }}
                      >
                        {isSqlExpanded ? "hide SQL" : "show SQL"}
                      </button>
                      {isSqlExpanded ? (
                        <pre
                          className="mono"
                          style={{
                            marginTop: 4,
                            fontSize: 10,
                            color: "var(--tx1)",
                            background: "var(--bg0)",
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

            {pipelineWorkflowId.trim() ? (
              <div style={{ display: "grid", gap: 6, borderTop: "1px solid var(--bd)", paddingTop: 8, marginTop: 2 }}>
                <div style={{ color: "var(--tx1)", fontSize: 11, letterSpacing: "0.08em", fontWeight: 600 }}>EDIT WITH AI</div>
                <textarea
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  placeholder='E.g. "Add a step to remove duplicates by email column"'
                  rows={2}
                  style={{
                    width: "100%",
                    background: "var(--bg1)",
                    border: "1px solid var(--bd)",
                    borderRadius: 6,
                    padding: "7px 10px",
                    color: "var(--tx0)",
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
                  <div style={{ fontSize: 12, color: nlFeedback.ok ? "var(--gr)" : "var(--rd)", padding: "2px 0" }}>
                    {nlFeedback.ok ? "✓ " : "✗ "}{nlFeedback.msg}
                  </div>
                )}
                <button
                  onClick={() => void handleNlEdit()}
                  disabled={!nlPrompt.trim() || nlApplying}
                  style={{
                    background: nlApplying ? "var(--bg3)" : "var(--bg2)",
                    border: "1px solid var(--bd)",
                    borderRadius: 6,
                    color: !nlPrompt.trim() || nlApplying ? "var(--tx2)" : "var(--ac)",
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
                  background: "var(--bg1)",
                  border: "1px solid var(--bd)",
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
                    background: runStatusSummary.status === "success" ? "var(--gr)" : "var(--rd)",
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--tx1)" }}>
                  {runStatusSummary.status === "success"
                    ? `Completed · ${runStatusSummary.rows != null ? `${runStatusSummary.rows} rows` : "see results"}`
                    : "Failed · see results"}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--tx2)" }}>
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
                background: runningWorkflow ? "var(--bg3)" : (runCtaHovered ? "var(--ach)" : "var(--ac)"),
                transform: runCtaHovered && !runningWorkflow ? "translateY(-1px)" : "translateY(0)",
                boxShadow: runningWorkflow ? "none" : "0 2px 12px rgba(91,106,240,0.25)",
                cursor: runningWorkflow ? "not-allowed" : "pointer",
                opacity: runningWorkflow ? 0.9 : 1,
              }}
            >
              {runningWorkflow ? (
                <>
                  <span className="badge-dot pulse" style={{ background: "var(--tx1)" }} />
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
                  border: `1px solid ${resultsHovered ? "var(--bd3)" : "var(--bd)"}`,
                  borderRadius: 6,
                  background: resultsHovered ? "var(--bg3)" : "transparent",
                  fontSize: 12,
                  color: resultsHovered ? "var(--tx1)" : "var(--tx2)",
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
                color: "var(--tx2)",
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

          <button className="btn" style={{ width: "100%" }} onClick={() => handleUndoLast()} disabled={!steps.length || undoing}>
            {undoing ? "Undoing..." : "Undo Last"}
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <button
              className="btn"
              onClick={canSchedule ? onSchedule : undefined}
              disabled={!canSchedule}
              title={canSchedule ? "Schedule pipeline" : scheduleDisabledReason}
              style={{ opacity: canSchedule ? 1 : 0.35, cursor: canSchedule ? "pointer" : "not-allowed" }}
            >
              Schedule
            </button>
            <button className="btn" onClick={onExport}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconDownload size={14} />Export</span></button>
            <button className="btn" onClick={() => importFileRef.current?.click()}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconUpload size={14} />Import</span></button>
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

      {builtInPickerOpen ? (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setBuiltInPickerOpen(false)}
        >
          <div
            style={{ background: "var(--bg1)", border: "1px solid var(--bd2)", borderRadius: 12, width: 560, maxHeight: "80vh", overflowY: "auto", padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Quick-start Templates</span>
              <button onClick={() => setBuiltInPickerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx1)", padding: 4 }}>
                <IconX size={16} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--tx2)", marginBottom: 14 }}>
              Load a template to pre-fill the pipeline steps. You can edit any step before running.
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              {WORKFLOW_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  style={{ border: "1px solid var(--bd2)", borderRadius: 8, padding: "10px 12px", background: "var(--bg2)" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{tpl.icon} {tpl.name}</div>
                      <div style={{ color: "var(--tx2)", fontSize: 12, marginTop: 2 }}>{tpl.description}</div>
                      <div style={{ color: "var(--tx2)", fontSize: 11, marginTop: 4 }}>
                        {tpl.steps.length} steps &nbsp;·&nbsp; {tpl.hints[0]}
                      </div>
                    </div>
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: "4px 12px", whiteSpace: "nowrap" }}
                      onClick={() => {
                        replaceSteps(
                          tpl.steps.map((s) => ({
                            ...s,
                            id: crypto.randomUUID(),
                            appliedAt: new Date(),
                          }))
                        );
                        setBuiltInPickerOpen(false);
                      }}
                    >
                      Use template
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              style={{ marginTop: 16, background: "none", border: "none", color: "var(--ac)", fontSize: 12, cursor: "pointer", padding: 0 }}
              onClick={() => { setBuiltInPickerOpen(false); setTemplatePickerOpen(true); }}
            >
              Browse saved pipeline templates →
            </button>
          </div>
        </div>
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
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />
    </section>
  );
}
