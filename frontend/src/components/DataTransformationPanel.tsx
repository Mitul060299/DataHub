import {
  Alert,
  Button,
  Card,
  Collapse,
  Divider,
  Dropdown,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ApartmentOutlined,
  BranchesOutlined,
  DownOutlined,
  FilterOutlined,
  FunctionOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  SaveOutlined,
  ShareAltOutlined,
  SwapOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import * as ReactFlowPkg from "reactflow";
import "reactflow/dist/style.css";
import { notify } from "../utils/notify";
import { AIChat, type AIAction, type DatasetSummary } from "./ai/AIChat";

const { Text, Title } = Typography;

const ReactFlow = (ReactFlowPkg as any).default ?? (ReactFlowPkg as any).ReactFlow ?? ReactFlowPkg;
const {
  Background,
  Controls,
  MarkerType,
  useEdgesState,
  useNodesState,
} = ReactFlowPkg as any;

type StepType =
  | "filter_rows"
  | "group_by"
  | "new_column"
  | "left_join"
  | "rename_columns"
  | "sort_rows";

type FilterCondition = {
  id: string;
  column: string;
  operator: string;
  value: string | number;
  logic: "AND" | "OR";
};

type Aggregation = {
  id: string;
  column: string;
  fn: string;
  output: string;
};

type StepConfig = {
  conditions?: FilterCondition[];
  groupBy?: string[];
  aggregations?: Aggregation[];
};

type Step = {
  id: string;
  type: StepType;
  description: string;
  config: StepConfig;
};

type PreviewRow = {
  id: string;
  region: string;
  category: string;
  revenue: number;
  orders: number;
  date: string;
};

type RecipeHistoryItem = {
  id: string;
  name: string;
  timestamp: string;
};

type StepNodeData = {
  step: Step;
  index: number;
  rowCount: number;
  prevCount: number;
  preview: PreviewRow[];
  selected: boolean;
  onSelect: () => void;
  onMenu: (action: string) => void;
  onAddBelow: () => void;
};

type StepTypeMeta = {
  label: string;
  color: string;
  icon: JSX.Element;
};

const STEP_TYPE_META: Record<StepType, StepTypeMeta> = {
  filter_rows: { label: "Filter rows", color: "#2563eb", icon: <FilterOutlined /> },
  group_by: { label: "Group by", color: "#14b8a6", icon: <FunctionOutlined /> },
  new_column: { label: "New column", color: "#f97316", icon: <NodeIndexOutlined /> },
  left_join: { label: "Left join", color: "#8b5cf6", icon: <BranchesOutlined /> },
  rename_columns: { label: "Rename columns", color: "#0ea5e9", icon: <SwapOutlined /> },
  sort_rows: { label: "Sort rows", color: "#22c55e", icon: <ApartmentOutlined /> },
};

const LIBRARY: Array<{ title: string; items: Array<{ type: StepType; label: string }> }> = [
  {
    title: "Transform",
    items: [
      { type: "filter_rows", label: "Filter rows" },
      { type: "group_by", label: "Group by" },
      { type: "new_column", label: "Calculated column" },
    ],
  },
  {
    title: "Join",
    items: [
      { type: "left_join", label: "Left join" },
      { type: "rename_columns", label: "Rename columns" },
    ],
  },
  {
    title: "Organize",
    items: [{ type: "sort_rows", label: "Sort rows" }],
  },
];

const SAMPLE_ROW_COUNT = 18420;

const PREVIEW_COLUMNS = [
  { title: "Region", dataIndex: "region", key: "region" },
  { title: "Category", dataIndex: "category", key: "category" },
  { title: "Revenue", dataIndex: "revenue", key: "revenue" },
  { title: "Orders", dataIndex: "orders", key: "orders" },
  { title: "Date", dataIndex: "date", key: "date" },
];

const PREVIEW_ROWS: PreviewRow[] = [
  { id: "1", region: "North", category: "Hardware", revenue: 12400, orders: 42, date: "2025-10-14" },
  { id: "2", region: "East", category: "Software", revenue: 9800, orders: 31, date: "2025-10-15" },
  { id: "3", region: "West", category: "Services", revenue: 15600, orders: 55, date: "2025-10-16" },
  { id: "4", region: "South", category: "Hardware", revenue: 8300, orders: 26, date: "2025-10-17" },
  { id: "5", region: "North", category: "Software", revenue: 11300, orders: 37, date: "2025-10-18" },
];

const initialSteps: Step[] = [
  {
    id: "step-1",
    type: "filter_rows",
    description: "Filter rows: Revenue above threshold",
    config: {
      conditions: [
        {
          id: "cond-1",
          column: "revenue",
          operator: ">",
          value: 1000,
          logic: "AND",
        },
      ],
    },
  },
  {
    id: "step-2",
    type: "group_by",
    description: "Group by: Region and Category",
    config: {
      groupBy: ["region", "category"],
      aggregations: [
        {
          id: "agg-1",
          column: "revenue",
          fn: "sum",
          output: "total_revenue",
        },
      ],
    },
  },
  {
    id: "step-3",
    type: "new_column",
    description: "New column: Revenue per order",
    config: {},
  },
];

const buildRowCounts = (steps: Step[]) => {
  const counts: number[] = [];
  let current = SAMPLE_ROW_COUNT;
  steps.forEach((step) => {
    const factor = step.type === "filter_rows" ? 0.82 : step.type === "group_by" ? 0.58 : 0.92;
    current = Math.max(120, Math.round(current * factor));
    counts.push(current);
  });
  return counts;
};

const applyPreviewTransformations = (_steps: Step[]) => PREVIEW_ROWS;

const buildValidationErrors = (steps: Step[]) => {
  const errors: Record<string, string> = {};
  steps.forEach((step) => {
    if (step.type === "filter_rows") {
      const conditions = step.config.conditions || [];
      if (conditions.length === 0) {
        errors[step.id] = "Add at least one filter condition.";
      } else if (conditions.some((c) => !c.column || !c.operator || c.value === "")) {
        errors[step.id] = "Complete all filter condition fields.";
      }
    }
    if (step.type === "group_by") {
      const groupBy = step.config.groupBy || [];
      const aggs = step.config.aggregations || [];
      if (groupBy.length === 0) {
        errors[step.id] = "Select at least one group by column.";
      } else if (aggs.length === 0) {
        errors[step.id] = "Add at least one aggregation.";
      } else if (aggs.some((agg) => !agg.column || !agg.fn || !agg.output)) {
        errors[step.id] = "Complete all aggregation fields.";
      }
    }
  });
  return errors;
};

const StepNode = ({ data }: { data: StepNodeData }) => {
  const meta = STEP_TYPE_META[data.step.type];
  return (
    <div className={`transform-node ${data.selected ? "transform-node--active" : ""}`}>
      <div className="transform-node-header" style={{ borderColor: meta.color }}>
        <span className="step-badge">{data.index + 1}</span>
        <span className="step-icon" style={{ color: meta.color }}>
          {meta.icon}
        </span>
        <Text className="step-title">{data.step.description}</Text>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "edit", label: "Edit" },
              { key: "duplicate", label: "Duplicate" },
              { key: "delete", label: "Delete" },
            ],
            onClick: ({ key }) => data.onMenu(key),
          }}
        >
          <Button size="small" type="text" icon={<DownOutlined />} />
        </Dropdown>
      </div>
      <Tooltip
        placement="right"
        title={
          <div className="preview-tooltip">
            <Text strong>Preview snapshot</Text>
            {data.preview.slice(0, 3).map((row) => (
              <Text key={row.id}>
                {row.region} - {row.category} - {row.revenue}
              </Text>
            ))}
          </div>
        }
      >
        <div className="transform-node-body" onClick={data.onSelect}>
          <div className="row-impact">
            <span>{data.prevCount.toLocaleString()}</span>
            <span>{"->"}</span>
            <span>{data.rowCount.toLocaleString()} rows</span>
          </div>
          <div className="node-footer">
            <span className="drag-handle">::</span>
            <Tag color="blue" className="step-type-tag">
              {meta.label}
            </Tag>
          </div>
        </div>
      </Tooltip>
      <div className="node-add">
        <Button size="small" icon={<PlusOutlined />} onClick={data.onAddBelow}>
          Add step
        </Button>
      </div>
    </div>
  );
};

