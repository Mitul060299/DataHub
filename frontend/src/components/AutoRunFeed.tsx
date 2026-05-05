/**
 * AutoRunFeed.tsx
 * Live feed of auto run events + step list.
 * Uses inline styles consistent with the app's CSS-variable dark theme.
 */
import type { AutoRunEvent, AutoRunStep } from "../hooks/useAutoRunSession";

interface Props {
  status: string;
  planSteps: AutoRunStep[];
  planApproved: boolean;
  driftAmber: number;
  driftRed: number;
  events: AutoRunEvent[];
  onApprovePlan: () => void;
}

const STATUS_META: Record<string, { label: string; bg: string; color: string; dot?: string }> = {
  running:     { label: "Running",              bg: "rgba(99,102,241,0.12)",   color: "var(--ac)",  dot: "var(--ac)" },
  interrupted: { label: "Waiting for input",    bg: "rgba(234,179,8,0.12)",    color: "#eab308",    dot: "#eab308" },
  complete:    { label: "Complete",             bg: "rgba(16,185,129,0.12)",   color: "var(--gr)" },
  error:       { label: "Error",               bg: "rgba(239,68,68,0.12)",    color: "#f87171" },
  idle:        { label: "Ready",               bg: "var(--bg3)",              color: "var(--tx2)" },
};

const EVENT_ICON: Record<string, string> = {
  "auto.started":          "▶",
  "auto.rules_parsed":     "📋",
  "auto.plan_ready":       "🗺",
  "auto.plan_approved":    "✓",
  "auto.step_started":     "⟳",
  "auto.step_done":        "✓",
  "auto.rule_checked":     "☑",
  "auto.interrupt":        "⚠",
  "auto.drift_detected":   "⚡",
  "auto.complete":         "✅",
  "auto.error":            "✗",
};

export function AutoRunFeed({ status, planSteps, planApproved, driftAmber, driftRed, events, onApprovePlan }: Props) {
  const meta   = STATUS_META[status] ?? STATUS_META.idle;
  const lastEvents = events.slice(-12);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Status row ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          padding: "3px 10px",
          borderRadius: 99,
          background: meta.bg,
          color: meta.color,
        }}>
          {meta.dot && (
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: meta.dot,
              animation: status === "running" ? "dotBounce 1s infinite ease-in-out" : undefined,
            }} />
          )}
          {meta.label}
        </span>

        {(driftAmber > 0 || driftRed > 0) && (
          <span style={{ fontSize: 11, color: "var(--tx2)", display: "inline-flex", gap: 6 }}>
            {driftAmber > 0 && (
              <span style={{ color: "#eab308" }}>⚡ {driftAmber} amber</span>
            )}
            {driftRed > 0 && (
              <span style={{ color: "#f87171" }}>⚡ {driftRed} red</span>
            )}
          </span>
        )}
      </div>

      {/* ── Plan review ─────────────────────────────────────────────── */}
      {planSteps.length > 0 && !planApproved && (
        <div style={{
          border: "1px solid rgba(99,102,241,0.35)",
          borderRadius: 10,
          background: "rgba(99,102,241,0.07)",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "var(--ac)" }}>
            Review Plan — {planSteps.length} step{planSteps.length !== 1 ? "s" : ""}
          </p>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
            {planSteps.map((step) => (
              <li key={step.step_number} style={{ display: "flex", gap: 8, fontSize: 11.5 }}>
                <span style={{ color: "var(--tx2)", fontFamily: "monospace", minWidth: 16, paddingTop: 1 }}>
                  {step.step_number}.
                </span>
                <div>
                  <span style={{ fontWeight: 600, color: "var(--tx0)" }}>{step.operation}</span>
                  <span style={{ color: "var(--tx2)", marginLeft: 4 }}>— {step.description}</span>
                </div>
              </li>
            ))}
          </ol>
          <button
            onClick={onApprovePlan}
            style={{
              background: "var(--ac)",
              color: "#fff",
              border: "none",
              borderRadius: 7,
              padding: "6px 0",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              width: "100%",
              marginTop: 2,
            }}
          >
            Approve &amp; Execute
          </button>
        </div>
      )}

      {/* Plan approved badge */}
      {planSteps.length > 0 && planApproved && (
        <div style={{
          fontSize: 11,
          color: "var(--gr)",
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 8px",
          borderRadius: 7,
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.2)",
        }}>
          ✓ Plan approved — {planSteps.length} step{planSteps.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* ── Event log ───────────────────────────────────────────────── */}
      {lastEvents.length > 0 && (
        <div style={{
          border: "1px solid var(--bd)",
          borderRadius: 8,
          overflow: "hidden",
          fontSize: 11,
        }}>
          {lastEvents.map((ev, i) => {
            const icon = EVENT_ICON[ev.type] ?? "·";
            const label = ev.type.replace("auto.", "");
            const snippet =
              (ev.data.goal_summary as string | undefined) ||
              (ev.data.passed !== undefined
                ? `rule ${ev.data.rule_id as string} — ${ev.data.passed ? "✓ pass" : "✗ fail"}`
                : undefined);

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  padding: "5px 10px",
                  borderTop: i > 0 ? "1px solid var(--bd)" : undefined,
                  background: i === lastEvents.length - 1 && status === "running" ? "var(--acl)" : undefined,
                }}
              >
                <span style={{ color: "var(--tx2)", width: 14, flexShrink: 0, textAlign: "center" }}>{icon}</span>
                <span style={{ color: "var(--tx2)", fontFamily: "monospace", fontSize: 10.5, flexShrink: 0 }}>{label}</span>
                {snippet && (
                  <span style={{ color: "var(--tx1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {snippet}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
