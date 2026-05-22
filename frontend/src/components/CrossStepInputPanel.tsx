/**
 * CrossStepInputPanel — modal picker for adding cross-pipeline step inputs.
 *
 * Two-pane layout:
 *   Left: tree of user's datasets → their steps with snapshots.
 *   Right: currently linked inputs for this dataset, with remove button.
 *
 * Adding an input calls POST /datasets/{datasetId}/cross-inputs.
 * Removing calls DELETE /datasets/{datasetId}/cross-inputs/{inputId}.
 */
import { useEffect, useState, useRef } from "react";
import {
  fetchUserStepSnapshots,
  listCrossInputs,
  addCrossInput,
  removeCrossInput,
  type StepSnapshotOut,
  type CrossPipelineInputOut,
} from "../api";

interface CrossStepInputPanelProps {
  open: boolean;
  onClose: () => void;
  datasetId: string;
  datasetName: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "input";
}

export function CrossStepInputPanel({
  open,
  onClose,
  datasetId,
  datasetName,
}: CrossStepInputPanelProps) {
  const [snapshots, setSnapshots] = useState<StepSnapshotOut[]>([]);
  const [inputs, setInputs] = useState<CrossPipelineInputOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<StepSnapshotOut | null>(null);
  const [alias, setAlias] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const aliasRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    Promise.all([fetchUserStepSnapshots(), listCrossInputs(datasetId)])
      .then(([snaps, current]) => {
        setSnapshots(snaps.filter((s) => s.dataset_id !== datasetId));
        setInputs(current);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [open, datasetId]);

  useEffect(() => {
    if (selectedStep) {
      const proposed = slugify(
        selectedStep.dataset_name
          ? `${selectedStep.dataset_name}_step${selectedStep.step_number}`
          : `step${selectedStep.step_number}`,
      );
      setAlias(proposed);
      setTimeout(() => aliasRef.current?.focus(), 80);
    }
  }, [selectedStep]);

  if (!open) return null;

  // Group snapshots by dataset
  const byDataset = new Map<string, { name: string; steps: StepSnapshotOut[] }>();
  for (const snap of snapshots) {
    if (!byDataset.has(snap.dataset_id)) {
      byDataset.set(snap.dataset_id, { name: snap.dataset_name ?? snap.dataset_id, steps: [] });
    }
    byDataset.get(snap.dataset_id)!.steps.push(snap);
  }

  const handleAdd = async () => {
    if (!selectedStep || !alias.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const result = await addCrossInput(datasetId, {
        source_step_id: selectedStep.step_id,
        alias: alias.trim(),
      });
      setInputs((prev) => [...prev, result]);
      setSelectedStep(null);
      setAlias("");
      window.dispatchEvent(
        new CustomEvent("datahub:toast", {
          detail: { message: `Cross input "${result.alias}" added`, type: "success" },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (input: CrossPipelineInputOut) => {
    setRemovingId(input.id);
    try {
      await removeCrossInput(datasetId, input.id);
      setInputs((prev) => prev.filter((i) => i.id !== input.id));
    } catch {
      // ignore
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 780,
          maxWidth: "92vw",
          maxHeight: "84vh",
          background: "var(--bg1)",
          border: "1px solid var(--bd2)",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 48,
            borderBottom: "1px solid var(--bd)",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--tx0)", flex: 1 }}>
            ⊕ Cross-pipeline inputs
          </span>
          <span style={{ fontSize: 11, color: "var(--tx2)", flex: 1 }}>
            for <em>{datasetName}</em>
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--tx2)",
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Left pane — step picker */}
          <div
            style={{
              width: 380,
              borderRight: "1px solid var(--bd)",
              overflowY: "auto",
              padding: "10px 0",
              flexShrink: 0,
            }}
          >
            {loading ? (
              <div style={{ padding: 16, fontSize: 12, color: "var(--tx2)" }}>Loading…</div>
            ) : byDataset.size === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: "var(--tx2)" }}>
                No step snapshots found. Run at least one pipeline step on another dataset first.
              </div>
            ) : (
              Array.from(byDataset.entries()).map(([dsId, { name, steps }]) => (
                <div key={dsId}>
                  <div
                    style={{
                      padding: "4px 14px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--tx2)",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      background: "var(--bg0)",
                      borderBottom: "1px solid var(--bd)",
                    }}
                  >
                    {name}
                  </div>
                  {steps.map((step) => {
                    const isSelected = selectedStep?.step_id === step.step_id;
                    const alreadyLinked = inputs.some((i) => i.source_step_id === step.step_id);
                    return (
                      <div
                        key={step.step_id}
                        onClick={() => !alreadyLinked && setSelectedStep(isSelected ? null : step)}
                        style={{
                          padding: "7px 14px",
                          cursor: alreadyLinked ? "default" : "pointer",
                          background: isSelected
                            ? "rgba(91,106,240,0.10)"
                            : "transparent",
                          borderBottom: "1px solid var(--bd)",
                          borderLeft: isSelected
                            ? "3px solid var(--ac)"
                            : "3px solid transparent",
                          opacity: alreadyLinked ? 0.45 : 1,
                          transition: "background 0.12s",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            justifyContent: "space-between",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: "var(--tx0)",
                            }}
                          >
                            Step {step.step_number} — {step.operation.replace(/_/g, " ")}
                          </span>
                          {alreadyLinked && (
                            <span
                              style={{
                                fontSize: 9,
                                color: "var(--gr)",
                                fontWeight: 600,
                                letterSpacing: "0.05em",
                              }}
                            >
                              LINKED
                            </span>
                          )}
                        </div>
                        {step.description && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--tx2)",
                              marginTop: 2,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {step.description}
                          </div>
                        )}
                        {step.row_count_after != null && (
                          <div
                            style={{ fontSize: 10, color: "var(--tx2)", marginTop: 1 }}
                          >
                            {step.row_count_after.toLocaleString()} rows
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Right pane — selected step + alias + current inputs */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 0,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            {/* Add section */}
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--bd)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--tx2)",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Add input
              </div>
              {!selectedStep ? (
                <div style={{ fontSize: 12, color: "var(--tx2)", fontStyle: "italic" }}>
                  Select a step on the left to add it as an input.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--tx0)",
                      marginBottom: 10,
                      padding: "8px 10px",
                      background: "var(--bg3)",
                      borderRadius: 6,
                      border: "1px solid var(--bd2)",
                    }}
                  >
                    <strong>{selectedStep.dataset_name}</strong>
                    {" "}· step {selectedStep.step_number} · {selectedStep.operation.replace(/_/g, " ")}
                    {selectedStep.row_count_after != null && (
                      <span style={{ color: "var(--tx2)", fontSize: 11, marginLeft: 6 }}>
                        ({selectedStep.row_count_after.toLocaleString()} rows)
                      </span>
                    )}
                  </div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "var(--tx2)",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    Table alias (use this name in SQL / AI chat)
                  </label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      ref={aliasRef}
                      value={alias}
                      onChange={(e) => setAlias(e.target.value.replace(/[^a-z0-9_]/gi, "_"))}
                      placeholder="e.g. sales_step3"
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        fontSize: 12,
                        background: "var(--bg3)",
                        border: "1px solid var(--bd2)",
                        borderRadius: 6,
                        color: "var(--tx0)",
                        outline: "none",
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
                    />
                    <button
                      onClick={() => void handleAdd()}
                      disabled={adding || !alias.trim()}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        background: "var(--ac)",
                        border: "none",
                        borderRadius: 6,
                        color: "#fff",
                        cursor: adding || !alias.trim() ? "not-allowed" : "pointer",
                        opacity: adding || !alias.trim() ? 0.6 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {adding ? "Adding…" : "Add →"}
                    </button>
                  </div>
                  {error && (
                    <div style={{ fontSize: 11, color: "var(--rd)", marginTop: 6 }}>
                      {error}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Current inputs list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
              <div
                style={{
                  padding: "0 16px 8px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--tx2)",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                }}
              >
                Linked inputs ({inputs.length})
              </div>
              {inputs.length === 0 ? (
                <div
                  style={{ padding: "4px 16px", fontSize: 12, color: "var(--tx2)", fontStyle: "italic" }}
                >
                  No cross-pipeline inputs yet.
                </div>
              ) : (
                inputs.map((input) => (
                  <div
                    key={input.id}
                    style={{
                      padding: "8px 16px",
                      borderBottom: "1px solid var(--bd)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--ac)",
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        {input.alias}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 2 }}>
                        {input.source_dataset_name ?? input.source_dataset_id}
                        {input.step_number != null && ` · step ${input.step_number}`}
                        {input.step_description && ` — ${input.step_description}`}
                      </div>
                    </div>
                    <button
                      onClick={() => void handleRemove(input)}
                      disabled={removingId === input.id}
                      title="Remove this cross-pipeline input"
                      style={{
                        background: "none",
                        border: "1px solid var(--rd, #f87171)",
                        borderRadius: 4,
                        color: "var(--rd, #f87171)",
                        fontSize: 11,
                        padding: "3px 8px",
                        cursor: removingId === input.id ? "not-allowed" : "pointer",
                        opacity: removingId === input.id ? 0.5 : 1,
                        flexShrink: 0,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Hint */}
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid var(--bd)",
                fontSize: 11,
                color: "var(--tx2)",
                background: "var(--bg0)",
                flexShrink: 0,
              }}
            >
              💡 After adding an input, say{" "}
              <em>"join with {inputs[0]?.alias ?? "alias"}"</em> in the AI chat — the
              table is already loaded as a DuckDB view.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
