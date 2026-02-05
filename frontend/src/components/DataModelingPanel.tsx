import {
  Button,
  Card,
  Divider,
  Input,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ApartmentOutlined,
  BranchesOutlined,
  DatabaseOutlined,
  ExportOutlined,
  LinkOutlined,
  PlusOutlined,
  RadarChartOutlined,
} from "@ant-design/icons";
import { useMemo, useRef, useState } from "react";
import * as ReactFlowPkg from "reactflow";
import "reactflow/dist/style.css";
import { toPng, toSvg } from "html-to-image";
import { notify } from "../utils/notify";
import { AIChat, type AIAction, type DatasetSummary } from "./ai/AIChat";

const { Text, Title } = Typography;

const ReactFlow = (ReactFlowPkg as any).default ?? (ReactFlowPkg as any).ReactFlow ?? ReactFlowPkg;
const {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
} = ReactFlowPkg as any;

type ColumnType = "text" | "number" | "date" | "boolean";

type Column = {
  id: string;
  name: string;
  type: ColumnType;
  isPrimary?: boolean;
  isForeign?: boolean;
};

type TableEntity = {
  id: string;
  name: string;
  description: string;
  columns: Column[];
  position: { x: number; y: number };
  stage: "raw" | "cleaned" | "transformed";
};

type Relationship = {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  type: "one-to-one" | "one-to-many" | "many-to-many";
  cardinality: string;
  integrity: string;
  aiSuggested?: boolean;
  confidence?: number;
};

type TableNodeData = {
  table: TableEntity;
  selected: boolean;
  showLineage: boolean;
  onSelect: () => void;
};

const COLUMN_TYPE_ICON: Record<ColumnType, string> = {
  text: "T",
  number: "#",
  date: "📅",
  boolean: "✓",
};

const STAGE_COLORS: Record<TableEntity["stage"], string> = {
  raw: "#94a3b8",
  cleaned: "#38bdf8",
  transformed: "#22c55e",
};

const SAMPLE_TABLES: TableEntity[] = [
  {
    id: "orders",
    name: "orders",
    description: "Raw order feed",
    stage: "raw",
    position: { x: 40, y: 30 },
    columns: [
      { id: "order_id", name: "order_id", type: "text", isPrimary: true },
      { id: "customer_id", name: "customer_id", type: "text", isForeign: true },
      { id: "order_date", name: "order_date", type: "date" },
      { id: "total", name: "total", type: "number" },
    ],
  },
  {
    id: "customers",
    name: "customers",
    description: "Customer master",
    stage: "cleaned",
    position: { x: 420, y: 30 },
    columns: [
      { id: "customer_id", name: "customer_id", type: "text", isPrimary: true },
      { id: "name", name: "name", type: "text" },
      { id: "segment", name: "segment", type: "text" },
    ],
  },
  {
    id: "order_items",
    name: "order_items",
    description: "Line items",
    stage: "raw",
    position: { x: 40, y: 320 },
    columns: [
      { id: "order_item_id", name: "order_item_id", type: "text", isPrimary: true },
      { id: "order_id", name: "order_id", type: "text", isForeign: true },
      { id: "product_id", name: "product_id", type: "text", isForeign: true },
      { id: "quantity", name: "quantity", type: "number" },
    ],
  },
  {
    id: "products",
    name: "products",
    description: "Normalized product catalog",
    stage: "transformed",
    position: { x: 420, y: 320 },
    columns: [
      { id: "product_id", name: "product_id", type: "text", isPrimary: true },
      { id: "product_name", name: "product_name", type: "text" },
      { id: "category", name: "category", type: "text" },
    ],
  },
];

const SAMPLE_RELATIONSHIPS: Relationship[] = [
  {
    id: "rel-1",
    sourceTable: "customers",
    sourceColumn: "customer_id",
    targetTable: "orders",
    targetColumn: "customer_id",
    type: "one-to-many",
    cardinality: "1 ━━< ∞",
    integrity: "ON UPDATE CASCADE",
  },
  {
    id: "rel-2",
    sourceTable: "orders",
    sourceColumn: "order_id",
    targetTable: "order_items",
    targetColumn: "order_id",
    type: "one-to-many",
    cardinality: "1 ━━< ∞",
    integrity: "ON DELETE CASCADE",
    aiSuggested: true,
    confidence: 0.86,
  },
  {
    id: "rel-3",
    sourceTable: "products",
    sourceColumn: "product_id",
    targetTable: "order_items",
    targetColumn: "product_id",
    type: "one-to-many",
    cardinality: "1 ━━< ∞",
    integrity: "ON DELETE RESTRICT",
  },
];

