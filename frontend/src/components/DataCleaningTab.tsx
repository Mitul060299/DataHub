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

  const startJob = () => {
    setProgress(8);
    setIsRunning(true);
    notify.info("Cleaning job started");
  };

  return (
    <div className="data-cleaning-layout">
      <div className="cleaning-chat-panel">
        <div className="cleaning-chat-section">
          {/* AI Chat */}
          <Card className="cleaning-card-v2" title="AI Cleaning Assistant" style={{ flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
              <AIChat context="clean" currentDataset={dataset} onAction={handleAIAction} />
              <Divider style={{ margin: "8px 0" }} />
              <Space direction="vertical" style={{ width: "100%" }}>
                <Text type="secondary" strong>
                  Quick Actions
                </Text>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Button
                    block
                    onClick={() => addOperation("remove_duplicates")}
                    icon={<ThunderboltOutlined />}
                  >
                    Remove Duplicates
                  </Button>
                  <Button block onClick={() => addOperation("fill_missing")}>
                    Fill Missing Values
                  </Button>
                  <Button block onClick={() => addOperation("trim_whitespace")}>
                    Trim Whitespace
                  </Button>
                  <Button block onClick={() => addOperation("standardize_case")}>
                    Standardize Case
                  </Button>
                </Space>
              </Space>
            </div>
          </Card>

          {/* Data Quality Issues */}
          <Card className="cleaning-card-v2" title="Quality Issues" style={{ marginTop: 12 }}>
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              <div>
                <Space size="small">
                  <Tag color="error">245</Tag>
                  <Text type="secondary">Duplicates</Text>
                </Space>
              </div>
              <div>
                <Space size="small">
                  <Tag color="warning">1,523</Tag>
                  <Text type="secondary">Missing</Text>
                </Space>
              </div>
              <div>
                <Space size="small">
                  <Tag color="orange">87</Tag>
                  <Text type="secondary">Outliers</Text>
                </Space>
              </div>
              <div>
                <Space size="small">
                  <Tag color="blue">312</Tag>
                  <Text type="secondary">Whitespace</Text>
                </Space>
              </div>
            </Space>
          </Card>
        </div>
      </div>

      <div className="cleaning-preview-panel">
        <div className="cleaning-preview-inner">
          {/* Header */}
          <div className="cleaning-header-v2">
            <div>
              <Title level={2} style={{ margin: 0 }}>
                Data Cleaning
              </Title>
              <Text type="secondary">
                Clean your data with AI-powered operations and preview changes instantly.
              </Text>
            </div>
          </div>

          {/* Left: Dataset Preview + Info */}
          <div className="cleaning-preview-section">
            {/* Table Selector */}
            <Card className="cleaning-card-v2" style={{ marginBottom: 12 }}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Text type="secondary" strong>
                  Select Table
                </Text>
                <Select
                  placeholder="Choose a table"
                  defaultValue="sales_q1"
                  options={[
                    { value: "sales_q1", label: "Sales Q1 2025" },
                    { value: "customers", label: "Customers" },
                    { value: "orders", label: "Orders" },
                  ]}
                  style={{ width: "100%" }}
                />
              </Space>
            </Card>

            {/* Dataset Preview */}
            <Card className="cleaning-card-v2" title="Dataset Preview" style={{ flex: 1 }}>
              <div className="dataset-preview-table">
                <Table
                  columns={PREVIEW_COLUMNS}
                  dataSource={beforeRows}
                  size="small"
                  pagination={{ pageSize: 8 }}
                  rowKey="id"
                  scroll={{ x: 600 }}
                />
              </div>
            </Card>

            {/* Dataset Info */}
            <Card className="cleaning-card-v2" title="Dataset Information" style={{ marginTop: 12 }}>
              <div className="dataset-info-grid">
                <div className="info-item">
                  <Text type="secondary">Rows</Text>
                  <Title level={4}>{dataset.rows?.toLocaleString()}</Title>
                </div>
                <div className="info-item">
                  <Text type="secondary">Columns</Text>
                  <Title level={4}>{dataset.columns?.length}</Title>
                </div>
                <div className="info-item">
                  <Text type="secondary">Size</Text>
                  <Title level={4}>4.2 MB</Title>
                </div>
              </div>
              <Divider style={{ margin: "12px 0" }} />
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" strong>
                  Quality Score
                </Text>
                <Progress
                  percent={72}
                  status="normal"
                  style={{ marginTop: 8 }}
                  strokeColor="#22c55e"
                />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
