import { useState } from "react";
import { IconClock, IconDownload, IconPlay, IconTrash, IconX } from "./Icons";
import { usePipelineContext } from "../contexts/PipelineContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";

interface PipelineSectionProps {
  onSchedule: () => void;
  onExport: () => void;
}

export function PipelineSection({ onSchedule, onExport }: PipelineSectionProps) {
  const { steps, removeStep, clearSteps, keepStepsThrough, runPipeline, scheduleInfo } = usePipelineContext();
  const { activeDataset, setActiveDataset } = useWorkspaceContext();
  const [open, setOpen] = useState(true);
  const [undoing, setUndoing] = useState(false);
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);

  const formatStepLabel = (operation: string) => {
    const normalized = operation.replace(/_/g, " ").trim();
    if (!normalized) return "Step";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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
    } catch {
      return;
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
        <button onClick={() => setOpen((value) => !value)} style={{ color: "var(--tx1)", fontSize: 11, letterSpacing: "0.08em" }}>
          {open ? "▼" : "▶"} PIPELINE
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

            {steps.map((step, index) => (
              (() => {
                const isActiveStep = index === steps.length - 1;
                return (
              <div
                key={step.id}
                onMouseEnter={() => setHoveredStepId(step.id)}
                onMouseLeave={() => setHoveredStepId((current) => (current === step.id ? null : current))}
                style={{
                  minHeight: 30,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  padding: "0 6px 0 6px",
                  borderBottom: index === steps.length - 1 ? "none" : "1px solid var(--bd)",
                  background: isActiveStep ? "var(--acl)" : "transparent",
                  borderLeft: `2px solid ${isActiveStep ? "var(--ac)" : "transparent"}`,
                }}
              >
                <button
                  onClick={() => void handleUndoFromStep(step.id)}
                  disabled={undoing}
                  style={{
                    textAlign: "left",
                    minWidth: 0,
                    color: "var(--tx0)",
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={step.description || formatStepLabel(step.operation)}
                >
                  {formatStepLabel(step.operation)}
                </button>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    opacity: hoveredStepId === step.id ? 1 : 0,
                    pointerEvents: hoveredStepId === step.id ? "auto" : "none",
                    transition: "opacity 120ms ease",
                  }}
                >
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
              </div>
                );
              })()
            ))}
          </div>
        </div>
      ) : null}
      {open && (steps.length || activeDataset?.id) ? (
        <footer style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => void runPipeline()} disabled={!steps.length}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconPlay size={14} />Run Pipeline</span>
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
    </section>
  );
}
