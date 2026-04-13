import { useState } from "react";

interface PlanStep {
  step_number: number;
  operation: string;
  description: string;
  sql?: string;
  estimated_rows: string;
  reversible: boolean;
  depends_on?: number[];
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
  const borderColor = approved ? "var(--gr)" : rejected ? "var(--rd)" : "var(--yl)";
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [modifying, setModifying] = useState(false);
  const [modifyText, setModifyText] = useState("");

  function copySQL(stepNumber: number, sql: string) {
    navigator.clipboard.writeText(sql).then(() => {
      setCopiedStep(stepNumber);
      setTimeout(() => setCopiedStep(null), 1500);
    });
  }

  return (
    <div style={{ borderLeft: `4px solid ${borderColor}`, border: "1px solid var(--bd2)", borderRadius: "var(--r8)", padding: 10, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>📋 Review Plan</span>
        <span style={{ color: "var(--tx1)" }}>{steps.length} steps</span>
      </div>

      <div style={{ fontSize: 11, color: "var(--tx1)", marginBottom: 6, lineHeight: 1.4 }}>
        Nothing runs until you approve. Read each query, modify anything, or reject the whole plan.
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {steps.map((step) => (
          <div key={step.step_number} style={{ border: "1px solid var(--bd)", borderRadius: "var(--r8)", padding: 8 }}>
            <div style={{ fontWeight: 600 }}>{step.step_number}. {step.operation.replace(/_/g, " ")}</div>
            <div>{step.description}</div>
            <div style={{ color: "var(--tx1)", fontSize: 12 }}>~{step.estimated_rows}</div>
            {step.sql ? (
              <div style={{ marginTop: 6, background: "var(--bg1)", borderRadius: 6, padding: 6, overflowX: "auto", position: "relative" }}>
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
                <code style={{ paddingRight: 40, display: "block" }}>{step.sql}</code>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {pending ? (
        <div data-tour="approve-button" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
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
                placeholder='Describe your change e.g. "Change step 2 to group by industry" or "Add a step to remove nulls first"'
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
