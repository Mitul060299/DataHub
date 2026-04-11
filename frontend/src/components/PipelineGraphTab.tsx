import { useState, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { usePipelineContext, type PipelineStep } from "../contexts/PipelineContext";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";
import {
  IconBarChart,
  IconCode,
  IconCopy,
  IconFilter,
  IconGitBranch,
  IconGrid,
  IconMerge,
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
        position={Position.Bottom}
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
};

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
      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); data.onDelete(step); }}
        title="Remove this step from the graph"
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          width: 18,
          height: 18,
          borderRadius: 4,
          border: "none",
          background: "transparent",
          color: "var(--tx2)",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          padding: 0,
          lineHeight: 1,
          opacity: 0.4,
          zIndex: 5,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "1";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--rd, #f87171)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "0.4";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--tx2)";
        }}
      >
        <IconX size={10} />
      </button>
      <Handle
        type="target"
        position={Position.Top}
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
        position={Position.Bottom}
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
const Y_GAP = 170;

function buildLayout(
  datasetName: string,
  rows: number,
  steps: PipelineStep[],
  onNodeClick: (step: PipelineStep) => void,
  onNodeDelete: (step: PipelineStep) => void,
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

  steps.forEach((step, i) => {
    const nodeId = `step-${step.id}`;
    const prevId = i === 0 ? "source" : `step-${steps[i - 1].id}`;
    nodes.push({
      id: nodeId,
      type: "operationNode",
      position: { x: 0, y: (i + 1) * Y_GAP },
      data: { step, onClick: onNodeClick, onDelete: onNodeDelete } as OperationNodeData,
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
}: {
  step: PipelineStep | null;
  onClose: () => void;
  onRunToHere?: () => void;
}) {
  const [copied, setCopied] = useState(false);

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

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 300,
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
          </div>
        </>
      )}
    </div>
  );
}

// ─── Inner graph (must live inside ReactFlowProvider) ──────────────────────────
function PipelineGraphTabInner() {
  const { steps, removeStep, keepStepsThrough } = usePipelineContext();
  const { activeDataset, setActiveDataset } = useWorkspaceContext();
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedStep, setSelectedStep] = useState<PipelineStep | null>(null);

  const handleNodeClick = useCallback((step: PipelineStep) => {
    setSelectedStep((prev) => (prev?.id === step.id ? null : step));
  }, []);

  const handleNodeDelete = useCallback((step: PipelineStep) => {
    removeStep(step.id);
    setSelectedStep((prev) => (prev?.id === step.id ? null : prev));
  }, [removeStep]);

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
    const { nodes: n, edges: e } = buildLayout(sourceName, sourceRows, steps, handleNodeClick, handleNodeDelete);
    setNodes(n);
    setEdges(e);
    const t = setTimeout(() => {
      rf.fitView({ padding: 0.15, duration: 300 });
    }, 80);
    return () => clearTimeout(t);
  }, [steps, sourceName, sourceRows, handleNodeClick, handleNodeDelete, setNodes, setEdges, rf]);

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
          right: selectedStep ? 310 : 10,
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
      />
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
