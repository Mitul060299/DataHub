/**
 * AutoGoalPanel.tsx
 * Full Auto Mode panel — goal input, run feed, interrupt card, goal report.
 * Drop-in replacement for the Manual chat panel when mode === "auto".
 * Uses inline styles consistent with the app's CSS-variable dark theme.
 */
import { useState } from "react";
import { useAutoRunSession } from "../hooks/useAutoRunSession";
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
  const [goal, setGoal] = useState("");
  const [dryRun, setDryRun] = useState(false);

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
          <div style={{ display: "flex", gap: 6, paddingTop: 2 }}>
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
          </div>
        </div>
      )}
    </div>
  );
}