const TableNode = ({ data }: { data: TableNodeData }) => {
  const { table, selected, showLineage } = data;
  return (
    <div
      className={`erd-node ${selected ? "erd-node--active" : ""}`}
      style={{ borderColor: showLineage ? STAGE_COLORS[table.stage] : "#e2e8f0" }}
      onClick={data.onSelect}
    >
      <Handle type="target" position={Position.Left} id={`${table.id}-left`} />
      <Handle type="source" position={Position.Right} id={`${table.id}-right`} />
      <div className="erd-node-header">
        <DatabaseOutlined />
        <span>{table.name}</span>
      </div>
      <div className="erd-node-body">
        {table.columns.map((column) => (
          <div key={column.id} className="erd-column">
            <span className="column-type">{COLUMN_TYPE_ICON[column.type]}</span>
            <span className={column.isPrimary ? "pk-highlight" : column.isForeign ? "fk-highlight" : ""}>
              {column.name}
            </span>
            {column.isPrimary && <span className="pk-icon">🔑</span>}
            {column.isForeign && <span className="fk-icon">🔗</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

export function DataModelingPanel() {
  const [tables, setTables] = useState<TableEntity[]>(SAMPLE_TABLES);
  const [relationships, setRelationships] = useState<Relationship[]>(SAMPLE_RELATIONSHIPS);
  const [selectedTableId, setSelectedTableId] = useState<string>(SAMPLE_TABLES[0].id);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [showLineage, setShowLineage] = useState(false);
  const [normalize3NF, setNormalize3NF] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const nodes = useMemo(
    () =>
      tables.map((table) => ({
        id: table.id,
        position: table.position,
        data: {
          table,
          selected: table.id === selectedTableId,
          showLineage,
          onSelect: () => {
            setSelectedRelationshipId(null);
            setSelectedTableId(table.id);
          },
        },
        type: "tableNode",
      })),
    [tables, selectedTableId, showLineage]
  );

  const edges = useMemo(
    () =>
      relationships.map((rel) => ({
        id: rel.id,
        source: rel.sourceTable,
        target: rel.targetTable,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: true,
        label: rel.cardinality,
        style: {
          stroke: rel.aiSuggested ? "#94a3b8" : "#64748b",
          strokeWidth: 2,
          strokeDasharray: rel.aiSuggested ? "6 4" : undefined,
        },
        labelStyle: { fill: "#475569", fontWeight: 600 },
      })),
    [relationships]
  );

  const selectedTable = tables.find((table) => table.id === selectedTableId) || tables[0];
  const selectedRelationship = relationships.find((rel) => rel.id === selectedRelationshipId) || null;
  const dataset: DatasetSummary = {
    id: selectedTable.id,
    name: selectedTable.name,
    columns: selectedTable.columns.map((column) => column.name),
  };

  const handleAutoLayout = () => {
    setTables((prev) =>
      prev.map((table, index) => ({
        ...table,
        position: { x: 60 + (index % 2) * 380, y: 40 + Math.floor(index / 2) * 260 },
      }))
    );
  };

  const handleDetectRelationships = () => {
    const newRel: Relationship = {
      id: `rel-${Date.now()}`,
      sourceTable: "customers",
      sourceColumn: "customer_id",
      targetTable: "order_items",
      targetColumn: "order_id",
      type: "one-to-many",
      cardinality: "1 ━━< ∞",
      integrity: "ON DELETE RESTRICT",
      aiSuggested: true,
      confidence: 0.74,
    };
    setRelationships((prev) => [...prev, newRel]);
    notify.success("AI relationship suggestions ready");
  };

  const handleGenerateSchema = () => {
    notify.success(`Schema generated${normalize3NF ? " (3NF optimized)" : ""}`);
  };

  const updateSelectedTable = (patch: Partial<TableEntity>) => {
    setTables((prev) => prev.map((table) => (table.id === selectedTableId ? { ...table, ...patch } : table)));
  };

  const updateRelationship = (patch: Partial<Relationship>) => {
    if (!selectedRelationship) return;
    setRelationships((prev) =>
      prev.map((rel) => (rel.id === selectedRelationship.id ? { ...rel, ...patch } : rel))
    );
  };

  const acceptSuggestion = () => {
    if (!selectedRelationship) return;
    updateRelationship({ aiSuggested: false });
    notify.success("Relationship accepted");
  };

  const exportDiagram = async (format: "png" | "svg") => {
    if (!wrapperRef.current) return;
    try {
      if (format === "png") {
        const dataUrl = await toPng(wrapperRef.current);
        const link = document.createElement("a");
        link.download = "erd-diagram.png";
        link.href = dataUrl;
        link.click();
      } else {
        const dataUrl = await toSvg(wrapperRef.current);
        const link = document.createElement("a");
        link.download = "erd-diagram.svg";
        link.href = dataUrl;
        link.click();
      }
    } catch (error) {
      notify.error("Failed to export diagram");
    }
  };

  const handleAIAction = (action: AIAction) => {
    switch (action.type) {
      case "detect_relationships":
        handleDetectRelationships();
        break;
      case "auto_layout":
        handleAutoLayout();
        break;
      case "export_erd":
        exportDiagram("png");
        break;
      default:
        notify.info(`AI action: ${action.type}`);
    }
  };

  return (
    <div className="ai-first-layout">
      <div className="ai-first-main">
        <div className="modeling-root">
      <div className="modeling-header">
        <Space direction="vertical">
          <Title level={3} style={{ margin: 0 }}>
            Data Modeling Studio
          </Title>
          <Text type="secondary">Drag and connect entities to build your ERD.</Text>
        </Space>
        <Space wrap>
          <Button icon={<RadarChartOutlined />} onClick={handleDetectRelationships}>
            Detect relationships
          </Button>
          <Space>
            <Switch checked={normalize3NF} onChange={setNormalize3NF} />
            <Text type="secondary">Normalize to 3NF</Text>
          </Space>
          <Button icon={<ApartmentOutlined />} onClick={handleGenerateSchema}>
            Generate schema
          </Button>
          <Button icon={<BranchesOutlined />} onClick={handleAutoLayout}>
            Auto-layout
          </Button>
          <Button icon={<ExportOutlined />} onClick={() => exportDiagram("png")}>Export PNG</Button>
          <Button icon={<ExportOutlined />} onClick={() => exportDiagram("svg")}>Export SVG</Button>
        </Space>
      </div>

      <div className="modeling-layout">
        <div className="modeling-canvas" ref={wrapperRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={{ tableNode: TableNode }}
            onNodeDragStop={(_: unknown, node: { id: string; position: { x: number; y: number } }) => {
              setTables((prev) =>
                prev.map((table) => (table.id === node.id ? { ...table, position: node.position } : table))
              );
            }}
            onEdgeClick={(_: unknown, edge: { id: string }) => {
              setSelectedRelationshipId(edge.id);
              setSelectedTableId("");
            }}
            fitView
            nodesConnectable={false}
          >
            <Background gap={18} color="#e2e8f0" />
            <Controls position="bottom-right" />
            <MiniMap
              position="bottom-right"
              nodeColor={(node: { id: string }) => {
                const table = tables.find((item) => item.id === node.id);
                return table ? STAGE_COLORS[table.stage] : "#94a3b8";
              }}
            />
          </ReactFlow>
        </div>

        <div className="modeling-sidebar">
          {selectedRelationship ? (
            <Card className="modeling-card" title="Relationship Properties">
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <div>
                  <Text type="secondary">From</Text>
                  <Select
                    value={selectedRelationship.sourceTable}
                    onChange={(value) => updateRelationship({ sourceTable: value })}
                    options={tables.map((table) => ({ label: table.name, value: table.id }))}
                    style={{ width: "100%" }}
                  />
                  <Select
                    value={selectedRelationship.sourceColumn}
                    onChange={(value) => updateRelationship({ sourceColumn: value })}
                    options={
                      tables
                        .find((table) => table.id === selectedRelationship.sourceTable)
                        ?.columns.map((column) => ({ label: column.name, value: column.name })) || []
                    }
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <Text type="secondary">To</Text>
                  <Select
                    value={selectedRelationship.targetTable}
                    onChange={(value) => updateRelationship({ targetTable: value })}
                    options={tables.map((table) => ({ label: table.name, value: table.id }))}
                    style={{ width: "100%" }}
                  />
                  <Select
                    value={selectedRelationship.targetColumn}
                    onChange={(value) => updateRelationship({ targetColumn: value })}
                    options={
                      tables
                        .find((table) => table.id === selectedRelationship.targetTable)
                        ?.columns.map((column) => ({ label: column.name, value: column.name })) || []
                    }
                    style={{ width: "100%" }}
                  />
                </div>
                <Select
                  value={selectedRelationship.type}
                  onChange={(value) =>
                    updateRelationship({
                      type: value,
                      cardinality:
                        value === "one-to-one"
                          ? "1 ━━ 1"
                          : value === "one-to-many"
                          ? "1 ━━< ∞"
                          : "∞ >━━< ∞",
                    })
                  }
                  options={[
                    { label: "One-to-one", value: "one-to-one" },
                    { label: "One-to-many", value: "one-to-many" },
                    { label: "Many-to-many", value: "many-to-many" },
                  ]}
                />
                <Input
                  value={selectedRelationship.integrity}
                  onChange={(event) => updateRelationship({ integrity: event.target.value })}
                  placeholder="Referential integrity"
                />
                {selectedRelationship.aiSuggested && (
                  <Card className="suggestion-pill">
                    <Space direction="vertical" size={4}>
                      <Text strong>AI suggested relationship</Text>
                      <Text type="secondary">
                        Confidence: {Math.round((selectedRelationship.confidence || 0) * 100)}%
                      </Text>
                      <Button type="primary" onClick={acceptSuggestion}>
                        Accept
                      </Button>
                    </Space>
                  </Card>
                )}
              </Space>
            </Card>
          ) : (
            <Card className="modeling-card" title="Entity Properties">
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Input
                  value={selectedTable.name}
                  onChange={(event) => updateSelectedTable({ name: event.target.value })}
                  placeholder="Table name"
                />
                <Input.TextArea
                  value={selectedTable.description}
                  onChange={(event) => updateSelectedTable({ description: event.target.value })}
                  placeholder="Description"
                />
                <Divider />
                <Text strong>Columns</Text>
                <div className="column-list">
                  {selectedTable.columns.map((column) => (
                    <div key={column.id} className="column-edit-row">
                      <Input
                        value={column.name}
                        onChange={(event) => {
                          const columns = selectedTable.columns.map((item) =>
                            item.id === column.id ? { ...item, name: event.target.value } : item
                          );
                          updateSelectedTable({ columns });
                        }}
                      />
                      <Select
                        value={column.type}
                        onChange={(value) => {
                          const columns = selectedTable.columns.map((item) =>
                            item.id === column.id ? { ...item, type: value } : item
                          );
                          updateSelectedTable({ columns });
                        }}
                        options={["text", "number", "date", "boolean"].map((value) => ({
                          label: value,
                          value,
                        }))}
                      />
                      <Tooltip title="Toggle primary key">
                        <Button
                          type={column.isPrimary ? "primary" : "default"}
                          onClick={() => {
                            const columns = selectedTable.columns.map((item) =>
                              item.id === column.id ? { ...item, isPrimary: !item.isPrimary } : item
                            );
                            updateSelectedTable({ columns });
                          }}
                        >
                          🔑
                        </Button>
                      </Tooltip>
                      <Tooltip title="Toggle foreign key">
                        <Button
                          type={column.isForeign ? "primary" : "default"}
                          onClick={() => {
                            const columns = selectedTable.columns.map((item) =>
                              item.id === column.id ? { ...item, isForeign: !item.isForeign } : item
                            );
                            updateSelectedTable({ columns });
                          }}
                        >
                          🔗
                        </Button>
                      </Tooltip>
                    </div>
                  ))}
                </div>
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    const columns = [
                      ...selectedTable.columns,
                      {
                        id: `col-${Date.now()}`,
                        name: "new_column",
                        type: "text" as ColumnType,
                      },
                    ];
                    updateSelectedTable({ columns });
                  }}
                >
                  Add column
                </Button>
                <Divider />
                <Text strong>Indexes</Text>
                <Tag color="geekblue">idx_{selectedTable.name}_pk</Tag>
                <Text strong>Constraints</Text>
                <Tag color="purple">NOT NULL</Tag>
              </Space>
            </Card>
          )}

          <Card className="modeling-card" title="Data Lineage">
            <Space direction="vertical" size="small">
              <Space>
                <Switch checked={showLineage} onChange={setShowLineage} />
                <Text type="secondary">Show lineage stages</Text>
              </Space>
              <div className="lineage-legend">
                <Tag color="default">Raw</Tag>
                <Tag color="cyan">Cleaned</Tag>
                <Tag color="green">Transformed</Tag>
              </div>
              <Text type="secondary">
                Click any table to inspect the full lineage path.
              </Text>
            </Space>
          </Card>
        </div>
      </div>
        </div>
      </div>
      <div className="ai-first-chat">
        <AIChat
          context="model"
          currentDataset={dataset}
          onAction={handleAIAction}
          suggestions={[
            "Detect relationships automatically",
            "Create a relationship between sales and customers",
            "Suggest a schema for my data",
            "Generate documentation",
          ]}
        />
      </div>
    </div>
  );
}
