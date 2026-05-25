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

interface PlanDAGProps {
  steps: PlanStep[];
  pending: boolean;
  approved?: boolean;
  rejected?: boolean;
  sending?: boolean;
  onApprove: () => void;
  onReject: () => void;
  onModify: (instruction: string) => void;
}

// Layout constants
const NODE_W = 220;
const NODE_H = 100;
const GAP_X = 28;
const GAP_Y = 60;
const MARGIN = 20;

/** BFS depth for each step based on depends_on chains. */
function computeDepths(steps: PlanStep[]): Record<number, number> {
  const depthMap: Record<number, number> = {};
  const stepMap = new Map<number, PlanStep>(steps.map((s) => [s.step_number, s]));

  function getDepth(sn: number): number {
    if (depthMap[sn] !== undefined) return depthMap[sn];
    const step = stepMap.get(sn);
    if (!step || !step.depends_on?.length) {
      depthMap[sn] = 0;
      return 0;
    }
    // Set a sentinel before recursing so any cycle (e.g. step depends on itself)
    // short-circuits instead of causing infinite recursion.
    depthMap[sn] = 0;
    const parentDepths = step.depends_on.map(getDepth);
    depthMap[sn] = Math.max(...parentDepths) + 1;
    return depthMap[sn];
  }

  for (const step of steps) getDepth(step.step_number);
  return depthMap;
}

