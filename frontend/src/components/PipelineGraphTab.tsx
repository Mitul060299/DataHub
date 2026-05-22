import { useState, useCallback, useEffect, type CSSProperties } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "reactflow";
import { ReactFlowProvider, useReactFlow } from "@reactflow/core";
import "reactflow/dist/style.css";
import { usePipelineContext, type PipelineStep } from "../contexts/PipelineContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import {
  IconBarChart,
  IconCode,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconEdit,
  IconFilter,
  IconGitBranch,
  IconGrid,
  IconMerge,
  IconPlay,
  IconPlus,
  IconSortAsc,
  IconSparkles,
  IconX,
} from "./Icons";

// ─── Operation icon helper ─────────────────────────────────────────────────────
function getOperationIcon(op: string, size = 13) {
  const n = op.toLowerCase();
  if (n.includes("filter")) return <IconFilter size={size} />;
  if (n.includes("join") || n.includes("merge")) return <IconMerge size={size} />;
  if (n.includes("sort")) return <IconSortAsc size={size} />;
  if (n.includes("clean") || n.includes("dedupe")) return <IconSparkles size={size} />;
  if (n.includes("summarise") || n.includes("group")) return <IconBarChart size={size} />;
  if (n.includes("pivot")) return <IconGrid size={size} />;
  if (n.includes("add_column") || n.includes("add column")) return <IconPlus size={size} />;
  return <IconCode size={size} />;
}

function statusBorderColor(status?: string): string {
  if (status === "failed") return "var(--rd)";
  if (status === "pending") return "var(--bd3)";
  return "var(--gr)";
}

// ─── Source Node ───────────────────────────────────────────────────────────────
type SourceNodeData = { name: string; rows: number };

function SourceNode({ data }: NodeProps<SourceNodeData>) {
  return (
    <div
      style={{
        width: 220,
        padding: "10px 14px",
        borderRadius: 10,
        border: "2px dashed var(--gr)",
        background: "rgba(52,211,153,0.06)",
        boxSizing: "border-box",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "var(--gr)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Source
      </div>
      <div
        className="mono"
        style={{ fontSize: 13, fontWeight: 600, color: "var(--tx0)", wordBreak: "break-all" }}
      >
        {data.name}
      </div>
      <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 4 }}>
        {data.rows.toLocaleString()} rows
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "var(--gr)", border: "2px solid var(--gr)" }}
      />
    </div>
  );
}

// ─── Operation Node ────────────────────────────────────────────────────────────
type OperationNodeData = {
  step: PipelineStep;
  onClick: (step: PipelineStep) => void;
  onDelete: (step: PipelineStep) => void;
  onRunUpTo: (step: PipelineStep) => void;
  onFork: (step: PipelineStep) => void;
  onBranchTo: (step: PipelineStep) => void;
  onRename: (step: PipelineStep) => void;
  onUndoFrom: (step: PipelineStep) => void;
  onEditSql: (step: PipelineStep) => void;
};

// Inline icon-button style for the per-node action toolbar.
const nodeActionBtnStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 4,
  border: "1px solid var(--bd2)",
  background: "var(--bg2)",
  color: "var(--tx1)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  padding: 0,
  lineHeight: 1,
  fontSize: 11,
};

// One-time stylesheet injection so the .op-node-actions toolbar reveals on
// hovering its containing node wrapper (ReactFlow's `.react-flow__node`).
if (typeof document !== "undefined" && !document.getElementById("pipeline-graph-node-styles")) {
  const s = document.createElement("style");
  s.id = "pipeline-graph-node-styles";
  s.textContent = ".react-flow__node:hover .op-node-actions{opacity:1!important;}";
  document.head.appendChild(s);
}

