import { useEffect, useState } from "react";
import { IconClock, IconDownload, IconPlay, IconTrash, IconX } from "./Icons";
import { usePipelineContext } from "../contexts/PipelineContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import { usePipeline, type PipelineRunArtifact } from "../hooks/usePipeline";
import { api } from "../api";

interface PipelineSectionProps {
  onSchedule: () => void;
  onExport: () => void;
}

export function PipelineSection({ onSchedule, onExport }: PipelineSectionProps) {
  const { steps, removeStep, clearSteps, keepStepsThrough, runPipeline, scheduleInfo } = usePipelineContext();
  const { activeProject, activeDataset, setActiveDataset } = useWorkspaceContext();
  const { runPipelineWorkflow, getPipelineRunArtifact } = usePipeline();
  const [open, setOpen] = useState(true);
  const [undoing, setUndoing] = useState(false);
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
  const [pipelineWorkflowId, setPipelineWorkflowId] = useState("");
  const [runtimeParametersText, setRuntimeParametersText] = useState("{}");
  const [runningWorkflow, setRunningWorkflow] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [availableDatasets, setAvailableDatasets] = useState<Array<{ id: string; name: string }>>([]);
  const [bindingAlias, setBindingAlias] = useState("ref_data");
  const [bindingDatasetId, setBindingDatasetId] = useState("");
  const [bindingAliasToRemove, setBindingAliasToRemove] = useState("");
  const [artifactRunId, setArtifactRunId] = useState("");
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactData, setArtifactData] = useState<PipelineRunArtifact | null>(null);

  const formatStepLabel = (operation: string) => {
    const normalized = operation.replace(/_/g, " ").trim();
    if (!normalized) return "Step";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  useEffect(() => {
    const loadDatasets = async () => {
      try {
        const response = await api.get("/datasets", { params: { project_id: activeProject?.id } });
        const mapped = (response.data ?? []).map((item: Record<string, unknown>) => ({
          id: String(item.id ?? item.dataset_id ?? ""),
          name: String(item.name ?? item.filename ?? item.table_name ?? "dataset"),
        })).filter((item: { id: string }) => Boolean(item.id));
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

  const addBindingToRuntimeParameters = () => {
    const alias = bindingAlias.trim();
    if (!alias || !bindingDatasetId) {
      setWorkflowMessage("Alias and dataset are required for binding.");
      return;
    }

    let parsedParameters: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(runtimeParametersText || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setWorkflowMessage("Runtime parameters must be a JSON object before adding bindings.");
        return;
      }
      parsedParameters = parsed as Record<string, unknown>;
    } catch {
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

  const getCurrentDatasetBindings = (): Record<string, unknown> => {
    try {
      const parsed = JSON.parse(runtimeParametersText || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      const bindings = (parsed as Record<string, unknown>).dataset_bindings;
      if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
        return {};
      }
      return bindings as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const removeBindingFromRuntimeParameters = () => {
    const alias = bindingAliasToRemove.trim();
    if (!alias) {
      setWorkflowMessage("Select a binding alias to remove.");
      return;
    }

    let parsedParameters: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(runtimeParametersText || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setWorkflowMessage("Runtime parameters must be a JSON object before removing bindings.");
        return;
      }
      parsedParameters = parsed as Record<string, unknown>;
    } catch {
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

  const currentBindingAliases = Object.keys(getCurrentDatasetBindings());
  const currentBindings = getCurrentDatasetBindings();

  const handleRunWorkflowPipeline = async () => {
    if (!activeDataset?.id || !pipelineWorkflowId.trim() || runningWorkflow) return;

    let parsedParameters: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(runtimeParametersText || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsedParameters = parsed as Record<string, unknown>;
      } else {
        setWorkflowMessage("Runtime parameters must be a JSON object.");
        return;
      }
    } catch {
      setWorkflowMessage("Runtime parameters JSON is invalid.");
      return;
    }

    setRunningWorkflow(true);
    setWorkflowMessage(null);
    try {
      await runPipelineWorkflow(pipelineWorkflowId.trim(), {
        input_dataset_id: activeDataset.id,
        runtime_parameters: parsedParameters,
        triggered_by: "manual",
      });
      setWorkflowMessage("Workflow pipeline run started.");
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: string } }; message?: string };
      setWorkflowMessage(maybeError.response?.data?.detail ?? maybeError.message ?? "Unable to start workflow pipeline run.");
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
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: string } }; message?: string };
      setArtifactData(null);
      setWorkflowMessage(maybeError.response?.data?.detail ?? maybeError.message ?? "Unable to load run artifact.");
    } finally {
      setArtifactLoading(false);
    }
  };

  const handleCopyRunId = async () => {
    if (!artifactRunId.trim()) {
      setWorkflowMessage("Enter a run ID to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(artifactRunId.trim());
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
          <div style={{ border: "1px solid var(--bd2)", borderRadius: "var(--r8)", background: "var(--bg2)", padding: 8, display: "grid", gap: 8 }}>
            <div style={{ color: "var(--tx1)", fontSize: 11, letterSpacing: "0.08em", fontWeight: 600 }}>WORKFLOW RUN CONFIG</div>
            <input
              value={pipelineWorkflowId}
              onChange={(event) => setPipelineWorkflowId(event.target.value)}
              placeholder="Workflow Pipeline ID"
              style={{ width: "100%", height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg3)", padding: "0 8px" }}
            />
            <textarea
              value={runtimeParametersText}
              onChange={(event) => setRuntimeParametersText(event.target.value)}
              rows={4}
              placeholder='{"dataset_bindings":{"ref_data":"<dataset-id>"}}'
              style={{ width: "100%", resize: "vertical", border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg3)", padding: 8 }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
              <input
                value={bindingAlias}
                onChange={(event) => setBindingAlias(event.target.value)}
                placeholder="Alias (e.g. ref_data)"
                style={{ height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg3)", padding: "0 8px" }}
              />
              <select
                value={bindingDatasetId}
                onChange={(event) => setBindingDatasetId(event.target.value)}
                style={{ height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg3)", padding: "0 8px" }}
              >
                {availableDatasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                ))}
              </select>
              <button className="btn" onClick={addBindingToRuntimeParameters} disabled={!availableDatasets.length}>
                Add Binding
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
              <select
                value={bindingAliasToRemove}
                onChange={(event) => setBindingAliasToRemove(event.target.value)}
                style={{ height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg3)", padding: "0 8px" }}
                disabled={!currentBindingAliases.length}
              >
                <option value="">Select binding to remove</option>
                {currentBindingAliases.map((alias) => (
                  <option key={alias} value={alias}>{alias}</option>
                ))}
              </select>
              <button className="btn" onClick={removeBindingFromRuntimeParameters} disabled={!currentBindingAliases.length || !bindingAliasToRemove}>
                Remove Binding
              </button>
            </div>
            <div style={{ border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg3)", padding: 8 }}>
              <div style={{ color: "var(--tx1)", fontSize: 11, marginBottom: 6 }}>Current Bindings</div>
              {!currentBindingAliases.length ? (
                <div style={{ color: "var(--tx2)", fontSize: 11 }}>No dataset bindings configured.</div>
              ) : (
                <div style={{ display: "grid", gap: 4 }}>
                  {currentBindingAliases.map((alias) => {
                    const value = currentBindings[alias];
                    const matchedDataset = availableDatasets.find((dataset) => dataset.id === String(value));
                    return (
                      <div key={alias} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                        <span className="mono" style={{ color: "var(--tx0)" }}>{alias}</span>
                        <span style={{ color: "var(--tx1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {matchedDataset ? `${matchedDataset.name} (${matchedDataset.id})` : String(value ?? "")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <button className="btn" style={{ width: "100%" }} onClick={() => void handleRunWorkflowPipeline()} disabled={!activeDataset?.id || !pipelineWorkflowId.trim() || runningWorkflow}>
              {runningWorkflow ? "Starting Workflow Run..." : "Run Workflow Pipeline"}
            </button>
            <div style={{ border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg3)", padding: 8, display: "grid", gap: 6 }}>
              <div style={{ color: "var(--tx1)", fontSize: 11 }}>Run Artifact Viewer</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                <input
                  value={artifactRunId}
                  onChange={(event) => setArtifactRunId(event.target.value)}
                  placeholder="Run ID"
                  style={{ height: 28, border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: "0 8px" }}
                />
                <button className="btn" onClick={() => void handleLoadRunArtifact()} disabled={!artifactRunId.trim() || artifactLoading}>
                  {artifactLoading ? "Loading..." : "Load"}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button className="btn" onClick={() => void handleCopyRunId()} disabled={!artifactRunId.trim()}>
                  Copy Run ID
                </button>
                <button className="btn" onClick={handleDownloadArtifactJson} disabled={!artifactData}>
                  Download Artifact JSON
                </button>
              </div>
              {artifactData ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--tx1)" }}>
                    Status: {artifactData.run.status} · Output Rows: {artifactData.output.row_count}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--tx1)", maxHeight: 84, overflow: "auto", border: "1px solid var(--bd2)", borderRadius: "var(--r6)", padding: 6, background: "var(--bg2)" }}>
                    Params: {JSON.stringify(artifactData.runtime_parameters)}
                  </div>
                  <div style={{ maxHeight: 120, overflow: "auto", border: "1px solid var(--bd2)", borderRadius: "var(--r6)", background: "var(--bg2)", padding: 6 }}>
                    <div className="mono" style={{ fontSize: 11, color: "var(--tx1)", marginBottom: 4 }}>Preview</div>
                    {!artifactData.output.preview_rows.length ? (
                      <div style={{ color: "var(--tx2)", fontSize: 11 }}>No preview rows available.</div>
                    ) : (
                      artifactData.output.preview_rows.slice(0, 5).map((row, index) => (
                        <div key={`artifact-row-${index}`} className="mono" style={{ fontSize: 11, color: "var(--tx1)", borderTop: index ? "1px solid var(--bd)" : "none", paddingTop: index ? 4 : 0, marginTop: index ? 4 : 0 }}>
                          {JSON.stringify(row)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            {workflowMessage ? <div style={{ color: "var(--tx1)", fontSize: 11 }}>{workflowMessage}</div> : null}
          </div>
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
