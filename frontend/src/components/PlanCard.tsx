import { useState } from "react";

interface PlanStep {
  step_number: number;
  operation: string;
  description: string;
  sql?: string;
  estimated_rows: string;
  reversible: boolean;
  depends_on?: number[];
  phase?: string;
}

interface PlanCardProps {
  steps: PlanStep[];
  pending: boolean;
  approved?: boolean;
  rejected?: boolean;
  sending?: boolean;
  onApprove: () => void;
  onReject: () => void;
  onModify: (instruction: string) => void;
}

const OP_ICONS: Record<string, string> = {
  filter: "⟁",
  join: "⋈",
  merge: "⋈",
  sort: "⇅",
  clean: "✨",
  dedupe: "✨",
  group: "▤",
  summarise: "▤",
  summarize: "▤",
  pivot: "⊞",
  add_column: "＋",
  rename: "✎",
  export: "↗",
  output: "↗",
};

function opIcon(op: string) {
  const k = op.toLowerCase();
  for (const [key, icon] of Object.entries(OP_ICONS)) {
    if (k.includes(key)) return icon;
  }
  return "◈";
}

export default function PlanCard({
  steps,
  pending,
  approved,
  rejected,
  sending,
  onApprove,
  onReject,
  onModify,
}: PlanCardProps) {
  if (!steps || !steps.length) return null;
  const borderColor = approved ? "var(--gr)" : rejected ? "var(--rd)" : "var(--yl)";
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [modifying, setModifying] = useState(false);
  const [modifyText, setModifyText] = useState("");

  function copySQL(stepNumber: number, sql: string) {
    navigator.clipboard.writeText(sql).then(() => {
      setCopiedStep(stepNumber);
      setTimeout(() => setCopiedStep(null), 1500);
    });
  }

  function toggleStep(n: number) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  }

  // Group steps by phase if any have a phase field
  const hasPhases = steps.some((s) => s.phase);
  const phases: string[] = [];
  if (hasPhases) {
    for (const s of steps) {
      if (s.phase && !phases.includes(s.phase)) phases.push(s.phase);
    }
  }

  return (
    <div style={{ borderLeft: `4px solid ${borderColor}`, border: "1px solid var(--bd2)", borderRadius: "var(--r8)", padding: 10, marginTop: 8, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>📋 Review Plan</span>
        <span style={{ color: "var(--tx1)", fontSize: 11 }}>{steps.length} steps — click to expand</span>
      </div>

      <div style={{ fontSize: 11, color: "var(--tx1)", marginBottom: 8, lineHeight: 1.4 }}>
        Nothing runs until you approve. Click any step to see its SQL.
      </div>

      {/* Scrollable step list — max 480px keeps buttons always visible */}
      <div style={{ maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {steps.map((step, idx) => {
          const isExpanded = expandedSteps.has(step.step_number);
          const prevPhase = idx > 0 ? steps[idx - 1].phase : undefined;
          const showPhaseHeader = hasPhases && step.phase && step.phase !== prevPhase;
          return (
            <div key={step.step_number}>
              {showPhaseHeader ? (
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx2)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "6px 0 2px", paddingLeft: 2 }}>
                  — {step.phase?.replace(/_/g, " ")} —
                </div>
              ) : null}
              {/* Collapsed row */}
              <div
                onClick={() => toggleStep(step.step_number)}
                style={{
                  border: "1px solid var(--bd)",
                  borderRadius: 6,
                  padding: "6px 8px",
                  cursor: "pointer",
                  userSelect: "none",
                  background: isExpanded ? "var(--bg2)" : "var(--bg1)",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, width: 18, textAlign: "center", flexShrink: 0 }}>{opIcon(step.operation)}</span>
                  <span style={{ fontSize: 11, color: "var(--tx2)", flexShrink: 0, minWidth: 20 }}>{step.step_number}.</span>
                  <span style={{ fontSize: 12, color: "var(--tx)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isExpanded ? "normal" : "nowrap" }}>
                    {step.description || step.operation.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--tx2)", flexShrink: 0 }}>~{step.estimated_rows}</span>
                  <span style={{ fontSize: 11, color: "var(--tx2)", flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>

                {isExpanded && step.sql ? (
                  <div
                    style={{ marginTop: 8, background: "var(--bg0, var(--bg1))", borderRadius: 6, padding: "6px 8px", overflowX: "auto", position: "relative" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => copySQL(step.step_number, step.sql!)}
                      title="Copy SQL"
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        background: "var(--bg2)",
                        border: "1px solid var(--bd)",
                        borderRadius: 4,
                        padding: "2px 6px",
                        fontSize: 11,
                        cursor: "pointer",
                        color: copiedStep === step.step_number ? "var(--gr)" : "var(--tx1)",
                      }}
                    >
                      {copiedStep === step.step_number ? "✓" : "Copy"}
                    </button>
                    <code style={{ paddingRight: 44, display: "block", fontSize: 11, lineHeight: 1.5 }}>{step.sql}</code>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons — always pinned at bottom */}
      {pending ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--bd)", paddingTop: 8 }}>
          {!modifying ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" onClick={onApprove} disabled={sending} style={{ flex: 1, background: "#5B6AF0", color: "#eef2ff", borderColor: "#5B6AF0", ...(sending ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}>
                {sending ? "Running…" : "✓ Approve & Run"}
              </button>
              <button className="btn" onClick={() => setModifying(true)} disabled={sending} style={{ flex: 1 }}>
                ✎ Modify
              </button>
              <button className="btn" onClick={onReject} disabled={sending} style={{ flex: 1, color: "#ef4444", borderColor: "#ef4444" }}>
                ✕ Reject
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                autoFocus
                value={modifyText}
                onChange={(e) => setModifyText(e.target.value)}
                placeholder='e.g. "Change step 2 to group by industry" or "Add a step to remove nulls first"'
                rows={2}
                style={{ width: "100%", resize: "none", background: "var(--bg1)", border: "1px solid var(--bd2)", borderRadius: 6, color: "var(--tx)", padding: "6px 8px", fontSize: 12, boxSizing: "border-box" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (modifyText.trim()) { onModify(modifyText.trim()); setModifyText(""); setModifying(false); }
                  }
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn"
                  disabled={!modifyText.trim()}
                  onClick={() => { if (modifyText.trim()) { onModify(modifyText.trim()); setModifyText(""); setModifying(false); } }}
                  style={{ flex: 1, background: modifyText.trim() ? "#5B6AF0" : undefined, color: modifyText.trim() ? "#fff" : undefined }}
                >
                  Apply changes
                </button>
                <button className="btn" onClick={() => { setModifying(false); setModifyText(""); }} style={{ flex: 1 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {approved ? <div style={{ marginTop: 8, color: "var(--gr)" }}>✓ Approved — executing...</div> : null}
      {rejected ? <div style={{ marginTop: 8, color: "var(--rd)" }}>✕ Plan rejected</div> : null}
    </div>
  );
}
