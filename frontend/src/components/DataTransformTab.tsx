import { useState } from "react";
import {
  Button,
  Card,
  Divider,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  FilterOutlined,
  PlusOutlined,
  PlayCircleOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
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

type Row = {
  id: string;
  customer: string | null;
  email: string | null;
  country: string | null;
  revenue: number | null;
  order_date: string;
  status: string;
};

const SAMPLE_DATASET = {
  name: "customers_2025.csv",
  rows: 34567,
  columns: 12,
  size: "4.2 MB",
  status: "ready" as const,
};

const SAMPLE_ROWS: Row[] = [
  {
    id: "1",
    customer: "ACME Co",
    email: "sales@acme.com",
    country: "USA",
    revenue: 12500,
    order_date: "2025-01-15",
    status: "Active",
  },
  {
    id: "2",
    customer: "Northwind",
    email: "hello@northwind.io",
    country: "Canada",
    revenue: 8200,
    order_date: "2025-01-16",
    status: "Active",
  },
  {
    id: "3",
    customer: "Contoso",
    email: "info@contoso.com",
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
    revenue: 25000,
    order_date: "2025-01-18",
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

const OPERATORS = [
  { value: ">", label: ">" },
  { value: ">=", label: ">=" },
  { value: "=", label: "=" },
  { value: "<=", label: "<=" },
  { value: "<", label: "<" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
];

const PREVIEW_COLUMNS = [
  { title: "Customer", dataIndex: "customer", key: "customer" },
  { title: "Email", dataIndex: "email", key: "email" },
  { title: "Country", dataIndex: "country", key: "country" },
  { title: "Revenue", dataIndex: "revenue", key: "revenue" },
  { title: "Order date", dataIndex: "order_date", key: "order_date" },
  { title: "Status", dataIndex: "status", key: "status" },
];

const TRANSFORMATIONS = [
  { id: "aggregate", label: "Aggregate", description: "Group by and calculate aggregates" },
  { id: "join", label: "Join", description: "Merge with another dataset" },
  { id: "pivot", label: "Pivot", description: "Reshape data from rows to columns" },
  { id: "unpivot", label: "Unpivot", description: "Reshape data from columns to rows" },
  { id: "split", label: "Split Column", description: "Split a column into multiple columns" },
  { id: "merge", label: "Merge Columns", description: "Combine multiple columns into one" },
  { id: "calculate", label: "Calculate", description: "Add calculated column with formula" },
  { id: "filter", label: "Filter Rows", description: "Keep only rows matching conditions" },
];

export function DataTransformTab() {
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [selectedTransform, setSelectedTransform] = useState<string | null>(null);
  const [filteredRows, setFilteredRows] = useState<Row[]>(SAMPLE_ROWS);

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

  const applyFilters = () => {
    if (conditions.length === 0) {
      setFilteredRows(SAMPLE_ROWS);
      notify.info("No filters to apply");
      return;
    }

    // Simple filter implementation for demo
    const filtered = SAMPLE_ROWS.filter((row) => {
      return conditions.every((cond) => {
        const value = row[cond.column as keyof Row];
        const condValue = cond.value;

        if (cond.operator === ">") {
          return Number(value) > Number(condValue);
        }
        if (cond.operator === ">=") {
          return Number(value) >= Number(condValue);
        }
        if (cond.operator === "=") {
          return String(value) === condValue;
        }
        if (cond.operator === "<=") {
          return Number(value) <= Number(condValue);
        }
        if (cond.operator === "<") {
          return Number(value) < Number(condValue);
        }
        if (cond.operator === "contains") {
          return String(value).toLowerCase().includes(condValue.toLowerCase());
        }
        return true;
      });
    });

    setFilteredRows(filtered);
    notify.success(`Filter applied: ${filtered.length} rows match`);
  };

  return (
    <div className="cleaning-tab">
      <div className="cleaning-hero">
        <div>
          <Title level={2}>Data Transformation</Title>
          <Text type="secondary">
            Transform your data with filters, aggregations, joins, pivots, and calculated columns.
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          size="large"
          onClick={applyFilters}
        >
          Apply Transformation
        </Button>
      </div>

      <div className="cleaning-grid">
        <div className="cleaning-left">
          <Card className="cleaning-card" title="Dataset overview">
            <div className="summary-grid">
              <div>
                <Text type="secondary">Dataset</Text>
                <Title level={4}>{SAMPLE_DATASET.name}</Title>
              </div>
              <div>
                <Text type="secondary">Rows</Text>
                <Title level={4}>{SAMPLE_DATASET.rows.toLocaleString()}</Title>
              </div>
              <div>
                <Text type="secondary">Columns</Text>
                <Title level={4}>{SAMPLE_DATASET.columns}</Title>
              </div>
              <div>
                <Text type="secondary">Size</Text>
                <Title level={4}>{SAMPLE_DATASET.size}</Title>
              </div>
            </div>
          </Card>

          <Card
            className="cleaning-card"
            title={
              <Space>
                <FilterOutlined />
                <span>Filter Builder</span>
              </Space>
            }
            extra={
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addCondition}>
                Add condition
              </Button>
            }
          >
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {conditions.length === 0 ? (
                <Text type="secondary">No filter conditions. Click "Add condition" to start.</Text>
              ) : (
                conditions.map((cond, idx) => (
                  <div key={cond.id}>
                    {idx > 0 && (
                      <Select
                        value={cond.logic}
                        onChange={(val) => updateCondition(cond.id, { logic: val })}
                        style={{ width: 80, marginBottom: 8 }}
                        options={[
                          { value: "AND", label: "AND" },
                          { value: "OR", label: "OR" },
                        ]}
                      />
                    )}
                    <Space.Compact style={{ width: "100%" }}>
                      <Select
                        value={cond.column}
                        onChange={(val) => updateCondition(cond.id, { column: val })}
                        style={{ flex: 1 }}
                        options={COLUMN_OPTIONS}
                      />
                      <Select
                        value={cond.operator}
                        onChange={(val) => updateCondition(cond.id, { operator: val })}
                        style={{ width: 120 }}
                        options={OPERATORS}
                      />
                      <Input
                        value={cond.value}
                        onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                        placeholder="Value"
                        style={{ flex: 1 }}
                      />
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeCondition(cond.id)}
                      />
                    </Space.Compact>
                  </div>
                ))
              )}
            </Space>
          </Card>

          <Card className="cleaning-card" title="Transformation Preview">
            <Space direction="vertical" size="small" style={{ width: "100%", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Text strong>Original: {SAMPLE_ROWS.length} rows</Text>
                <Text strong type={filteredRows.length < SAMPLE_ROWS.length ? "warning" : "success"}>
                  Transformed: {filteredRows.length} rows
                </Text>
              </div>
            </Space>
            <Table
              columns={PREVIEW_COLUMNS}
              dataSource={filteredRows}
              size="small"
              pagination={{ pageSize: 5 }}
              rowKey="id"
            />
          </Card>
        </div>

        <div className="cleaning-right">
          <Card className="cleaning-card" title="Available Transformations">
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {TRANSFORMATIONS.map((transform) => (
                <Card
                  key={transform.id}
                  size="small"
                  hoverable
                  onClick={() => {
                    setSelectedTransform(transform.id);
                    notify.info(`${transform.label} selected - configuration coming soon!`);
                  }}
                  className={selectedTransform === transform.id ? "selected-transform" : ""}
                >
                  <Space direction="vertical" size={0}>
                    <Text strong>{transform.label}</Text>
                    <Text type="secondary" style={{ fontSize: "12px" }}>
                      {transform.description}
                    </Text>
                  </Space>
                </Card>
              ))}
            </Space>
          </Card>

          <Card className="cleaning-card" title="Quick Transformations">
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              <Button
                block
                icon={<ThunderboltOutlined />}
                onClick={() => {
                  addCondition();
                  notify.success("Filter condition added");
                }}
              >
                Add Quick Filter
              </Button>
              <Button
                block
                onClick={() => {
                  setConditions([]);
                  setFilteredRows(SAMPLE_ROWS);
                  notify.info("Filters cleared");
                }}
              >
                Clear All Filters
              </Button>
              <Divider style={{ margin: "8px 0" }} />
              <Text type="secondary" style={{ fontSize: "12px" }}>
                Advanced transformations like joins, pivots, and aggregations will be available in the cards above.
              </Text>
            </Space>
          </Card>
        </div>
      </div>
    </div>
  );
}
