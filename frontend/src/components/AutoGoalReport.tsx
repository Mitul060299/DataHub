/**
 * AutoGoalReport.tsx
 * Renders the final GoalReport summary card after an auto run completes.
 * Uses inline styles consistent with the app's CSS-variable dark theme.
 */
import type { GoalReport } from "../hooks/useAutoRunSession";

interface Props {
  report: GoalReport;
}

export function AutoGoalReport({ report }: Props) {
  const pct = report.total_rules > 0
    ? Math.round((report.rules_satisfied / report.total_rules) * 100)
    : 0;

  const barColor =
    pct === 100 ? "var(--gr)" :
    pct >= 80   ? "#eab308"   :
    "#f87171";

  const textColor =
    pct === 100 ? "var(--gr)" :
    pct >= 80   ? "#eab308"   :
    "#f87171";

  return (
    <div style={{
      border: "1px solid var(--bd2)",
      borderRadius: 12,
      background: "var(--bg2)",
      padding: "14px 14px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--tx0)" }}>Goal Report</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: textColor }}>{pct}%</span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 6,
        borderRadius: 99,
        background: "var(--bg4)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          borderRadius: 99,
          background: barColor,
          width: `${pct}%`,
          transition: "width 0.6s ease",
        }} />
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {[
          { label: "Satisfied", value: report.rules_satisfied, bg: "rgba(16,185,129,0.1)",  color: "var(--gr)" },
          { label: "Failed",    value: report.rules_failed,    bg: "rgba(239,68,68,0.1)",   color: "#f87171" },
          { label: "Skipped",   value: report.rules_skipped,   bg: "var(--bg3)",             color: "var(--tx1)" },
        ].map(({ label, value, bg, color }) => (
          <div key={label} style={{
            borderRadius: 8,
            background: bg,
            padding: "8px 6px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 10, color: "var(--tx2)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Duration */}
      <div style={{ fontSize: 10.5, color: "var(--tx2)", textAlign: "right" }}>
        Completed in {report.duration_seconds.toFixed(1)}s
      </div>
    </div>
  );
}
