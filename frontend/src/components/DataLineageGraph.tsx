import { useEffect } from "react";
import ReactFlow, { Background, Controls, useNodesState, useEdgesState } from "reactflow";
import "reactflow/dist/style.css";

export interface LineageNode {
  dataset_id: string;
  name: string | null;
  file_format: string | null;
  source_type: string | null;
  row_count: number;
  created_at: string | null;
}

export interface LineageEdge {
  from_dataset_id: string;
  to_dataset_id: string;
  relationship: string;
}

interface DataLineageGraphProps {
  currentDatasetId: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export function DataLineageGraph({ currentDatasetId, nodes, edges }: DataLineageGraphProps) {
  const buildRfNodes = () =>
    nodes.map((node, i) => ({
      id: node.dataset_id,
      position: { x: i * 240, y: 80 },
      data: {
        label: (
          <div style={{ padding: "6px 10px", textAlign: "center" as const }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 12,
                color: node.dataset_id === currentDatasetId ? "#a5b4fc" : "#e8e8f0",
                marginBottom: 2,
              }}
            >
              {node.name || "Unnamed"}
            </div>
            <div style={{ fontSize: 10, color: "#8888a0" }}>
              {node.row_count.toLocaleString()} rows
              {node.file_format ? ` · ${node.file_format}` : ""}
            </div>
          </div>
        ),
      },
      style: {
        background:
          node.dataset_id === currentDatasetId ? "rgba(91,106,240,0.15)" : "#18181e",
        border: `1px solid ${
          node.dataset_id === currentDatasetId ? "#5b6af0" : "#2e2e3a"
        }`,
        borderRadius: 8,
        minWidth: 160,
        padding: 0,
      },
    }));

  const buildRfEdges = () =>
    edges.map((edge) => ({
      id: `${edge.from_dataset_id}->${edge.to_dataset_id}`,
      source: edge.from_dataset_id,
      target: edge.to_dataset_id,
      label: edge.relationship.replace(/_/g, " "),
      style: { stroke: "#44445a" },
      labelStyle: { fill: "#8888a0", fontSize: 10 },
      markerEnd: { type: "arrowclosed", color: "#44445a" },
    }));

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const [rfN, setRfN, onNodesChange] = useNodesState(buildRfNodes());
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const [rfE, setRfE, onEdgesChange] = useEdgesState(buildRfEdges());

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    setRfN(buildRfNodes());
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    setRfE(buildRfEdges());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDatasetId, nodes, edges]);

  if (nodes.length === 0) {
    return (
      <div
        style={{
          height: 120,
          border: "1px solid #22222a",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "#44445a", fontSize: 13 }}>No lineage data found for this dataset.</p>
      </div>
    );
  }

  return (
    <div
      style={{ height: 280, borderRadius: 10, overflow: "hidden", border: "1px solid #22222a" }}
    >
      <ReactFlow
        nodes={rfN}
        edges={rfE}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        attributionPosition="bottom-right"
        style={{ background: "#0d0d11" }}
      >
        <Background color="#22222a" gap={20} />
        <Controls style={{ background: "#18181e", border: "1px solid #2e2e3a" }} />
      </ReactFlow>
    </div>
  );
}
