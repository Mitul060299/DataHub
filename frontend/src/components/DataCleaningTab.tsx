import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Divider,
  Input,
  Progress,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  FilterOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { AIChat, type AIAction, type DatasetSummary } from "./ai/AIChat";
import { notify } from "../utils/notify";
import "./DataCleaningTab.css";

const { Title, Text } = Typography;

type Condition = {
  id: string;
  column: string;
  operator: string;
  value: string;
  logic: "AND" | "OR";
};

type HistoryItem = {
  id: string;
  title: string;
  description: string;
  status: "completed" | "running" | "queued";
  timestamp: string;
};

type Row = {
  id: string;
  customer: string | null;
  email: string | null;
  country: string | null;
  revenue: number | null;
  order_date: string;
  status: string;
};

type OperationId =
  | "remove_duplicates"
  | "fill_missing"
  | "trim_whitespace"
  | "standardize_case"
  | "remove_outliers";

const BEFORE_ROWS: Row[] = [
  {
    id: "1",
    customer: "  ACME Co  ",
    email: "SALES@ACME.COM",
    country: "USA",
    revenue: 12500,
    order_date: "2025-01-15",
    status: "Active",
  },
  {
    id: "2",
    customer: "northwind",
    email: "hello@northwind.io",
    country: "  Canada ",
    revenue: 8200,
    order_date: "2025-01-16",
    status: "Active",
  },
  {
    id: "3",
    customer: null,
    email: null,
    country: "USA",
    revenue: 47000,
    order_date: "2025-01-17",
    status: "Inactive",
  },
  {
    id: "4",
    customer: "Verity Labs",
    email: "ops@verity.io",
    country: "UK",
    revenue: 165000,
    order_date: "2025-01-18",
    status: "Active",
  },
  {
    id: "5",
    customer: "ACME Co",
    email: "sales@acme.com",
    country: "USA",
    revenue: 12500,
    order_date: "2025-01-15",
    status: "Active",
  },
];

const COLUMN_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "email", label: "Email" },
  { value: "country", label: "Country" },
  { value: "revenue", label: "Revenue" },
  { value: "order_date", label: "Order date" },
  { value: "status", label: "Status" },
];

const OPERATORS = [">", ">=", "=", "<=", "<", "contains"];

const OPERATION_LABELS: Record<OperationId, string> = {
  remove_duplicates: "Remove duplicates",
  fill_missing: "Fill missing values",
  trim_whitespace: "Trim whitespace",
  standardize_case: "Standardize case",
  remove_outliers: "Remove outliers",
};