export function DataTransformationPanel() {
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [selectedId, setSelectedId] = useState<string>(initialSteps[0].id);
  const [recipeName, setRecipeName] = useState("Revenue cleanup");
  const [history, setHistory] = useState<RecipeHistoryItem[]>([]);

  const dataset: DatasetSummary = {
    id: "sales_enriched",
    name: "sales_enriched",
    rows: SAMPLE_ROW_COUNT,
    columns: PREVIEW_COLUMNS.map((column) => column.title as string),
  };

  const rowCounts = useMemo(() => buildRowCounts(steps), [steps]);
  const previewRows = useMemo(() => applyPreviewTransformations(steps), [steps]);
  const validationErrors = useMemo(() => buildValidationErrors(steps), [steps]);

  const selectedStep = steps.find((step) => step.id === selectedId) || steps[0];

  const addStep = (type: StepType, index?: number) => {
    const newStep: Step = {
      id: `step-${Date.now()}`,
      type,
      description: `${STEP_TYPE_META[type].label}: Configure step`,
      config: {},
    };
    setSteps((prev) => {
      if (index === undefined) {
        return [...prev, newStep];
      }
      const next = [...prev];
      next.splice(index + 1, 0, newStep);
      return next;
    });
    setSelectedId(newStep.id);
  };

  const updateSelected = (patch: Partial<StepConfig>, description?: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === selectedId
          ? {
              ...step,
              description: description || step.description,
              config: {
                ...step.config,
                ...patch,
              },
            }
          : step
      )
    );
  };

  const handleMenu = (id: string, action: string) => {
    if (action === "delete") {
      setSteps((prev) => prev.filter((step) => step.id !== id));
      return;
    }
    if (action === "duplicate") {
      const target = steps.find((step) => step.id === id);
      if (!target) return;
      const copy = { ...target, id: `step-${Date.now()}` };
      setSteps((prev) => {
        const index = prev.findIndex((step) => step.id === id);
        const next = [...prev];
        next.splice(index + 1, 0, copy);
        return next;
      });
      return;
    }
    if (action === "edit") {
      setSelectedId(id);
    }
  };

  const saveRecipe = () => {
    const timestamp = new Date().toLocaleString();
    setHistory((prev) => [
      { id: `${Date.now()}`, name: recipeName || "Untitled", timestamp },
      ...prev,
    ]);
    notify.success("Recipe saved");
  };

  const exportRecipe = () => {
    const payload = JSON.stringify({ name: recipeName, steps }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${recipeName || "recipe"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify.success("Recipe exported");
  };

  const importRecipe = () => {
    setSteps(initialSteps);
    setSelectedId(initialSteps[0].id);
    notify.info("Loaded a pre-built recipe");
  };

  const nodes = useMemo(
    () =>
      steps.map((step, index) => ({
        id: step.id,
        type: "stepNode",
        position: { x: 0, y: index * 180 },
        data: {
          step,
          index,
          rowCount: rowCounts[index] || SAMPLE_ROW_COUNT,
          prevCount: index === 0 ? SAMPLE_ROW_COUNT : rowCounts[index - 1],
          preview: previewRows,
          selected: step.id === selectedId,
          onSelect: () => setSelectedId(step.id),
          onMenu: (key: string) => handleMenu(step.id, key),
          onAddBelow: () => addStep("filter_rows", index),
        } as StepNodeData,
        draggable: true,
      })),
    [steps, rowCounts, previewRows, selectedId]
  );

  const edges = useMemo(
    () =>
      steps.slice(0, -1).map((step, index) => ({
        id: `edge-${step.id}`,
        source: step.id,
        target: steps[index + 1].id,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: true,
      })),
    [steps]
  );

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setFlowEdges] = useEdgesState(edges);

  useEffect(() => setFlowNodes(nodes), [nodes, setFlowNodes]);
  useEffect(() => setFlowEdges(edges), [edges, setFlowEdges]);

  const reorderFromDrag = () => {
    const ordered = [...flowNodes].sort((a, b) => a.position.y - b.position.y);
    const nextSteps = ordered
      .map((node) => steps.find((step) => step.id === node.id))
      .filter((step): step is Step => Boolean(step));
    setSteps(nextSteps);
  };

  const activeError = selectedStep ? validationErrors[selectedStep.id] : undefined;

  const handleAIAction = (action: AIAction) => {
    switch (action.type) {
      case "add_join":
        addStep("left_join");
        break;
      case "add_filter":
        addStep("filter_rows");
        break;
      case "add_calc":
        addStep("new_column");
        break;
      case "save_recipe":
        saveRecipe();
        break;
      case "export_recipe":
        exportRecipe();
        break;
      default:
        notify.info(`AI action: ${action.type}`);
    }
  };

  return (
    <div className="ai-first-layout">
      <div className="ai-first-main">
        <div className="transform-root">
          <div className="transform-header">
            <div>
              <Title level={3}>Transformation Studio</Title>
              <Text type="secondary">Build, test, and publish transformation recipes.</Text>
            </div>
            <Space wrap>
              <Button icon={<SaveOutlined />} onClick={saveRecipe}>
                Save recipe
              </Button>
              <Button icon={<ShareAltOutlined />} onClick={exportRecipe}>
                Export recipe
              </Button>
              <Button icon={<ToolOutlined />} onClick={importRecipe}>
                Import recipe
              </Button>
            </Space>
          </div>

          <div className="transform-layout">
            <div className="transform-sidebar">
              <Card className="panel-card" title="Step library">
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  {LIBRARY.map((section) => (
                    <div key={section.title}>
                      <Text type="secondary">{section.title}</Text>
                      <div className="library-list">
                        {section.items.map((item) => (
                          <Button
                            key={item.type}
                            type="text"
                            className="library-item"
                            icon={STEP_TYPE_META[item.type].icon}
                            onClick={() => addStep(item.type)}
                          >
                            {item.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </Space>
              </Card>

              <Card className="panel-card" title="Recipe history">
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  {history.length === 0 ? (
                    <Text type="secondary">No saved versions yet.</Text>
                  ) : (
                    history.map((item) => (
                      <div key={item.id} className="history-item">
                        <Text strong>{item.name}</Text>
                        <Text type="secondary">{item.timestamp}</Text>
                      </div>
                    ))
                  )}
                </Space>
              </Card>
            </div>

            <div className="transform-canvas">
              <Card className="panel-card" title="Flow builder">
                <div className="flow-header">
                  <Input
                    value={recipeName}
                    onChange={(event) => setRecipeName(event.target.value)}
                    placeholder="Recipe name"
                  />
                  <Space>
                    <Button icon={<ToolOutlined />} onClick={importRecipe}>
                      Load template
                    </Button>
                    <Button icon={<SaveOutlined />} onClick={saveRecipe}>
                      Save
                    </Button>
                  </Space>
                </div>
                {Object.keys(validationErrors).length > 0 && (
                  <Alert type="warning" message="Some steps are missing configuration." showIcon />
                )}
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  nodeTypes={{ stepNode: StepNode }}
                  onNodesChange={onNodesChange}
                  onNodeDragStop={reorderFromDrag}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  zoomOnScroll={false}
                  nodesConnectable={false}
                >
                  <Controls position="bottom-left" />
                  <Background gap={20} color="#e2e8f0" />
                </ReactFlow>
              </Card>
            </div>

            <div className="transform-config">
              <Card className="panel-card" title="Step configuration">
                {selectedStep ? (
                  <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                    <Space direction="vertical" size={4}>
                      <Text strong>{STEP_TYPE_META[selectedStep.type].label}</Text>
                      <Text type="secondary">{selectedStep.description}</Text>
                    </Space>
                    {activeError && <Alert type="error" message={activeError} showIcon />}
                    <Divider />
                    {selectedStep.type === "filter_rows" && (
                      <Space direction="vertical" style={{ width: "100%" }}>
                        <Text strong>Filters</Text>
                        {(selectedStep.config.conditions || []).map((condition) => (
                          <div key={condition.id} className="condition-row">
                            <Select
                              value={condition.column}
                              options={PREVIEW_COLUMNS.map((column) => ({
                                label: column.title,
                                value: column.dataIndex,
                              }))}
                              onChange={(value) => {
                                updateSelected({
                                  conditions: (selectedStep.config.conditions || []).map((item) =>
                                    item.id === condition.id ? { ...item, column: value } : item
                                  ),
                                });
                              }}
                            />
                            <Select
                              value={condition.operator}
                              options={["=", "!=", ">", ">=", "<", "<="].map((value) => ({
                                label: value,
                                value,
                              }))}
                              onChange={(value) => {
                                updateSelected({
                                  conditions: (selectedStep.config.conditions || []).map((item) =>
                                    item.id === condition.id ? { ...item, operator: value } : item
                                  ),
                                });
                              }}
                            />
                            <InputNumber
                              value={Number(condition.value)}
                              onChange={(value) => {
                                updateSelected({
                                  conditions: (selectedStep.config.conditions || []).map((item) =>
                                    item.id === condition.id ? { ...item, value: value ?? 0 } : item
                                  ),
                                });
                              }}
                            />
                            <Select
                              value={condition.logic}
                              options={[
                                { label: "AND", value: "AND" },
                                { label: "OR", value: "OR" },
                              ]}
                              onChange={(value) => {
                                updateSelected({
                                  conditions: (selectedStep.config.conditions || []).map((item) =>
                                    item.id === condition.id ? { ...item, logic: value } : item
                                  ),
                                });
                              }}
                            />
                          </div>
                        ))}
                        <Button
                          icon={<PlusOutlined />}
                          onClick={() =>
                            updateSelected({
                              conditions: [
                                ...(selectedStep.config.conditions || []),
                                {
                                  id: `cond-${Date.now()}`,
                                  column: "revenue",
                                  operator: ">",
                                  value: 1000,
                                  logic: "AND",
                                },
                              ],
                            })
                          }
                        >
                          Add condition
                        </Button>
                      </Space>
                    )}

                    {selectedStep.type === "group_by" && (
                      <Space direction="vertical" size="small" style={{ width: "100%" }}>
                        <Select
                          mode="multiple"
                          placeholder="Group by columns"
                          value={selectedStep.config.groupBy || []}
                          onChange={(value) => updateSelected({ groupBy: value })}
                          options={[
                            { label: "region", value: "region" },
                            { label: "category", value: "category" },
                            { label: "date", value: "date" },
                          ]}
                        />
                        <div className="aggregation-list">
                          {(selectedStep.config.aggregations || []).map((agg, index) => (
                            <div key={agg.id} className="aggregation-row">
                              <Select
                                value={agg.column}
                                placeholder="Column"
                                onChange={(value) => {
                                  const aggregations = [...(selectedStep.config.aggregations || [])];
                                  aggregations[index] = { ...agg, column: value };
                                  updateSelected({ aggregations });
                                }}
                                options={[
                                  { label: "revenue", value: "revenue" },
                                  { label: "orders", value: "orders" },
                                ]}
                                style={{ flex: 1 }}
                              />
                              <Select
                                value={agg.fn}
                                placeholder="Function"
                                onChange={(value) => {
                                  const aggregations = [...(selectedStep.config.aggregations || [])];
                                  aggregations[index] = { ...agg, fn: value };
                                  updateSelected({ aggregations });
                                }}
                                options={["sum", "avg", "count", "min", "max"].map((value) => ({
                                  label: value,
                                  value,
                                }))}
                                style={{ width: 120 }}
                              />
                              <Input
                                value={agg.output}
                                placeholder="Output name"
                                onChange={(event) => {
                                  const aggregations = [...(selectedStep.config.aggregations || [])];
                                  aggregations[index] = { ...agg, output: event.target.value };
                                  updateSelected({ aggregations });
                                }}
                                style={{ width: 160 }}
                              />
                            </div>
                          ))}
                        </div>
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          onClick={() => {
                            const aggregations = [...(selectedStep.config.aggregations || [])];
                            aggregations.push({
                              id: `agg-${Date.now()}`,
                              column: "",
                              fn: "sum",
                              output: "",
                            });
                            updateSelected({ aggregations });
                          }}
                        >
                          Add aggregation
                        </Button>
                      </Space>
                    )}

                    {!selectedStep.type.includes("filter") &&
                      !selectedStep.type.includes("group_by") && (
                        <Text type="secondary">Select a step to configure details.</Text>
                      )}
                  </Space>
                ) : (
                  <Text type="secondary">Select a step to configure.</Text>
                )}
              </Card>
            </div>
          </div>

          <Collapse
            defaultActiveKey={["preview"]}
            items={[
              {
                key: "preview",
                label: "Live Preview",
                children: (
                  <Table
                    dataSource={previewRows.map((row) => ({ key: row.id, ...row }))}
                    columns={PREVIEW_COLUMNS}
                    pagination={false}
                    size="small"
                  />
                ),
              },
            ]}
          />
        </div>
      </div>
      <div className="ai-first-chat">
        <AIChat
          context="transform"
          currentDataset={dataset}
          onAction={handleAIAction}
          suggestions={[
            "Join these two datasets",
            "Pivot by category and month",
            "Filter rows where revenue > 1000",
            "Create a calculated column",
            "Aggregate by customer",
          ]}
        />
      </div>
    </div>
  );
}