function OperationNode({ data, selected }: NodeProps<OperationNodeData>) {
  const { step } = data;
  const color = statusBorderColor(step.status);
  const rowBefore = step.row_count_before ?? null;
  const rowAfter = step.row_count_after ?? step.outputDataset?.rowCount ?? null;
  const label = step.description || step.operation.replace(/_/g, " ");
  const elapsed =
    step.execution_time_ms != null
      ? step.execution_time_ms >= 1000
        ? `${(step.execution_time_ms / 1000).toFixed(1)}s`
        : `${step.execution_time_ms}ms`
      : null;

  return (
    <div
      onClick={() => data.onClick(step)}
      style={{
        width: 220,
        padding: "8px 12px",
        borderRadius: 8,
        border: `1px solid ${selected ? "var(--ac)" : "var(--bd2)"}`,
        borderLeft: `3px solid ${color}`,
        background: selected ? "var(--acl)" : "var(--bg2)",
        cursor: "pointer",
        boxSizing: "border-box",
        boxShadow: selected ? "0 0 0 2px var(--acg)" : "none",
        transition: "box-shadow 0.15s",
        position: "relative",
      }}
    >
      {/* Action toolbar — appears on hover, mirrors the per-step buttons that
          used to live in the right-side APPLIED STEPS list. Stops propagation
          so clicking a button never triggers the node-click handler. */}
      <div
        className="op-node-actions"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          display: "inline-flex",
          gap: 2,
          opacity: 0,
          transition: "opacity 120ms ease",
          zIndex: 5,
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); data.onRunUpTo(step); }}
          title="Run pipeline up to this step"
          style={nodeActionBtnStyle}
        >
          <IconPlay size={10} />
        </button>
        {step.sql ? (
          <button
            onClick={(e) => { e.stopPropagation(); data.onEditSql(step); }}
            title="Edit step SQL"
            style={nodeActionBtnStyle}
          >
            <IconEdit size={10} />
          </button>
        ) : null}
        <button
          onClick={(e) => { e.stopPropagation(); data.onFork(step); }}
          title="Fork from this step — next action starts a new branch"
          style={nodeActionBtnStyle}
        >
          ⑂
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); data.onBranchTo(step); }}
          title="Create a new branch dataset from this step"
          style={{ ...nodeActionBtnStyle, color: "var(--or, #fb923c)" }}
        >
          ↗
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); data.onRename(step); }}
          title="Rename step"
          style={nodeActionBtnStyle}
        >
          ✏
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); data.onUndoFrom(step); }}
          title="Undo from this step (removes this and all later steps)"
          style={nodeActionBtnStyle}
        >
          ↺
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); data.onDelete(step); }}
          title="Remove this step (re-runs downstream steps)"
          style={{ ...nodeActionBtnStyle, color: "var(--rd, #f87171)" }}
        >
          <IconX size={10} />
        </button>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: color, border: `2px solid ${color}` }}
      />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: "var(--bg3)",
            display: "grid",
            placeItems: "center",
            color,
            flexShrink: 0,
          }}
        >
          {getOperationIcon(step.operation, 13)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--tx0)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              paddingRight: 16,
            }}
            title={label}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--tx2)",
              marginTop: 1,
              textTransform: "capitalize",
            }}
          >
            {step.operation.replace(/_/g, " ")}
          </div>
        </div>
      </div>
      {(rowAfter != null || elapsed != null) && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 6,
            fontSize: 10,
            color: "var(--tx2)",
            alignItems: "center",
          }}
        >
          {rowAfter != null && (
            <span style={{ background: "var(--bg3)", borderRadius: 4, padding: "1px 5px" }}>
              {rowBefore != null ? `${rowBefore.toLocaleString()} → ` : ""}
              {rowAfter.toLocaleString()} rows
            </span>
          )}
          {rowAfter != null && rowBefore != null && rowAfter !== rowBefore && (
            <span style={{ color: rowAfter < rowBefore ? "var(--rd, #f87171)" : "var(--gr, #34d399)", fontSize: 9 }}>
              {rowAfter < rowBefore ? "−" : "+"}{Math.abs(rowAfter - rowBefore).toLocaleString()}
            </span>
          )}
          {elapsed && <span>{elapsed}</span>}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: color, border: `2px solid ${color}` }}
      />
    </div>
  );
}

// ─── Node types (defined outside component to prevent re-renders) ──────────────
const nodeTypes = {
  sourceNode: SourceNode,
  operationNode: OperationNode,
};

