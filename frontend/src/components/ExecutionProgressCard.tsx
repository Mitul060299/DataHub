/**
 * ExecutionProgressCard.tsx
 *
 * A single, mutating card that replaces the flood of per-step chat bubbles.
 * One instance lives in the AIPanel messages list for the entire pipeline run.
 * Steps are updated in-place via setMessages — no new bubbles are spawned.
 */

export interface ExecStep {
  stepNumber: number;
  operation: string;
  totalSteps: number;
  status: "running" | "done" | "error";
  rowsBefore?: number | null;
  rowsAfter?: number | null;
  execMs?: number | null;
  errorMsg?: string | null;
}

interface Props {
  steps: ExecStep[];
  done?: boolean;
}

function opEmoji(op: string) {
  const k = op.toLowerCase();
  if (k.includes("filter")) return "⟁";
  if (k.includes("join") || k.includes("merge")) return "⋈";
  if (k.includes("sort")) return "⇅";
  if (k.includes("clean") || k.includes("dedupe")) return "✨";
  if (k.includes("group") || k.includes("summaris") || k.includes("summariz")) return "▤";
  if (k.includes("pivot")) return "⊞";
  if (k.includes("add_column") || k.includes("add column")) return "＋";
  if (k.includes("rename")) return "✎";
  return "◈";
}

export function ExecutionProgressCard({ steps, done = false }: Props) {
  if (!steps.length) return null;

  const totalSteps = steps[0]?.totalSteps ?? steps.length;
  const completedCount = steps.filter((s) => s.status === "done").length;
  const hasError = steps.some((s) => s.status === "error");
  const pct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const barColor = hasError
    ? "#f87171"
    : done
    ? "var(--gr)"
    : "#5B6AF0";

  return (
    <div style={{
      border: "1px solid var(--bd2)",
      borderLeft: `4px solid ${barColor}`,
      borderRadius: 10,
      background: "var(--bg2)",
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: "var(--tx0)" }}>
          {done
            ? hasError ? "⚠ Pipeline completed with errors" : "✓ Pipeline complete"
            : "⚡ Executing pipeline…"}
        </span>
        <span style={{ fontSize: 11, color: "var(--tx2)" }}>
          {completedCount}/{totalSteps}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 99, background: "var(--bg4, var(--bg3))", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          borderRadius: 99,
          background: barColor,
          width: `${pct}%`,
          transition: "width 0.3s ease",
        }} />
      </div>

      {/* Step list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {steps.map((step) => {
          const isDone = step.status === "done";
          const isErr = step.status === "error";
          const isRunning = step.status === "running";

          const rowDelta =
            step.rowsBefore != null && step.rowsAfter != null
              ? step.rowsAfter - step.rowsBefore
              : null;

          return (
            <div
              key={step.stepNumber}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 0",
                borderBottom: "1px solid var(--bd)",
                opacity: isRunning ? 1 : isDone || isErr ? 0.9 : 0.4,
                transition: "opacity 0.2s",
              }}
            >
              {/* Status icon */}
              <span style={{ fontSize: 11, width: 14, textAlign: "center", flexShrink: 0 }}>
                {isRunning ? "⟳" : isDone ? "✔" : isErr ? "✗" : "·"}
              </span>

              {/* Op icon + name */}
              <span style={{ fontSize: 11, flexShrink: 0 }}>{opEmoji(step.operation)}</span>
              <span style={{
                fontSize: 11,
                color: isErr ? "#f87171" : isDone ? "var(--tx)" : "var(--tx1)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {step.operation.replace(/_/g, " ")}
              </span>

              {/* Row counts */}
              {isDone && step.rowsBefore != null && step.rowsAfter != null ? (
                <span style={{ fontSize: 10, color: "var(--tx2)", flexShrink: 0 }}>
                  {step.rowsAfter.toLocaleString()} rows
                  {rowDelta !== null && rowDelta !== 0 ? (
                    <span style={{ color: rowDelta < 0 ? "#f87171" : "var(--gr)", marginLeft: 3 }}>
                      ({rowDelta >= 0 ? "+" : ""}{rowDelta.toLocaleString()})
                    </span>
                  ) : null}
                </span>
              ) : null}

              {/* Timing */}
              {isDone && step.execMs != null ? (
                <span style={{ fontSize: 10, color: "var(--tx2)", flexShrink: 0 }}>{step.execMs}ms</span>
              ) : null}

              {/* Error text */}
              {isErr && step.errorMsg ? (
                <span style={{ fontSize: 10, color: "#f87171", flexShrink: 0, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {step.errorMsg}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
