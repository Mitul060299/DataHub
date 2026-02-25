import { IconCheck, IconX } from "./Icons";

export interface StepCardProps {
  operation: string;
  sql?: string;
  description: string;
  affectedRows?: string;
  status: "pending" | "applying" | "applied" | "discarded";
  onApply: () => void;
  onDiscard: () => void;
}

const statusBorder: Record<StepCardProps["status"], string> = {
  pending: "var(--yw)",
  applying: "var(--pu)",
  applied: "var(--gr)",
  discarded: "var(--rd)",
};

export function StepCard({ operation, sql, description, affectedRows, status, onApply, onDiscard }: StepCardProps) {
  return (
    <div
      style={{
        marginTop: 10,
        border: "1px solid var(--bd2)",
        borderLeft: `3px solid ${statusBorder[status]}`,
        borderRadius: "var(--r8)",
        background: "var(--bg2)",
        padding: 10,
      }}
    >
      <div className="flex" style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 11, color: "var(--tx1)" }}>{operation}</span>
        {affectedRows ? <span className="mono" style={{ fontSize: 11, color: "var(--tx1)" }}>{affectedRows} rows</span> : null}
      </div>
      <p style={{ color: "var(--tx0)", marginBottom: sql ? 8 : 0 }}>{description}</p>
      {sql ? (
        <pre
          className="mono"
          style={{
            whiteSpace: "pre-wrap",
            background: "var(--bg3)",
            border: "1px solid var(--bd)",
            borderRadius: "var(--r6)",
            padding: 8,
            color: "#d1d5db",
            marginBottom: 8,
          }}
        >
          {sql}
        </pre>
      ) : null}
      {status === "pending" ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" style={{ background: "#052e1d", borderColor: "#14532d" }} onClick={onApply}>
            Apply
          </button>
          <button className="btn" style={{ background: "#3f1d1d", borderColor: "#7f1d1d" }} onClick={onDiscard}>
            Discard
          </button>
        </div>
      ) : null}
      {status === "applying" ? <span style={{ color: "var(--tx1)" }}>Applying...</span> : null}
      {status === "applied" ? (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "var(--gr)" }}>
          <IconCheck size={14} /> ✓ Applied to dataset
        </span>
      ) : null}
      {status === "discarded" ? (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "var(--rd)" }}>
          <IconX size={14} /> Discarded
        </span>
      ) : null}
    </div>
  );
}