// ─── Layout builder ────────────────────────────────────────────────────────────
// Left-to-right layout: depth increases X, siblings spread along Y.
// Wider screens (laptop/desktop) suit horizontal flow much better than vertical.
const H_GAP = 300; // horizontal distance between depths (X axis)
const V_GAP = 140; // vertical distance between sibling branches (Y axis)

type NodeCallbacks = {
  onNodeClick: (step: PipelineStep) => void;
  onNodeDelete: (step: PipelineStep) => void;
  onNodeRunUpTo: (step: PipelineStep) => void;
  onNodeFork: (step: PipelineStep) => void;
  onNodeBranchTo: (step: PipelineStep) => void;
  onNodeRename: (step: PipelineStep) => void;
  onNodeUndoFrom: (step: PipelineStep) => void;
  onNodeEditSql: (step: PipelineStep) => void;
};

function buildLayout(
  datasetName: string,
  rows: number,
  steps: PipelineStep[],
  cb: NodeCallbacks,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: "source",
      type: "sourceNode",
      position: { x: 0, y: 0 },
      data: { name: datasetName, rows } as SourceNodeData,
    },
  ];

  const edges: Edge[] = [];

  // Compute parent for each step.
  //
  // Background: write-op steps (clean / filter / transform / pivot / union /
  // reconcile) almost always have `input_tables = [<source_dataset_alias>]`
  // because the agent re-reads the dataset alias each command — they don't
  // explicitly reference the prior step's auto-generated `output_table`.
  // Chart steps (`create_chart`, `visualise`) likewise don't produce a new
  // table. So a literal `input_tables ⊇ output_table` match almost never
  // succeeds, and naive parenting puts every step under the source.
  //
  // Power Query semantics: each write-op mutates the *logical* dataset, so
  // any subsequent step (chart or write-op) implicitly builds on the
  // freshest write-op output. Charts are leaves — they read the current
  // state but don't change it, so they should NOT anchor downstream steps.
  //
  // Algorithm (priority order):
  //   1. If any earlier step's `output_table` appears in this step's
  //      `input_tables`, that step is the parent (explicit dependency).
  //   2. Else, the parent is the most recent earlier *write-op* step
  //      (chain through the latest data state).
  //   3. Else, parent = "source".
  const WRITE_OPS = new Set([
    "clean",
    "filter",
    "transform",
    "pivot",
    "union",
    "reconcile",
  ]);
  const isWriteOp = (s: PipelineStep) =>
    WRITE_OPS.has(String(s.operation ?? ""));
  const stepNodeId = (s: PipelineStep) => `step-${s.id}`;
  const parentIds: string[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const cur = steps[i];
    const inputs = new Set((cur.input_tables ?? []).map((t) => String(t)));
    let parent: string | null = null;

    // 0. Explicit fork: parentStepId is set by the user via "Fork from here".
    //    Takes precedence over all heuristics so manual branches render correctly.
    if (cur.parentStepId) {
      const parentStep = steps.find((s) => s.id === cur.parentStepId);
      if (parentStep) {
        parent = stepNodeId(parentStep);
      }
    }

    // 1. Explicit table dependency.
    if (parent === null) {
    for (let j = i - 1; j >= 0; j -= 1) {
      const cand = steps[j];
      const out = cand.output_table ? String(cand.output_table) : "";
      if (out && inputs.has(out)) {
        parent = stepNodeId(cand);
        break;
      }
    }
    }

    // 2. Implicit: chain through the latest write-op.
    if (parent === null) {
      for (let j = i - 1; j >= 0; j -= 1) {
        if (isWriteOp(steps[j])) {
          parent = stepNodeId(steps[j]);
          break;
        }
      }
    }

    // 3. Fall back to source.
    parentIds.push(parent ?? "source");
  }

  // Compute depth (Y row) and sibling index (X column) per step so branches
  // don't overlap. Siblings sharing the same parent are spread horizontally.
  const depth: number[] = [];
  const childrenByParent = new Map<string, number[]>();
  for (let i = 0; i < steps.length; i += 1) {
    const parent = parentIds[i];
    const parentDepth = parent === "source" ? 0 : depth[steps.findIndex((s) => stepNodeId(s) === parent)];
    depth.push((parentDepth ?? 0) + 1);
    const list = childrenByParent.get(parent) ?? [];
    list.push(i);
    childrenByParent.set(parent, list);
  }

  // Assign Y position: centre each parent's children around y=0 of the parent.
  // For a single child, y stays at the parent's y. For multiple children,
  // spread them by V_GAP. Source is at y=0; child y is parent.y + offset.
  const yPos: number[] = new Array(steps.length).fill(0);
  childrenByParent.forEach((childIndices, parent) => {
    const parentY =
      parent === "source"
        ? 0
        : yPos[steps.findIndex((s) => stepNodeId(s) === parent)] ?? 0;
    const n = childIndices.length;
    childIndices.forEach((idx, k) => {
      const offset = (k - (n - 1) / 2) * V_GAP;
      yPos[idx] = parentY + offset;
    });
  });

  steps.forEach((step, i) => {
    const nodeId = stepNodeId(step);
    const prevId = parentIds[i];
    nodes.push({
      id: nodeId,
      type: "operationNode",
      position: { x: depth[i] * H_GAP, y: yPos[i] },
      data: {
        step,
        onClick: cb.onNodeClick,
        onDelete: cb.onNodeDelete,
        onRunUpTo: cb.onNodeRunUpTo,
        onFork: cb.onNodeFork,
        onBranchTo: cb.onNodeBranchTo,
        onRename: cb.onNodeRename,
        onUndoFrom: cb.onNodeUndoFrom,
        onEditSql: cb.onNodeEditSql,
      } as OperationNodeData,
    });
    edges.push({
      id: `e-${prevId}-${nodeId}`,
      source: prevId,
      target: nodeId,
      animated: step.status === "pending",
      style: {
        stroke: step.status === "failed" ? "var(--rd)" : "var(--bd3)",
        strokeWidth: 2,
      },
    });
  });

  return { nodes, edges };
}

