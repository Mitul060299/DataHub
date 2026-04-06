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
}

export default function PlanCard({
  steps,
  pending,
  approved,
  rejected,
  sending,
  onApprove,
  onReject,
}: PlanCardProps) {
  const borderColor = approved ? "var(--gr)" : rejected ? "var(--rd)" : "var(--yl)";
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  function copySQL(stepNumber: number, sql: string) {
    navigator.clipboard.writeText(sql).then(() => {
      setCopiedStep(stepNumber);
      setTimeout(() => setCopiedStep(null), 1500);
    });
  }

  return (
    <div style={{ borderLeft: `4px solid ${borderColor}`, border: "1px solid var(--bd2)", borderRadius: "var(--r8)", padding: 10, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>📋 Execution Plan</span>
        <span style={{ color: "var(--tx1)" }}>{steps.length} steps</span>
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
        <div data-tour="approve-button" style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn" onClick={onApprove} disabled={sending} style={sending ? { opacity: 0.6, cursor: "not-allowed" } : undefined}>
            {sending ? "Running…" : "✓ Approve & Run"}
          </button>
          <button className="btn" onClick={onReject} disabled={sending}>
            ✕ Reject
          </button>
        </div>
      ) : null}

      {approved ? <div style={{ marginTop: 8, color: "var(--gr)" }}>✓ Approved — executing...</div> : null}
      {rejected ? <div style={{ marginTop: 8, color: "var(--rd)" }}>✕ Plan rejected</div> : null}
    </div>
  );
}
