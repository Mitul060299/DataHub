/**
 * AutoGoalPanel.tsx
 * Full Auto Mode panel — goal input, run feed, interrupt card, goal report.
 * Drop-in replacement for the Manual chat panel when mode === "auto".
 * Uses inline styles consistent with the app's CSS-variable dark theme.
 */
import { useEffect, useState } from "react";
import { useAutoRunSession } from "../hooks/useAutoRunSession";
import { exportDatasetCsv, fetchDatasetPipelineSteps } from "../api";
import { usePipelineContext, type PipelineStep } from "../contexts/PipelineContext";
import { AutoRunFeed } from "./AutoRunFeed";
import { AutoInterruptCard } from "./AutoInterruptCard";
import { AutoGoalReport } from "./AutoGoalReport";

interface Props {
  datasetId: string;
  projectId: string;
  sessionId?: string;
}

export function AutoGoalPanel({ datasetId, projectId, sessionId }: Props) {
  const { state, start, resume, cancel, approvePlan, reset } = useAutoRunSession();
  const { replaceSteps } = usePipelineContext();
  const [goal, setGoal] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // When the run completes, load the executed steps from the DB into
  // PipelineContext so the Pipeline panel reflects the auto run's output.
  useEffect(() => {
    if (state.status !== "complete" || !datasetId) return;
    fetchDatasetPipelineSteps(datasetId)
      .then((rawSteps) => {
        const mapped: PipelineStep[] = (rawSteps as Record<string, unknown>[]).map((s) => ({
          id: (s.id as string) || crypto.randomUUID(),
          stepNumber: (s.stepNumber as number) ?? 0,
          operation: (s.operation as string) ?? "transform",
          description: (s.description as string) ?? "",
          sql: (s.sql as string | undefined),
          affectedRows: (s.affectedRows as string | undefined),
          appliedAt: s.appliedAt ? new Date(s.appliedAt as string) : new Date(),
          output_table: (s.output_table as string | undefined),
          input_tables: (s.input_tables as string[] | undefined),
          row_count_before: (s.row_count_before as number | null | undefined) ?? null,
          row_count_after: (s.row_count_after as number | null | undefined) ?? null,
          execution_time_ms: (s.execution_time_ms as number | null | undefined) ?? null,
          snapshot_path: (s.snapshot_path as string | null | undefined) ?? null,
          status: (s.status as "completed" | "failed" | "pending" | undefined) ?? "completed",
        }));
        if (mapped.length > 0) replaceSteps(mapped);
      })
      .catch(() => { /* best-effort */ });
  }, [state.status, datasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await exportDatasetCsv(datasetId) as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dataset-${datasetId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore; user can retry
    } finally {
      setDownloading(false);
    }
  };

  const isIdle        = state.status === "idle";
  const isRunning     = state.status === "running";
  const isInterrupted = state.status === "interrupted";
  const isComplete    = state.status === "complete";
  const isError       = state.status === "error";
  const hasActivity   = isRunning || isInterrupted || isComplete || isError;

  const handleStart = () => {
    if (!goal.trim()) return;
    if (!datasetId || !datasetId.trim()) {
      // eslint-disable-next-line no-alert
      window.alert("Please select a dataset before starting Auto Mode.");
      return;
    }
    start({ datasetId, projectId, sessionId, goal: goal.trim(), dryRun });
  };

  const handleInterruptAnswer = (answer: string) => {
    if (!state.runId) return;
    resume(state.runId, answer);
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
    }}>

      {/* ── Goal input (idle state) ─────────────────────────────────────── */}
      {isIdle && (
        <div style={{ padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Description */}
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--tx1)", lineHeight: 1.55 }}>
            Describe your data goal or business rules. The agent will parse them into testable
            rules, build a pipeline plan, and execute it autonomously.
          </p>

          {/* Textarea */}
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleStart();
              }
            }}
            placeholder={
              "e.g. Remove duplicate orders by order_id (keep latest), " +
              "fill null customer_email with 'unknown@example.com', " +
              "standardise country codes to ISO alpha-2…"
            }
            rows={6}
            style={{
              resize: "none",
              border: "1px solid var(--bd2)",
              borderRadius: 10,
              background: "var(--bg3)",
              color: "var(--tx0)",
              fontSize: 12.5,
              lineHeight: 1.6,
              padding: "10px 12px",
              width: "100%",
              boxSizing: "border-box",
              outline: "none",
              fontFamily: "inherit",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--ac)"; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--bd2)"; }}
          />

          {/* Controls row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {/* Dry run toggle */}
            <label style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--tx2)",
              cursor: "pointer",
              userSelect: "none",
            }}>
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                style={{ accentColor: "var(--ac)", cursor: "pointer" }}
              />
              Dry run <span style={{ color: "var(--tx2)", fontSize: 10 }}>(sample 5 000 rows)</span>
            </label>

            {/* Run button */}
            <button
              onClick={handleStart}
              disabled={!goal.trim()}
              style={{
                background: goal.trim() ? "var(--ac)" : "var(--bg4)",
                color: goal.trim() ? "#fff" : "var(--tx2)",
                border: "none",
                borderRadius: 8,
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                cursor: goal.trim() ? "pointer" : "not-allowed",
                transition: "background 0.15s, color 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              ⚡ Run Auto Mode
            </button>
          </div>

          {/* Hint */}
          <p style={{ margin: 0, fontSize: 10.5, color: "var(--tx2)" }}>
            Tip: ⌘ + Enter to start
          </p>
        </div>
      )}

      {/* ── Active / complete / error ───────────────────────────────────── */}
      {hasActivity && (
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "12px 14px",
        }}>
          {/* Goal summary pill */}
          {state.goalSummary && (
            <div style={{
              fontSize: 11,
              color: "var(--tx1)",
              fontStyle: "italic",
              padding: "6px 10px",
              background: "var(--acl)",
              border: "1px solid var(--bd2)",
              borderRadius: 8,
              lineHeight: 1.4,
            }}>
              "{state.goalSummary}"
            </div>
          )}

          <AutoRunFeed
            status={state.status}
            planSteps={state.planSteps}
            planApproved={state.planApproved}
            driftAmber={state.driftAmber}
            driftRed={state.driftRed}
            events={state.events}
            onApprovePlan={approvePlan}
          />

          {isInterrupted && state.interruptQuestion && (
            <AutoInterruptCard
              question={state.interruptQuestion}
              onAnswer={handleInterruptAnswer}
            />
          )}

          {isComplete && state.goalReport && (
            <AutoGoalReport report={state.goalReport} />
          )}

          {isError && state.error && (
            <div style={{
              border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: 10,
              background: "rgba(239,68,68,0.08)",
              padding: "10px 12px",
              fontSize: 12,
              color: "#f87171",
              lineHeight: 1.5,
            }}>
              {state.error}
            </div>
          )}

          {/* Action row */}
          <div style={{ display: "flex", gap: 6, paddingTop: 2, flexWrap: "wrap" }}>
            {isRunning && (
              <button
                onClick={cancel}
                style={{
                  fontSize: 11,
                  padding: "4px 12px",
                  borderRadius: 7,
                  border: "1px solid var(--bd2)",
                  background: "transparent",
                  color: "var(--tx1)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
            {(isComplete || isError) && (
              <button
                onClick={reset}
                style={{
                  fontSize: 11,
                  padding: "4px 12px",
                  borderRadius: 7,
                  border: "1px solid var(--bd2)",
                  background: "transparent",
                  color: "var(--tx1)",
                  cursor: "pointer",
                }}
              >
                New Goal
              </button>
            )}
            {isComplete && (
              <button
                onClick={() => { void handleDownload(); }}
                disabled={downloading}
                style={{
                  fontSize: 11,
                  padding: "4px 12px",
                  borderRadius: 7,
                  border: "1px solid var(--bd2)",
                  background: "transparent",
                  color: downloading ? "var(--tx2)" : "var(--gr)",
                  cursor: downloading ? "not-allowed" : "pointer",
                }}
              >
                {downloading ? "Downloading…" : "↓ Download CSV"}
              </button>
            )}
          </div>

          {/* Pipeline panel hint — shown after completion */}
          {isComplete && state.planSteps.length > 0 && (
            <div style={{
              fontSize: 11,
              color: "var(--tx2)",
              padding: "6px 10px",
              borderRadius: 7,
              background: "var(--bg3)",
              border: "1px solid var(--bd)",
              lineHeight: 1.5,
            }}>
              Steps loaded into the <strong style={{ color: "var(--tx1)" }}>Pipeline</strong> panel — open it to rename, reorder, delete or re-run individual steps.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
