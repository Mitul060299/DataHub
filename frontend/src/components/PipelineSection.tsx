import { Fragment, useEffect, useRef, useState } from "react";
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
  const { steps, removeStep, clearSteps, keepStepsThrough, runPipeline, scheduleInfo, renameStep, replaceSteps, liveArtifact, setLiveArtifact, appliedThroughStepId, setAppliedThrough, pendingForkParentStepId, forkAtStep } = usePipelineContext();
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

  /**
   * Phase 1 — "Run up to here": switches the active dataset to step N's
   * output without running any steps after N.  Later steps stay listed but
   * are shown faded with a "Resume" banner.  Non-destructive (cf. Undo from).
   */
  const handleRunUpTo = async (stepId: string) => {
    const stepIndex = steps.findIndex((s) => s.id === stepId);
    if (stepIndex < 0) return;
    const step = steps[stepIndex];

    // Fast-path: the step already has a materialized output dataset — just
    // switch to it without hitting the backend.
    if (step.outputDataset?.id) {
      setActiveDataset({
        id: step.outputDataset.id,
        name: step.outputDataset.name ?? activeDataset?.name ?? "Cleaned dataset",
        rows: step.outputDataset.rowCount ?? activeDataset?.rows ?? 0,
      });
      setAppliedThrough(stepId);
      window.dispatchEvent(new CustomEvent("datahub:toast", {
        detail: { message: `Viewing pipeline up to step ${step.stepNumber}: ${getStepLabel(step)}`, tone: "info" },
      }));
      return;
    }

    // Otherwise we need to replay up to this step from the source dataset.
    const baseDatasetId = steps[0]?.inputDataset?.id ?? activeDataset?.id;
    if (!baseDatasetId) {
      setInlineError("Cannot determine base dataset for replay.");
      return;
    }
    const stepsToRun = steps.slice(0, stepIndex + 1);
    const replayPayloads = stepsToRun.map((s) => s.rawConfig ?? { operation: s.operation, sql: s.sql });
    setRunning(true);
    try {
      const response = await api.post(`/cleaning/datasets/${baseDatasetId}/replay`, {
        steps: replayPayloads,
        up_to_step_number: stepIndex + 1,
      });
      const data = response.data as {
        final_dataset_id: string;
        final_row_count: number | null;
        replayed_steps: Array<{ step_index: number; input_dataset_id: string; output_dataset_id: string; row_count: number | null; skipped: boolean }>;
      };
      if (data.final_dataset_id) {
        setActiveDataset({
          id: data.final_dataset_id,
          name: activeDataset?.name ?? "Cleaned dataset",
          rows: data.final_row_count ?? 0,
        });
      }
      setAppliedThrough(stepId);
      window.dispatchEvent(new CustomEvent("datahub:toast", {
        detail: { message: `Viewing pipeline up to step ${step.stepNumber}: ${getStepLabel(step)}`, tone: "info" },
      }));
    } catch (err: unknown) {
      setInlineError(`Run up to step failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  /**
   * Phase 2 — "Fork from here": sets the active dataset to step N's output
   * and primes PipelineContext so the next step the user adds will branch off
   * step N (parentStepId = step N's id).
   *
   * IMPORTANT: most pipeline steps run in the DuckDB session and never
   * materialise a real outputDataset.id — in that case we must instead
   * repoint liveArtifact.tableName to step N's output_table so the AI
   * agent's next transform reads from THAT table, not the trunk leaf.
   * Without this the fork toast fires but the next step still operates on
   * the most-recent session table (the bug reported on 2026-05-13).
   */
  const handleForkAtStep = (stepId: string) => {
    const stepIndex = steps.findIndex((s) => s.id === stepId);
    if (stepIndex < 0) return;
    const step = steps[stepIndex];

    // 1. Switch the active dataset if the step materialised one.
    if (step.outputDataset?.id) {
      setActiveDataset({
        id: step.outputDataset.id,
        name: step.outputDataset.name ?? activeDataset?.name ?? "Cleaned dataset",
        rows: step.outputDataset.rowCount ?? activeDataset?.rows ?? 0,
      });
    }

    // 2. Repoint liveArtifact (the AI agent's input pointer) to step N's
    //    session output_table.  This is what fixes the "new branch step
    //    runs on trunk leaf data" bug for session-only pipelines.
    const stepOutputTable = step.output_table
      || (typeof step.rawConfig?.output_table === "string" ? step.rawConfig.output_table as string : undefined)
      || (typeof step.rawConfig?.session_table_name === "string" ? step.rawConfig.session_table_name as string : undefined);

    // Resolve a stable session id even when no AI chat has run yet today
    // (covers the "open page → immediately fork" case where liveArtifact is null).
    const resolvedSessionId = liveArtifact?.sessionId
      || (activeDataset?.id ? localStorage.getItem(`datahub_chat_session_${activeDataset.id}`) : null)
      || crypto.randomUUID();
    if (activeDataset?.id && !localStorage.getItem(`datahub_chat_session_${activeDataset.id}`)) {
      localStorage.setItem(`datahub_chat_session_${activeDataset.id}`, resolvedSessionId);
    }

    if (stepOutputTable) {
      setLiveArtifact({
        tableName: stepOutputTable,
        rowCount: step.row_count_after ?? (Number(step.affectedRows) || liveArtifact?.rowCount || 0),
        stepLabel: getStepLabel(step),
        sessionId: resolvedSessionId,
      });
    }

    // 3. Refresh the Data tab so the preview reflects step N (not trunk leaf).
    //    Pass the resolved session id explicitly so CanvasPanel doesn't race
    //    on the React closure of liveArtifact.
    window.dispatchEvent(new CustomEvent("datahub:preview:step", {
      detail: { stepIndex, sessionId: resolvedSessionId },
    }));

    // 4. Prime PipelineContext so the next committed step gets parentStepId = step N.
    forkAtStep(stepId);

    window.dispatchEvent(new CustomEvent("datahub:toast", {
      detail: {
        message: `Branched off step ${step.stepNumber} — your next action starts a new branch`,
        tone: "info",
      },
    }));
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
              <button className="btn" style={{ width: 26, padding: 0 }} onClick={() => setPendingAction({ message: "Clear all pipeline steps? This cannot be undone.", run: async () => { clearSteps(); window.dispatchEvent(new CustomEvent("datahub:toast", { detail: { message: "Pipeline cleared", tone: "success" } })); } })} aria-label="Clear steps" title="Clear all steps">
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
          {/* Phase 2 — Fork-pending banner: shown after ⫰ click, cleared on next step commit or cancel */}
          {pendingForkParentStepId && steps.some((s) => s.id === pendingForkParentStepId) && (() => {
            const parent = steps.find((s) => s.id === pendingForkParentStepId);
            if (!parent) return null;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(124,58,237,0.08)", border: "1px solid var(--accent2)", borderRadius: "var(--r6)", padding: "7px 10px", fontSize: 12 }}>
                <span style={{ flex: 1, color: "var(--tx1)" }}>
                  ⫰ Forking from step {parent.stepNumber}. Your next action starts a new branch.
                </span>
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: "3px 8px" }}
                  onClick={() => forkAtStep(null)}
                  title="Cancel fork — next action will continue on the current branch"
                >
                  Cancel
                </button>
              </div>
            );
          })()}
          {/* Phase 1 — "Run up to here" Resume banner */}
          {appliedThroughStepId && steps.some((s) => s.id === appliedThroughStepId) && (() => {
            const idx = steps.findIndex((s) => s.id === appliedThroughStepId);
            const nextStep = steps[idx + 1];
            if (!nextStep) return null;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(91,106,240,0.08)", border: "1px solid var(--acg)", borderRadius: "var(--r6)", padding: "7px 10px", fontSize: 12 }}>
                <span style={{ flex: 1, color: "var(--tx1)" }}>
                  Viewing up to step {steps[idx].stepNumber}. Steps {nextStep.stepNumber}+ are paused.
                </span>
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: "3px 10px", background: "var(--acl)", border: "1px solid var(--acg)", color: "var(--ac)", display: "inline-flex", alignItems: "center", gap: 5 }}
                  onClick={() => { setAppliedThrough(null); void handleRun(); }}
                >
                  <IconPlay size={11} /> Resume from step {nextStep.stepNumber}
                </button>
              </div>
            );
          })()}
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
            ) : (
              /* Per-step rows used to be rendered here. They have been moved
                 onto the graph nodes themselves (edit / fork / rename /
                 delete buttons live on each operation node) so that adding
                 more steps never pushes the Run / Import / Export footer
                 out of view. We keep a tiny summary line so users still see
                 the step count at a glance. */
              <div style={{ minHeight: 36, display: "grid", placeItems: "center", color: "var(--tx2)", fontSize: 12, padding: "8px 10px", textAlign: "center", lineHeight: 1.4 }}>
                {steps.length} {steps.length === 1 ? "step" : "steps"} · click a node in the graph to inspect or edit
              </div>
            )}
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