// ─── Step detail panel ─────────────────────────────────────────────────────────
function StepDetailPanel({
  step,
  onClose,
  onRunToHere,
  onMoveUp,
  onMoveDown,
}: {
  step: PipelineStep | null;
  onClose: () => void;
  onRunToHere?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [materializing, setMaterializing] = useState(false);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewCols, setPreviewCols] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Fetch preview when step changes
  useEffect(() => {
    if (!step?.rawConfig) {
      setPreviewRows([]);
      setPreviewCols([]);
      setPreviewError(null);
      return;
    }
    const sessionId = String(step.rawConfig.session_id ?? step.rawConfig.run_id ?? "");
    const tableName = String(step.rawConfig.session_table_name ?? step.rawConfig.output_table ?? "");
    const datasetId = String(step.rawConfig.dataset_id ?? step.rawConfig.output_dataset_id ?? step.inputDataset?.id ?? "");
    if (!sessionId || !tableName || !datasetId) {
      setPreviewRows([]);
      setPreviewCols([]);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    import("../api").then(({ fetchStepPreview }) =>
      fetchStepPreview(datasetId, sessionId, tableName, 100)
    ).then((res) => {
      if (cancelled) return;
      setPreviewCols(res.columns);
      setPreviewRows(res.rows);
    }).catch((err) => {
      if (cancelled) return;
      setPreviewError(err instanceof Error ? err.message : "Preview unavailable");
      setPreviewRows([]);
      setPreviewCols([]);
    }).finally(() => {
      if (!cancelled) setPreviewLoading(false);
    });
    return () => { cancelled = true; };
  }, [step?.id, step?.rawConfig]);

  const handleCopy = async () => {
    if (!step?.sql) return;
    try {
      await navigator.clipboard.writeText(step.sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied — ignore
    }
  };

  const handleMaterialize = async () => {
    if (!step?.rawConfig) return;
    const sessionId = String(step.rawConfig.session_id ?? step.rawConfig.run_id ?? "");
    const tableName = String(step.rawConfig.session_table_name ?? step.rawConfig.output_table ?? "");
    const datasetId = String(step.rawConfig.dataset_id ?? step.rawConfig.output_dataset_id ?? step.inputDataset?.id ?? "");
    if (!sessionId || !tableName || !datasetId) return;
    setMaterializing(true);
    try {
      const { materializeStep } = await import("../api");
      await materializeStep(datasetId, sessionId, tableName, true);
    } catch {
      // best-effort
    } finally {
      setMaterializing(false);
    }
  };

  // Detect if this step is a lazy view (Power Query pattern)
  const isView = step?.rawConfig?.is_view === true;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 460,
        height: "100%",
        background: "var(--bg1)",
        borderLeft: "1px solid var(--bd)",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        transform: step ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
        boxShadow: step ? "-4px 0 24px rgba(0,0,0,0.18)" : "none",
      }}
    >
      {step && (
        <>
          {/* Panel header */}
          <div
            style={{
              height: 44,
              borderBottom: "1px solid var(--bd)",
              display: "flex",
              alignItems: "center",
              padding: "0 10px 0 14px",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--tx0)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {step.description || step.operation}
              </div>
              <div style={{ fontSize: 10, color: "var(--tx2)" }}>Step {step.stepNumber}</div>
            </div>
            {(onMoveUp || onMoveDown) && (
              <div style={{ display: "flex", gap: 2 }}>
                <button
                  onClick={onMoveUp}
                  disabled={!onMoveUp}
                  title="Move step up"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: onMoveUp ? "pointer" : "not-allowed",
                    color: onMoveUp ? "var(--tx1)" : "var(--bd2)",
                    display: "grid",
                    placeItems: "center",
                    padding: 3,
                    borderRadius: 4,
                    opacity: onMoveUp ? 1 : 0.4,
                  }}
                >
                  <IconChevronUp size={14} />
                </button>
                <button
                  onClick={onMoveDown}
                  disabled={!onMoveDown}
                  title="Move step down"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: onMoveDown ? "pointer" : "not-allowed",
                    color: onMoveDown ? "var(--tx1)" : "var(--bd2)",
                    display: "grid",
                    placeItems: "center",
                    padding: 3,
                    borderRadius: 4,
                    opacity: onMoveDown ? 1 : 0.4,
                  }}
                >
                  <IconChevronDown size={14} />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--tx2)",
                display: "grid",
                placeItems: "center",
                padding: 4,
                borderRadius: 4,
              }}
            >
              <IconX size={14} />
            </button>
          </div>

          {/* Panel body */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {/* Stats */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {isView && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#818cf8",
                    background: "rgba(129,140,248,0.08)",
                    border: "1px solid rgba(129,140,248,0.3)",
                    borderRadius: 6,
                    padding: "2px 8px",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Lazy View
                </span>
              )}
              {step.row_count_after != null && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--gr)",
                    background: "rgba(52,211,153,0.08)",
                    border: "1px solid rgba(52,211,153,0.3)",
                    borderRadius: 6,
                    padding: "2px 8px",
                  }}
                >
                  {step.row_count_after.toLocaleString()} rows
                </span>
              )}
              {step.execution_time_ms != null && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--tx1)",
                    background: "var(--bg3)",
                    border: "1px solid var(--bd2)",
                    borderRadius: 6,
                    padding: "2px 8px",
                  }}
                >
                  {step.execution_time_ms >= 1000
                    ? `${(step.execution_time_ms / 1000).toFixed(2)}s`
                    : `${step.execution_time_ms}ms`}
                </span>
              )}
              {step.affectedRows && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--tx1)",
                    background: "var(--bg3)",
                    border: "1px solid var(--bd2)",
                    borderRadius: 6,
                    padding: "2px 8px",
                  }}
                >
                  {step.affectedRows}
                </span>
              )}
            </div>

            {/* SQL block */}
            {step.sql ? (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--tx2)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    SQL
                  </span>
                  <button
                    onClick={() => void handleCopy()}
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      background: "var(--bg3)",
                      border: "1px solid var(--bd2)",
                      borderRadius: 4,
                      color: copied ? "var(--gr)" : "var(--tx1)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <IconCopy size={10} />
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <pre
                  style={{
                    fontSize: 11,
                    lineHeight: 1.6,
                    color: "var(--tx0)",
                    background: "var(--bg3)",
                    border: "1px solid var(--bd)",
                    borderRadius: 6,
                    padding: "10px 12px",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    margin: 0,
                    fontFamily: "var(--font-mono, 'Fira Code', monospace)",
                  }}
                >
                  {step.sql}
                </pre>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--tx2)", fontStyle: "italic" }}>
                No SQL recorded for this step.
              </div>
            )}

            {/* Data Preview */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--tx2)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Preview
                </span>
                {previewRows.length > 0 && (
                  <span style={{ fontSize: 10, color: "var(--tx2)" }}>
                    {previewRows.length} rows
                  </span>
                )}
              </div>
              {previewLoading ? (
                <div style={{ fontSize: 11, color: "var(--tx2)", padding: "8px 0" }}>
                  Loading preview…
                </div>
              ) : previewError ? (
                <div style={{ fontSize: 11, color: "var(--tx2)", fontStyle: "italic", padding: "8px 0" }}>
                  {previewError}
                </div>
              ) : previewCols.length > 0 ? (
                <div
                  style={{
                    maxHeight: 220,
                    overflow: "auto",
                    border: "1px solid var(--bd)",
                    borderRadius: 6,
                    background: "var(--bg0)",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 10,
                      fontFamily: "var(--font-mono, 'Fira Code', monospace)",
                    }}
                  >
                    <thead>
                      <tr>
                        {previewCols.map((col) => (
                          <th
                            key={col}
                            style={{
                              position: "sticky",
                              top: 0,
                              background: "var(--bg2)",
                              padding: "4px 6px",
                              borderBottom: "1px solid var(--bd)",
                              textAlign: "left",
                              fontWeight: 600,
                              color: "var(--tx1)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--bd)" }}>
                          {previewCols.map((col) => (
                            <td
                              key={col}
                              style={{
                                padding: "3px 6px",
                                whiteSpace: "nowrap",
                                maxWidth: 120,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                color: "var(--tx0)",
                              }}
                            >
                              {row[col] == null ? "" : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--tx2)", fontStyle: "italic", padding: "8px 0" }}>
                  No preview available — session may have expired.
                </div>
              )}
            </div>

            <button
              onClick={onRunToHere}
              disabled={!onRunToHere}
              title={onRunToHere ? "Remove all subsequent steps and switch to this output" : "No steps after this one"}
              style={{
                marginTop: "auto",
                padding: "7px 12px",
                fontSize: 12,
                background: onRunToHere ? "rgba(91,106,240,0.08)" : "var(--bg3)",
                border: `1px solid ${onRunToHere ? "rgba(91,106,240,0.35)" : "var(--bd2)"}`,
                borderRadius: "var(--r6)",
                color: onRunToHere ? "var(--ac, #818cf8)" : "var(--tx2)",
                cursor: onRunToHere ? "pointer" : "not-allowed",
                opacity: onRunToHere ? 1 : 0.45,
              }}
            >
              Trim pipeline to here
            </button>
            {isView && (
              <button
                onClick={() => void handleMaterialize()}
                disabled={materializing}
                title="Materialize this step's view into a concrete table (equivalent to Power Query's Full Refresh)"
                style={{
                  marginTop: 6,
                  padding: "7px 12px",
                  fontSize: 12,
                  background: materializing ? "var(--bg3)" : "rgba(52,211,153,0.08)",
                  border: `1px solid ${materializing ? "var(--bd2)" : "rgba(52,211,153,0.35)"}`,
                  borderRadius: "var(--r6)",
                  color: materializing ? "var(--tx2)" : "var(--gr)",
                  cursor: materializing ? "not-allowed" : "pointer",
                  opacity: materializing ? 0.6 : 1,
                }}
              >
                {materializing ? "Materializing…" : "Full Refresh"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Inner graph (must live inside ReactFlowProvider) ──────────────────────────
function PipelineGraphTabInner() {
  const { steps, removeStep, keepStepsThrough, moveStep, renameStep, forkAtStep } = usePipelineContext();
  const { activeDataset, setActiveDataset, addLane } = useWorkspaceContext();
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedStep, setSelectedStep] = useState<PipelineStep | null>(null);
  const [branchingStep, setBranchingStep] = useState<PipelineStep | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchBusy, setBranchBusy] = useState(false);

  const handleNodeClick = useCallback((step: PipelineStep) => {
    setSelectedStep((prev) => (prev?.id === step.id ? null : step));
  }, []);

  const handleNodeDelete = useCallback((step: PipelineStep) => {
    removeStep(step.id);
    setSelectedStep((prev) => (prev?.id === step.id ? null : prev));
  }, [removeStep]);

  const handleNodeRunUpTo = useCallback((step: PipelineStep) => {
    keepStepsThrough(step.id);
    if (step.outputDataset) {
      setActiveDataset({
        id: step.outputDataset.id,
        name: step.outputDataset.name,
        rows: step.outputDataset.rowCount ?? 0,
      });
    }
  }, [keepStepsThrough, setActiveDataset]);

  const handleNodeFork = useCallback((step: PipelineStep) => {
    forkAtStep(step.id);
  }, [forkAtStep]);

  const handleNodeBranchTo = useCallback((step: PipelineStep) => {
    setBranchingStep(step);
    setBranchName(`${activeDataset?.name ?? "Dataset"} → step ${step.stepNumber}`);
    window.dispatchEvent(new Event("datahub:quickstart-step5-done"));
  }, [activeDataset?.name]);

  const handleBranchConfirm = useCallback(async () => {
    if (!branchingStep) return;
    setBranchBusy(true);
    try {
      const { forkFromStep } = await import("../api");
      const result = await forkFromStep(branchingStep.id, {
        name: branchName.trim() || undefined,
      });
      addLane({
        id: result.dataset_id,
        name: result.dataset_name,
        rows: 0,
      });
      window.dispatchEvent(
        new CustomEvent("datahub:toast", {
          detail: { message: `Branch created: ${result.dataset_name}`, type: "success" },
        }),
      );
      setBranchingStep(null);
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent("datahub:toast", {
          detail: { message: `Branch failed: ${err instanceof Error ? err.message : "unknown error"}`, type: "error" },
        }),
      );
    } finally {
      setBranchBusy(false);
    }
  }, [branchingStep, branchName, addLane]);

  const handleNodeRename = useCallback((step: PipelineStep) => {
    const current = step.description || step.operation.replace(/_/g, " ");
    // Native prompt keeps the change tiny and dependency-free; matches the
    // simple rename UX users had in the previous APPLIED STEPS list.
    const next = window.prompt("Rename step", current);
    if (next != null && next.trim() && next.trim() !== current) {
      renameStep(step.id, next.trim());
    }
  }, [renameStep]);

  // Undo-from and Edit-SQL stay in PipelineSection because they involve a
  // confirm prompt (undo) and an inline editor panel (edit SQL) that already
  // live there. We just dispatch events from the graph node so users can
  // trigger them in-place without losing that existing UX.
  const handleNodeUndoFrom = useCallback((step: PipelineStep) => {
    window.dispatchEvent(
      new CustomEvent("datahub:pipeline:undo-from", { detail: { stepId: step.id } }),
    );
  }, []);

  const handleNodeEditSql = useCallback((step: PipelineStep) => {
    window.dispatchEvent(
      new CustomEvent("datahub:pipeline:edit-sql", { detail: { stepId: step.id } }),
    );
  }, []);

  const handleFit = useCallback(() => {
    rf.fitView({ padding: 0.15, duration: 400 });
  }, [rf]);

  // Source name/rows come from what was recorded on the first step's inputDataset.
  // This is set once at execution time and never changes when the user clicks an
  // artifact or switches the active preview dataset elsewhere in the UI.
  const sourceName =
    steps[0]?.inputDataset?.name ??
    activeDataset?.name ??
    "Source";
  const sourceRows =
    steps[0]?.inputDataset?.rows ??
    activeDataset?.rows ??
    activeDataset?.row_count ??
    0;

  useEffect(() => {
    if (steps.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const { nodes: n, edges: e } = buildLayout(sourceName, sourceRows, steps, {
      onNodeClick: handleNodeClick,
      onNodeDelete: handleNodeDelete,
      onNodeRunUpTo: handleNodeRunUpTo,
      onNodeFork: handleNodeFork,
      onNodeBranchTo: handleNodeBranchTo,
      onNodeRename: handleNodeRename,
      onNodeUndoFrom: handleNodeUndoFrom,
      onNodeEditSql: handleNodeEditSql,
    });
    setNodes(n);
    setEdges(e);
    const t = setTimeout(() => {
      rf.fitView({ padding: 0.15, duration: 300 });
    }, 80);
    return () => clearTimeout(t);
  }, [steps, sourceName, sourceRows, handleNodeClick, handleNodeDelete, handleNodeRunUpTo, handleNodeFork, handleNodeBranchTo, handleNodeRename, handleNodeUndoFrom, handleNodeEditSql, setNodes, setEdges, rf]);

  if (steps.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          color: "var(--tx2)",
        }}
      >
        <IconGitBranch size={36} color="var(--bd3)" />
        <span style={{ fontSize: 14, fontWeight: 500 }}>No pipeline steps yet</span>
        <span style={{ fontSize: 12 }}>Ask the AI assistant to transform your data.</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, position: "relative", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.25}
        maxZoom={2}
        style={{ background: "var(--bg0)" }}
      >
        <Background color="var(--bd)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>

      {/* Fit-to-screen button overlay */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: selectedStep ? 470 : 10,
          zIndex: 10,
          transition: "right 0.22s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <button
          onClick={handleFit}
          style={{
            padding: "5px 11px",
            fontSize: 11,
            background: "var(--bg2)",
            border: "1px solid var(--bd2)",
            borderRadius: "var(--r6)",
            color: "var(--tx1)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          <IconGitBranch size={12} />
          Fit
        </button>
      </div>

      <StepDetailPanel
        step={selectedStep}
        onClose={() => setSelectedStep(null)}
        onRunToHere={
          selectedStep && steps.some((s) => s.stepNumber > selectedStep.stepNumber)
            ? () => {
                keepStepsThrough(selectedStep.id);
                if (selectedStep.outputDataset) {
                  setActiveDataset({
                    id: selectedStep.outputDataset.id,
                    name: selectedStep.outputDataset.name,
                    rows: selectedStep.outputDataset.rowCount ?? 0,
                  });
                }
                setSelectedStep(null);
              }
            : undefined
        }
        onMoveUp={
          selectedStep && steps.findIndex((s) => s.id === selectedStep.id) > 0
            ? () => moveStep(selectedStep.id, "up")
            : undefined
        }
        onMoveDown={
          selectedStep && steps.findIndex((s) => s.id === selectedStep.id) < steps.length - 1
            ? () => moveStep(selectedStep.id, "down")
            : undefined
        }
      />

      {/* Branch-name dialog */}
      {branchingStep && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => !branchBusy && setBranchingStep(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg1)",
              border: "1px solid var(--bd2)",
              borderRadius: 12,
              padding: "20px 22px",
              width: 360,
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tx0)", marginBottom: 4 }}>
              Create branch from step {branchingStep.stepNumber}
            </div>
            <div style={{ fontSize: 11, color: "var(--tx2)", marginBottom: 14 }}>
              A new dataset will be created with steps 1–{branchingStep.stepNumber} copied from this pipeline.
            </div>
            <input
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="Branch dataset name"
              autoFocus
              style={{
                width: "100%",
                padding: "7px 10px",
                fontSize: 13,
                background: "var(--bg3)",
                border: "1px solid var(--bd2)",
                borderRadius: 6,
                color: "var(--tx0)",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 14,
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleBranchConfirm();
                if (e.key === "Escape") setBranchingStep(null);
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setBranchingStep(null)}
                disabled={branchBusy}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "var(--bg3)",
                  border: "1px solid var(--bd2)",
                  borderRadius: "var(--r6)",
                  color: "var(--tx1)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleBranchConfirm()}
                disabled={branchBusy}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "var(--or, #fb923c)",
                  border: "none",
                  borderRadius: "var(--r6)",
                  color: "#fff",
                  cursor: branchBusy ? "not-allowed" : "pointer",
                  opacity: branchBusy ? 0.7 : 1,
                }}
              >
                {branchBusy ? "Branching…" : "Create branch ↗"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Public export ─────────────────────────────────────────────────────────────
export function PipelineGraphTab() {
  return (
    <ReactFlowProvider>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <PipelineGraphTabInner />
      </div>
    </ReactFlowProvider>
  );
}