const applyOperations = (rows: Row[], operations: OperationId[]) => {
  let output = [...rows];

  operations.forEach((operation) => {
    if (operation === "remove_duplicates") {
      const seen = new Set<string>();
      output = output.filter((row) => {
        const key = `${row.customer}|${row.email}|${row.country}|${row.revenue}|${row.order_date}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    }

    if (operation === "fill_missing") {
      output = output.map((row) => ({
        ...row,
        customer: row.customer?.trim() ? row.customer : "Unknown",
        email: row.email?.trim() ? row.email : "unknown@example.com",
        country: row.country?.trim() ? row.country : "Unknown",
      }));
    }

    if (operation === "trim_whitespace") {
      output = output.map((row) => ({
        ...row,
        customer: row.customer?.trim() ?? row.customer,
        email: row.email?.trim() ?? row.email,
        country: row.country?.trim() ?? row.country,
      }));
    }

    if (operation === "standardize_case") {
      output = output.map((row) => ({
        ...row,
        customer: row.customer
          ? row.customer
              .toLowerCase()
              .split(" ")
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(" ")
          : row.customer,
        email: row.email ? row.email.toLowerCase() : row.email,
      }));
    }

    if (operation === "remove_outliers") {
      output = output.map((row) => ({
        ...row,
        revenue: row.revenue && row.revenue > 50000 ? 50000 : row.revenue,
      }));
    }
  });

  return output;
};

const PREVIEW_COLUMNS = [
  { title: "Customer", dataIndex: "customer", key: "customer" },
  { title: "Email", dataIndex: "email", key: "email" },
  { title: "Country", dataIndex: "country", key: "country" },
  { title: "Revenue", dataIndex: "revenue", key: "revenue" },
  { title: "Order date", dataIndex: "order_date", key: "order_date" },
  { title: "Status", dataIndex: "status", key: "status" },
];

export function DataCleaningTab() {
  const [operations, setOperations] = useState<OperationId[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(["customer", "email"]);
  const [conditions, setConditions] = useState<Condition[]>([
    { id: "cond-1", column: "revenue", operator: ">", value: "10000", logic: "AND" },
  ]);
  const [history, setHistory] = useState<HistoryItem[]>([
    {
      id: "h1",
      title: "Trim whitespace",
      description: "Applied to text columns",
      status: "completed",
      timestamp: "2 minutes ago",
    },
    {
      id: "h2",
      title: "Fill missing values",
      description: "Customer + Email columns",
      status: "completed",
      timestamp: "8 minutes ago",
    },
  ]);
  const [isLargeDataset, setIsLargeDataset] = useState(true);
  const [progress, setProgress] = useState(12);
  const [isRunning, setIsRunning] = useState(false);

  const dataset: DatasetSummary = {
    id: "sales_q1",
    name: "sales_q1",
    rows: 1280420,
    columns: COLUMN_OPTIONS.map((item) => item.label),
  };

  const beforeRows = useMemo(() => BEFORE_ROWS, []);
  const afterRows = useMemo(() => applyOperations(beforeRows, operations), [beforeRows, operations]);

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setIsRunning(false);
          return 100;
        }
        return prev + 8;
      });
    }, 800);
    return () => clearInterval(timer);
  }, [isRunning]);

  const addOperation = (operation: OperationId) => {
    if (operations.includes(operation)) {
      notify.info("Operation already applied");
      return;
    }
    setOperations((prev) => [...prev, operation]);
    setHistory((prev) => [
      {
        id: `h-${Date.now()}`,
        title: OPERATION_LABELS[operation],
        description: "Added from quick actions",
        status: "queued",
        timestamp: "Just now",
      },
      ...prev,
    ]);
    notify.success(`${OPERATION_LABELS[operation]} queued`);
  };

  const handleAIAction = (action: AIAction) => {
    if (action.type === "apply_all") {
      setOperations([
        "remove_duplicates",
        "fill_missing",
        "trim_whitespace",
        "standardize_case",
        "remove_outliers",
      ]);
      notify.success("All fixes queued");
      return;
    }
    if (action.type === "undo_last") {
      setOperations((prev) => prev.slice(0, -1));
      notify.info("Last transformation removed");
      return;
    }
    notify.info(`AI action: ${action.type}`);
  };

  const addCondition = () => {
    setConditions((prev) => [
      ...prev,
      {
        id: `cond-${Date.now()}`,
        column: "revenue",
        operator: ">",
        value: "0",
        logic: "AND",
      },
    ]);
  };

  const updateCondition = (id: string, patch: Partial<Condition>) => {
    setConditions((prev) => prev.map((cond) => (cond.id === id ? { ...cond, ...patch } : cond)));
  };

  const removeCondition = (id: string) => {
    setConditions((prev) => prev.filter((cond) => cond.id !== id));
  };

  const startJob = () => {
    setProgress(8);
    setIsRunning(true);
    notify.info("Transformation job started");
  };

  return (
    <div className="cleaning-tab">
      <div className="cleaning-hero">
        <div>
          <Title level={2}>Data Cleaning & Transformation</Title>
          <Text type="secondary">
            Build a clean, trusted dataset with AI-powered operations, preview, and audit history.
          </Text>
        </div>
        <Space wrap>
          <Button
            icon={<ThunderboltOutlined />}
            type="primary"
            onClick={() => addOperation("remove_duplicates")}
          >
            Remove duplicates
          </Button>
          <Button onClick={() => addOperation("fill_missing")}>Fill missing</Button>
          <Button onClick={() => addOperation("trim_whitespace")}>Trim whitespace</Button>
          <Button onClick={() => addOperation("standardize_case")}>Standardize case</Button>
          <Button onClick={() => addOperation("remove_outliers")}>Remove outliers</Button>
        </Space>
      </div>

      <div className="cleaning-grid">
        <div className="cleaning-left">
          <Card className="cleaning-card" title="Dataset overview">
            <div className="summary-grid">
              <div>
                <Text type="secondary">Dataset</Text>
                <Title level={4}>{dataset.name}</Title>
              </div>
              <div>
                <Text type="secondary">Rows</Text>
                <Title level={4}>{dataset.rows?.toLocaleString()}</Title>
              </div>
              <div>
                <Text type="secondary">Columns</Text>
                <Title level={4}>{dataset.columns?.length}</Title>
              </div>
            </div>
            <Divider />
            <Text type="secondary">Columns in scope</Text>
            <Select
              mode="multiple"
              value={selectedColumns}
              onChange={setSelectedColumns}
              options={COLUMN_OPTIONS}
              className="cleaning-select"
              placeholder="Select columns"
            />
          </Card>

          <Card className="cleaning-card" title="Filter builder" extra={<FilterOutlined />}>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {conditions.map((condition, index) => (
                <div key={condition.id} className="filter-row">
                  {index > 0 && (
                    <Select
                      value={condition.logic}
                      onChange={(value) => updateCondition(condition.id, { logic: value })}
                      options={[
                        { value: "AND", label: "AND" },
                        { value: "OR", label: "OR" },
                      ]}
                      className="filter-logic"
                    />
                  )}
                  <Select
                    value={condition.column}
                    onChange={(value) => updateCondition(condition.id, { column: value })}
                    options={COLUMN_OPTIONS}
                    className="filter-column"
                  />
                  <Select
                    value={condition.operator}
                    onChange={(value) => updateCondition(condition.id, { operator: value })}
                    options={OPERATORS.map((op) => ({ value: op, label: op }))}
                    className="filter-operator"
                  />
                  <Input
                    value={condition.value}
                    onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
                    placeholder="Value"
                    className="filter-value"
                  />
                  <Button type="text" danger onClick={() => removeCondition(condition.id)}>
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="dashed" onClick={addCondition}>
                Add condition
              </Button>
            </Space>
          </Card>

          <Card className="cleaning-card" title="Execution">
            <div className="execution-row">
              <Switch checked={isLargeDataset} onChange={setIsLargeDataset} />
              <Text type="secondary">Treat as large dataset</Text>
            </div>
            <div className="execution-progress">
              <Progress
                percent={progress}
                status={progress >= 100 ? "success" : "active"}
                showInfo
              />
              <Text type="secondary">
                {isLargeDataset
                  ? "Running in background with sampling preview."
                  : "Executing inline on preview data."}
              </Text>
            </div>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={startJob}
              disabled={isRunning}
            >
              Run transformation
            </Button>
          </Card>
        </div>

        <div className="cleaning-center">
          <Card className="cleaning-card" title="Before / After comparison">
            <div className="comparison-grid">
              <div className="comparison-panel">
                <div className="panel-header">
                  <Text strong>Before</Text>
                  <Tag color="volcano">Raw</Tag>
                </div>
                <Table
                  columns={PREVIEW_COLUMNS}
                  dataSource={beforeRows}
                  size="small"
                  pagination={false}
                  rowKey="id"
                />
              </div>
              <div className="comparison-panel">
                <div className="panel-header">
                  <Text strong>After</Text>
                  <Tag color="green">Cleaned</Tag>
                </div>
                <Table
                  columns={PREVIEW_COLUMNS}
                  dataSource={afterRows}
                  size="small"
                  pagination={false}
                  rowKey="id"
                />
              </div>
            </div>
          </Card>

          <Card className="cleaning-card" title="Applied transformations">
            <Space wrap>
              {operations.length === 0 ? (
                <Tag color="default">No operations applied</Tag>
              ) : (
                operations.map((operation) => (
                  <Tag key={operation} icon={<CheckCircleOutlined />} color="blue">
                    {OPERATION_LABELS[operation]}
                  </Tag>
                ))
              )}
            </Space>
            <Divider />
            <div className="quality-badges">
              <Badge color="#10b981" text="Duplicates removed" />
              <Badge color="#f97316" text="Outliers capped" />
              <Badge color="#0ea5e9" text="Case normalized" />
            </div>
          </Card>
        </div>

        <div className="cleaning-right">
          <Card className="cleaning-card" title="AI Cleaning Assistant">
            <AIChat context="clean" currentDataset={dataset} onAction={handleAIAction} />
          </Card>

          <Card
            className="cleaning-card"
            title="Transformation history"
            extra={<HistoryOutlined />}
          >
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {history.map((item) => (
                <div key={item.id} className="history-item">
                  <div>
                    <Text strong>{item.title}</Text>
                    <Text type="secondary" className="history-desc">
                      {item.description}
                    </Text>
                    <Text type="secondary" className="history-time">
                      {item.timestamp}
                    </Text>
                  </div>
                  <Tag
                    color={
                      item.status === "completed"
                        ? "green"
                        : item.status === "running"
                        ? "gold"
                        : "default"
                    }
                    icon={item.status === "completed" ? <CheckCircleOutlined /> : <WarningOutlined />}
                  >
                    {item.status}
                  </Tag>
                </div>
              ))}
              <Button type="link">View full history</Button>
            </Space>
          </Card>
        </div>
      </div>
    </div>
  );
}
