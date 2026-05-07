import { useEffect, useRef, useState } from "react";
import { IconBarChart, IconClock, IconCode, IconDownload, IconEdit, IconFilter, IconGrid, IconMerge, IconPlay, IconPlus, IconSortAsc, IconSparkles, IconTrash, IconUpload, IconX } from "./Icons";
import { EditStepPanel } from "./EditStepPanel";
import { usePipelineContext, type PipelineStep } from "../contexts/PipelineContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";

import { useUser } from "../contexts/UserContext";
import { api } from "../api";
import { TemplatePickerModal } from "./modals/TemplatePickerModal";
import { WORKFLOW_TEMPLATES } from "../lib/workflowTemplates";

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
  onExport: () => void;
  hideHeader?: boolean;
  /** Called when the user clicks "Run Applied Steps" — replays the pipeline via the cleaning API */
  onRunPipeline?: () => Promise<void>;
}

export function PipelineSection({ onExport, hideHeader = false, onRunPipeline }: PipelineSectionProps) {
  const { steps, removeStep, clearSteps, keepStepsThrough, runPipeline, scheduleInfo, renameStep, replaceSteps, setLiveArtifact } = usePipelineContext();
  const { activeProject, activeDataset, setActiveDataset } = useWorkspaceContext();

  const [open, setOpen] = useState(true);

  // Inject keyframe animations once on mount to avoid stylesheet churn on every render
  useEffect(() => {
    const id = "pipeline-keyframes";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = [
        "@keyframes pipeline-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",
        "@keyframes pipeline-glow{0%,100%{box-shadow:0 0 20px rgba(91,106,240,0.4)}50%{box-shadow:0 0 36px rgba(124,58,237,0.6)}}",
        "@keyframes pipeline-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}",
      ].join("\n");
      document.head.appendChild(style);
    }
  }, []);
  const [undoing, setUndoing] = useState(false);
  const [surgicalRemoving, setSurgicalRemoving] = useState(false);
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingStepName, setEditingStepName] = useState("");

  const [editPanelStepId, setEditPanelStepId] = useState<string | null>(null);
  // Auto-close the edit panel if the step it's editing gets removed (e.g. via undo)
  useEffect(() => {
    if (editPanelStepId !== null && !steps.some((s) => s.id === editPanelStepId)) {
      setEditPanelStepId(null);
    }
  }, [steps, editPanelStepId]);
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [builtInPickerOpen, setBuiltInPickerOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [pendingAction, setPendingAction] = useState<{ message: string; run: () => Promise<void> } | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runSuccess, setRunSuccess] = useState(false);
  const runSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatStepLabel = (operation: string) => {
    const normalized = operation.replace(/_/g, " ").trim();
    if (!normalized) return "Step";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const getStepLabel = (step: (typeof steps)[0]) =>
    (step.description || formatStepLabel(step.operation));

  const getStepVisual = (operation: string) => {
    const normalized = operation.toLowerCase();
    if (normalized === "source") return { background: "rgba(52,211,153,0.08)", color: "var(--gr)" };
    if (["transform", "group_by", "join", "filter"].includes(normalized)) return { background: "var(--acl)", color: "var(--accent2)" };
    if (["output", "export"].includes(normalized)) return { background: "#1a2a2a", color: "#38bdf8" };
    return { background: "var(--bg3)", color: "var(--tx2)" };
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
        if (!rawSteps.length) { setInlineError("No steps found in file."); return; }
        const mapped: PipelineStep[] = rawSteps.map((s, i) => ({
          ...(s as Partial<PipelineStep>),
          id: crypto.randomUUID(),
          stepNumber: i + 1,
          operation: (s as Partial<PipelineStep>).operation ?? "custom_sql",
          description: (s as Partial<PipelineStep>).description ?? `Step ${i + 1}`,
          appliedAt: new Date(),
        } as PipelineStep));
        replaceSteps(mapped);
      } catch {
        setInlineError("Failed to parse pipeline JSON.");
      }
    };
    reader.readAsText(file);
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

    // AI agent steps run in a DuckDB session only — they never have DB dataset IDs.
    // Replaying them via the cleaning API is wrong; just remove from context directly.
    const removedStep = steps[stepIndex];
    const allSessionOnly =
      !removedStep.outputDataset?.id &&
      !removedStep.inputDataset?.id &&
      stepsAfter.every((s) => !s.outputDataset?.id && !s.inputDataset?.id);
    if (allSessionOnly) {
      setLiveArtifact(null);
      removeStep(stepId);
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
            `/cleaning/datasets/${pivotDatasetId}/replay`,
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

  const handleEditApplied = (
    updatedSteps: typeof steps,
    finalDatasetId: string | null,
    finalRowCount: number | null,
  ) => {
    replaceSteps(updatedSteps);
    setLiveArtifact(null); // live DuckDB table is stale after a replay-based edit
    if (finalDatasetId && finalDatasetId !== activeDataset?.id) {
      setActiveDataset({
        id: finalDatasetId,
        name: activeDataset?.name ?? "Cleaned dataset",
        rows: finalRowCount ?? activeDataset?.rows ?? 0,
      });
    }
    setEditPanelStepId(null);
  };

  const handleRun = async () => {
    if (running || !steps.length) return;
    setRunning(true);
    setRunSuccess(false);
    try {
      if (onRunPipeline) await onRunPipeline();
      else await runPipeline();
      setRunSuccess(true);
      if (runSuccessTimerRef.current) clearTimeout(runSuccessTimerRef.current);
      runSuccessTimerRef.current = setTimeout(() => setRunSuccess(false), 2500);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : "Pipeline run failed");
    } finally {
      setRunning(false);
    }
  };

  // Cleanup success timer on unmount to prevent state update on unmounted component
  useEffect(() => () => { if (runSuccessTimerRef.current) clearTimeout(runSuccessTimerRef.current); }, []);

  /** Strip dataset name prefix from step labels for cleaner display */
  const cleanStepLabel = (label: string) => {
    const dsName = activeDataset?.name;
    if (dsName && label.toLowerCase().startsWith(dsName.toLowerCase())) {
      const rest = label.slice(dsName.length).replace(/^\s*[-–—:_]\s*/, "").trim();
      if (rest) return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
    return label;
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
              <button className="btn" style={{ width: 26, padding: 0 }} onClick={() => setPendingAction({ message: "Clear all pipeline steps? This cannot be undone.", run: async () => { clearSteps(); } })} aria-label="Clear steps" title="Clear all steps">
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

            <div style={{ borderBottom: "1px solid var(--bd)", minHeight: 28, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", color: "var(--tx1)", cursor: "pointer" }}
              onClick={() => window.dispatchEvent(new CustomEvent("datahub:view:source"))}
              title="Click to view original source data"
            >
              <span style={{ fontSize: 12 }}>📄 Source</span>
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
                        role="button"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent("datahub:preview:step", { detail: { stepIndex: index } }));
                        }}
                        style={{
                          minWidth: 0,
                          color: "var(--tx0)",
                          fontSize: 12,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontWeight: isActiveStep ? 600 : 400,
                          cursor: "pointer",
                        }}
                        title={`Click to preview: ${getStepLabel(step)}`}
                      >
                        {cleanStepLabel(getStepLabel(step))}
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
                      {/* Edit SQL — only show when the step has SQL to edit */}
                      {step.sql ? (
                        <button
                          className="btn"
                          style={{
                            height: 20,
                            width: 20,
                            padding: 0,
                            background: editPanelStepId === step.id ? "var(--acl)" : undefined,
                            border: editPanelStepId === step.id ? "1px solid var(--ac)" : undefined,
                          }}
                          title="Edit step SQL"
                          onClick={() =>
                            setEditPanelStepId((prev) => (prev === step.id ? null : step.id))
                          }
                          disabled={editPanelStepId !== null && editPanelStepId !== step.id}
                        >
                          <IconEdit size={12} />
                        </button>
                      ) : null}
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

                  {/* Edit step panel — expands below the step row */}
                  {editPanelStepId === step.id ? (
                    <EditStepPanel
                      step={step}
                      stepIndex={index}
                      allSteps={steps}
                      activeDataset={activeDataset}
                      onClose={() => setEditPanelStepId(null)}
                      onApplied={handleEditApplied}
                    />
                  ) : null}

                  {/* Row 2: input → output table flow (only when SQL expanded) */}
                  {isSqlExpanded && (step.input_tables?.length || step.output_table) ? (
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

      {open ? (
        <footer style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <button
            onClick={() => void handleRun()}
            disabled={!steps.length || running}
            style={{
              width: "100%",
              borderRadius: 8,
              padding: "12px 10px",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: running
                ? "linear-gradient(135deg, #5b6af0, #7c3aed, #5b6af0)"
                : runSuccess
                  ? "linear-gradient(135deg, #059669, #22c55e)"
                  : steps.length
                    ? "var(--ac)"
                    : "var(--bg3)",
              backgroundSize: running ? "200% 100%" : "100% 100%",
              animation: running ? "pipeline-shimmer 2s ease infinite, pipeline-glow 1.5s ease-in-out infinite" : "none",
              boxShadow: running
                ? "0 0 24px rgba(91,106,240,0.5)"
                : runSuccess
                  ? "0 0 20px rgba(34,197,94,0.4)"
                  : steps.length
                    ? "0 2px 12px rgba(91,106,240,0.25)"
                    : "none",
              cursor: (!steps.length || running) ? "not-allowed" : "pointer",
              opacity: steps.length ? 1 : 0.5,
              transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {running ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ animation: "pipeline-spin 0.8s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.2-8.55" strokeLinecap="round" />
                </svg>
                Running pipeline…
              </>
            ) : runSuccess ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Pipeline complete
              </>
            ) : (
              <>
                <IconPlay size={14} />
                Run Applied Steps
              </>
            )}
          </button>

          <button className="btn" style={{ width: "100%" }} onClick={() => handleUndoLast()} disabled={!steps.length || undoing}>
            {undoing ? "Undoing..." : "Undo Last"}
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
        workspaceId="default"
        onClose={() => setTemplatePickerOpen(false)}
        onCreated={(_pipelineId, _pipelineName) => {
          setTemplatePickerOpen(false);
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
