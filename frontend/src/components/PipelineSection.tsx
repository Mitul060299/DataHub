import { useState } from "react";
import { IconClock, IconDownload, IconPlay, IconTrash } from "./Icons";
import { usePipelineContext } from "../contexts/PipelineContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";

interface PipelineSectionProps {
  onSchedule: () => void;
  onExport: () => void;
}

export function PipelineSection({ onSchedule, onExport }: PipelineSectionProps) {
  const { steps, clearSteps, keepStepsThrough, runPipeline, scheduleInfo } = usePipelineContext();
  const { activeDataset, setActiveDataset } = useWorkspaceContext();
  const [open, setOpen] = useState(true);
  const [undoing, setUndoing] = useState(false);

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
          {!steps.length ? <p style={{ color: "var(--tx2)" }}>No steps yet. Use the AI agent to start.</p> : null}
          {steps.map((step, index) => (
            <div key={step.id} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 8 }}>
              <div style={{ display: "grid", justifyItems: "center", color: "var(--gr)" }}>
                <span style={{ width: 16, height: 16, borderRadius: 999, border: "1px solid var(--gr)", fontSize: 10, display: "grid", placeItems: "center" }}>{index + 1}</span>
                {index !== steps.length - 1 ? <span style={{ width: 1, background: "var(--bd2)", minHeight: 18 }} /> : null}
              </div>
              <div style={{ paddingBottom: 8 }}>
                <p className="mono" style={{ fontSize: 12 }}>{step.operation}</p>
                <p style={{ color: "var(--tx1)", fontSize: 12 }}>{step.description}</p>
                {step.affectedRows ? <p className="mono" style={{ color: "var(--tx1)", fontSize: 11 }}>{step.affectedRows} rows</p> : null}
                {step.inputDataset ? (
                  <button
                    className="btn"
                    style={{ marginTop: 6, height: 24, fontSize: 11 }}
                    onClick={() => void handleUndoFromStep(step.id)}
                    disabled={undoing}
                  >
                    Undo From Here
                  </button>
                ) : null}
              </div>
            </div>
          ))}
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