export default function PlanDAG({
  steps,
  pending,
  approved,
  rejected,
  sending,
  onApprove,
  onReject,
  onModify,
}: PlanDAGProps) {
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [modifying, setModifying] = useState(false);
  const [modifyText, setModifyText] = useState("");

  function copySQL(stepNumber: number, sql: string) {
    navigator.clipboard.writeText(sql).then(() => {
      setCopiedStep(stepNumber);
      setTimeout(() => setCopiedStep(null), 1500);
    });
  }

  // --- Layout computation ---
  if (!steps || !steps.length) return null;
  const depthMap = computeDepths(steps);
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);

  // Group steps by depth
  const byDepth: PlanStep[][] = [];
  for (const step of sorted) {
    const d = depthMap[step.step_number] ?? 0;
    if (!byDepth[d]) byDepth[d] = [];
    byDepth[d].push(step);
  }
  // Fill any holes in the sparse array (can happen when depends_on references
  // a step number that is not present in the plan — computeDepths still assigns
  // a non-zero depth, leaving lower indices unpopulated).
  for (let i = 0; i < byDepth.length; i++) {
    if (!byDepth[i]) byDepth[i] = [];
  }

  const numDepths = byDepth.length;
  const maxCols = Math.max(...byDepth.map((row) => row.length), 1);
  const canvasW = Math.max(
    MARGIN * 2 + maxCols * NODE_W + (maxCols - 1) * GAP_X,
    320
  );
  const canvasH = MARGIN * 2 + numDepths * NODE_H + Math.max(numDepths - 1, 0) * GAP_Y;

  // Absolute position (top-left) of each node
  const posMap: Record<number, { x: number; y: number }> = {};
  for (let d = 0; d < byDepth.length; d++) {
    const row = byDepth[d];
    const rowW = row.length * NODE_W + (row.length - 1) * GAP_X;
    const startX = (canvasW - rowW) / 2;
    for (let i = 0; i < row.length; i++) {
      posMap[row[i].step_number] = {
        x: startX + i * (NODE_W + GAP_X),
        y: MARGIN + d * (NODE_H + GAP_Y),
      };
    }
  }

  // SVG bezier edges: parent-bottom → child-top
  const edges: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
  for (const step of sorted) {
    if (!step.depends_on?.length) continue;
    for (const parentSN of step.depends_on) {
      const parent = posMap[parentSN];
      const child = posMap[step.step_number];
      if (!parent || !child) continue;
      edges.push({
        x1: parent.x + NODE_W / 2,
        y1: parent.y + NODE_H,
        x2: child.x + NODE_W / 2,
        y2: child.y,
        key: `${parentSN}-${step.step_number}`,
      });
    }
  }

  const borderColor = approved
    ? "var(--gr)"
    : rejected
      ? "var(--rd)"
      : "var(--yl)";

  return (
    <div
      style={{
        borderLeft: `4px solid ${borderColor}`,
        border: "1px solid var(--bd2)",
        borderRadius: "var(--r8)",
        padding: 10,
        marginTop: 8,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <span style={{ fontWeight: 600 }}>🌿 Branching Pipeline</span>
        <span style={{ color: "var(--tx1)" }}>{steps.length} steps</span>
      </div>

      {/* DAG canvas (scrollable horizontally if needed) */}
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            position: "relative",
            width: canvasW,
            height: canvasH,
            minHeight: canvasH,
          }}
        >
          {/* SVG connector lines */}
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: canvasW,
              height: canvasH,
              overflow: "visible",
              pointerEvents: "none",
            }}
          >
            <defs>
              <marker
                id="dag-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M 0 0 L 6 3 L 0 6 Z" fill="var(--bd2)" />
              </marker>
            </defs>
            {edges.map((e) => {
              const midY = (e.y1 + e.y2) / 2;
              return (
                <path
                  key={e.key}
                  d={`M ${e.x1} ${e.y1} C ${e.x1} ${midY}, ${e.x2} ${midY}, ${e.x2} ${e.y2}`}
                  stroke="var(--bd2)"
                  strokeWidth={2}
                  fill="none"
                  markerEnd="url(#dag-arrow)"
                />
              );
            })}
          </svg>

          {/* Step nodes */}
          {sorted.map((step) => {
            const pos = posMap[step.step_number];
            if (!pos) return null;
            const isExpanded = expandedStep === step.step_number;
            return (
              <div
                key={step.step_number}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: NODE_W,
                  background: "var(--bg1)",
                  border: "1px solid var(--bd)",
                  borderRadius: "var(--r8)",
                  padding: "8px 10px",
                  boxSizing: "border-box",
                  overflow: "hidden",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                  {step.step_number}. {step.operation.replace(/_/g, " ")}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--tx)",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                  title={step.description}
                >
                  {step.description}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--tx1)",
                    marginTop: 2,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>~{step.estimated_rows}</span>
                  {step.sql ? (
                    <button
                      onClick={() => setExpandedStep(isExpanded ? null : step.step_number)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--tx1)",
                        fontSize: 11,
                        padding: "0 2px",
                      }}
                    >
                      {isExpanded ? "▲ SQL" : "▼ SQL"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SQL popover for expanded node */}
      {expandedStep !== null && steps.find((s) => s.step_number === expandedStep)?.sql ? (
        <div
          style={{
            marginTop: 8,
            background: "var(--bg1)",
            borderRadius: 6,
            padding: 8,
            position: "relative",
            overflowX: "auto",
          }}
        >
          <button
            onClick={() => {
              const sql = steps.find((s) => s.step_number === expandedStep)?.sql ?? "";
              copySQL(expandedStep, sql);
            }}
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
              color:
                copiedStep === expandedStep ? "var(--gr)" : "var(--tx1)",
            }}
          >
            {copiedStep === expandedStep ? "✓" : "Copy"}
          </button>
          <code style={{ paddingRight: 40, display: "block", fontSize: 12 }}>
            {steps.find((s) => s.step_number === expandedStep)?.sql}
          </code>
        </div>
      ) : null}

      {/* Approve / Reject / Modify buttons */}
      {pending ? (
        <div
          style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}
        >
          {!modifying ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="btn"
                onClick={onApprove}
                disabled={sending}
                style={{ flex: 1, background: "#5B6AF0", color: "#eef2ff", borderColor: "#5B6AF0", ...(sending ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
              >
                {sending ? "Running…" : "✓ Approve"}
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
                placeholder='Describe your change e.g. "Change step 2 to group by industry" or "Add a remove-nulls step first"'
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

      {approved ? (
        <div style={{ marginTop: 8, color: "var(--gr)" }}>
          ✓ Approved — executing...
        </div>
      ) : null}
      {rejected ? (
        <div style={{ marginTop: 8, color: "var(--rd)" }}>
          ✕ Plan rejected
        </div>
      ) : null}
    </div>
  );
}
