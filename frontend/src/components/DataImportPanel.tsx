import {
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Divider,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  CloudOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  LoadingOutlined,
  LockOutlined,
  RocketOutlined,
  UploadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import { uploadDataset } from "../api";
import type { DatasetPreview } from "../types";
import { notify } from "../utils/notify";
import { AIChat, type AIAction } from "./ai/AIChat";

const { Text, Title } = Typography;

type ImportSource = "file" | "database" | "api";

type Column = {
  name: string;
  type: "text" | "number" | "date" | "boolean";
  samples: string[];
  nullPercentage: number;
};

type DataIssue = {
  type: "missing_values" | "invalid_format" | "duplicates";
  column?: string;
  count: number;
  suggestion: string;
};

type ImportItem = {
  id: string;
  name: string;
  source: "file" | "database" | "api";
  sourceType: string;
  rows: number;
  size: number;
  importedAt: string;
  status: "success" | "processing" | "failed" | "scheduled";
};

const SOURCES = [
  {
    id: "file",
    title: "File Upload",
    description: "CSV, Excel, JSON, Parquet, TSV",
    formats: ["CSV", "XLSX", "JSON", "Parquet", "TSV"],
    icon: <UploadOutlined className="import-card-icon" />,
    available: true,
  },
  {
    id: "database",
    title: "Connect Database",
    description: "MySQL, PostgreSQL, MongoDB, SQL Server",
    formats: ["Postgres", "MySQL", "MongoDB", "SQL Server"],
    icon: <DatabaseOutlined className="import-card-icon" />,
    available: false,
  },
  {
    id: "api",
    title: "API & Cloud Services",
    description: "REST API, Google Sheets, AWS S3, Salesforce",
    formats: ["REST", "Sheets", "S3", "Salesforce"],
    icon: <CloudOutlined className="import-card-icon" />,
    available: true,
  },
] as const;

const SAMPLE_SCHEMA: Column[] = [
  { name: "order_id", type: "text", samples: ["A-100", "A-101", "A-102"], nullPercentage: 0 },
  { name: "email", type: "text", samples: ["sam@acme.com", "—", "pat@acme.com"], nullPercentage: 12 },
  { name: "order_date", type: "date", samples: ["2025-01-01", "01/02/2025", "2025-01-03"], nullPercentage: 3 },
  { name: "total", type: "number", samples: ["120", "86", "230"], nullPercentage: 0 },
];

const SAMPLE_ISSUES: DataIssue[] = [
  {
    type: "missing_values",
    column: "email",
    count: 23,
    suggestion: "Fill with 'unknown' or request missing values",
  },
  {
    type: "invalid_format",
    column: "order_date",
    count: 12,
    suggestion: "Normalize to YYYY-MM-DD",
  },
  {
    type: "duplicates",
    count: 5,
    suggestion: "Remove duplicate rows",
  },
];

const RECENT_IMPORTS: ImportItem[] = [
  {
    id: "imp-1",
    name: "sales_q4",
    source: "file",
    sourceType: "CSV",
    rows: 15432,
    size: 2.3,
    importedAt: "2 hours ago",
    status: "success",
  },
  {
    id: "imp-2",
    name: "orders_db",
    source: "database",
    sourceType: "PostgreSQL",
    rows: 45000,
    size: 18.2,
    importedAt: "Yesterday",
    status: "processing",
  },
  {
    id: "imp-3",
    name: "stripe_customers",
    source: "api",
    sourceType: "Stripe",
    rows: 9800,
    size: 4.6,
    importedAt: "3 days ago",
    status: "scheduled",
  },
];

export function DataImportPanel() {
  const [importSource, setImportSource] = useState<ImportSource>("file");
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<DatasetPreview | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [progressPercent, setProgressPercent] = useState(34);
  const [progressStep, setProgressStep] = useState(1);
  const [recentImports, setRecentImports] = useState<ImportItem[]>(RECENT_IMPORTS);

  const aiSuggestions = [
    "Import a CSV file",
    "Connect to PostgreSQL database",
    "Import from Google Sheets",
    "Schedule daily import from Stripe",
  ];

  const fileType = uploadedFile?.name.split(".").pop()?.toUpperCase() || "CSV";

  const schemaTable = useMemo(() => {
    if (!importPreview) {
      return SAMPLE_SCHEMA.map((col) => ({
        key: col.name,
        ...col,
      }));
    }

    const sampleRows = importPreview.sample_rows;
    const sampleCount = sampleRows.length || 1;

    const inferType = (values: Array<unknown>): Column["type"] => {
      const nonNull = values.filter((value) => value !== null && value !== undefined);
      if (!nonNull.length) return "text";
      if (nonNull.every((value) => typeof value === "boolean")) return "boolean";
      if (nonNull.every((value) => typeof value === "number")) return "number";
      if (nonNull.every((value) => typeof value === "string" && !Number.isNaN(Date.parse(value)))) return "date";
      return "text";
    };

    return importPreview.columns.map((name) => {
      const values = sampleRows.map((row) => row[name]);
      const samples = values
        .filter((value) => value !== null && value !== undefined)
        .slice(0, 3)
        .map((value) => String(value));
      const nulls = values.filter((value) => value === null || value === undefined).length;
      const nullPercentage = Math.round((nulls / sampleCount) * 100);

      return {
        key: name,
        name,
        type: inferType(values),
        samples: samples.length ? samples : ["-"],
        nullPercentage,
      };
    });
  }, [importPreview]);

  const handleFileSelect = (file: File) => {
    setUploadedFile(file);
    setImportPreview(null);
  };

  const handleImport = async () => {
    if (!uploadedFile) {
      notify.info("Upload a file to start import");
      return;
    }
    setShowProgress(true);
    setProgressPercent(15);
    setProgressStep(0);

    try {
      const preview = await uploadDataset(uploadedFile);
      setImportPreview(preview);
      setProgressPercent(100);
      setProgressStep(4);
      setRecentImports((prev) => [
        {
          id: preview.dataset_id,
          name: uploadedFile.name.replace(/\.[^/.]+$/, ""),
          source: "file",
          sourceType: fileType,
          rows: preview.row_count,
          size: Number((uploadedFile.size / 1024 / 1024).toFixed(2)),
          importedAt: new Date().toLocaleString(),
          status: "success",
        },
        ...prev,
      ]);
      notify.success("Dataset imported successfully");
      window.setTimeout(() => setShowProgress(false), 800);
    } catch (error) {
      notify.error("Import failed");
      setProgressPercent(0);
      setProgressStep(0);
      setShowProgress(false);
    }
  };

  const handleAIAction = (action: AIAction) => {
    switch (action.type) {
      case "show_upload_ui":
        setImportSource("file");
        notify.info("File upload ready");
        break;
      case "connect_database":
        setImportSource("database");
        notify.info("Database connector opened");
        break;
      case "connect_api":
        setImportSource("api");
        notify.info("API connector opened");
        break;
      case "start_import":
        if (!uploadedFile) {
          notify.info("Upload a file to start import");
          break;
        }
        handleImport();
        break;
      case "reset_upload":
        setUploadedFile(null);
        break;
      default:
        notify.info(`AI action: ${action.type}`);
    }
  };

  return (
    <div className="ai-stack-layout">
      <div className="import-root ai-stack-main">
        <div className="import-header">
          <div>
            <Title level={2}>Import Your Data</Title>
            <Text type="secondary">
              Choose your data source and let AI guide you through the import process
            </Text>
          </div>
          <Card className="import-stat-card">
            <Text type="secondary">Datasets used</Text>
            <Title level={4}>3 / 5</Title>
            <Progress percent={60} size="small" />
          </Card>
        </div>

        <div className="import-source-grid">
          {SOURCES.map((source) => (
            <Card
              key={source.id}
              className={`import-source-card ${importSource === source.id ? "active" : ""}`}
              onClick={() => {
                if (!source.available) return;
                setImportSource(source.id as ImportSource);
              }}
            >
              <div className="import-card-header">
                {source.icon}
                <div>
                  <Text strong>{source.title}</Text>
                  <Text type="secondary">{source.description}</Text>
                </div>
              </div>
              <div className="import-badges">
                {source.formats.map((format) => (
                  <Tag key={format}>{format}</Tag>
                ))}
                {!source.available && (
                  <Tag color="orange" icon={<LockOutlined />}>
                    Pro required
                  </Tag>
                )}
              </div>
            </Card>
          ))}
        </div>

        <div className="import-dynamic">
          {importSource === "file" && (
            <div className="import-file">
              {!uploadedFile ? (
                <div
                  className={`drop-zone ${dragActive ? "active" : ""}`}
                  onDragEnter={() => setDragActive(true)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const file = event.dataTransfer.files?.[0];
                    if (file) handleFileSelect(file);
                    setDragActive(false);
                  }}
                >
                  <UploadOutlined className="drop-icon" />
                  <Title level={4}>Drag and drop your file here</Title>
                  <Text type="secondary">or click to browse</Text>
                  <Text type="secondary">Supports: CSV, Excel (.xlsx, .xls), JSON, Parquet, TSV</Text>
                  <Text type="secondary">Maximum file size: 100MB (Free) / Unlimited (Pro+)</Text>
                  <input
                    type="file"
                    className="hidden-input"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />
                </div>
              ) : (
                <Card className="file-info-card">
                  <div className="file-info-header">
                    <CheckCircleOutlined className="success-icon" />
                    <div>
                      <Text strong>{uploadedFile.name}</Text>
                      <Text type="secondary">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB · {fileType}</Text>
                    </div>
                  </div>
                  <Divider />
                  <Title level={5}>Schema Preview</Title>
                  <Table
                    dataSource={schemaTable}
                    pagination={false}
                    size="small"
                    columns={[
                      { title: "Column", dataIndex: "name" },
                      {
                        title: "Detected Type",
                        dataIndex: "type",
                        render: (value) => (
                          <Select
                            defaultValue={value}
                            options={["text", "number", "date", "boolean"].map((type) => ({ label: type, value: type }))}
                          />
                        ),
                      },
                      { title: "Sample", dataIndex: "samples", render: (values) => values.join(", ") },
                      {
                        title: "Null %",
                        dataIndex: "nullPercentage",
                        render: (value) => (
                          <Tag color={value === 0 ? "green" : value <= 10 ? "gold" : "red"}>{value}%</Tag>
                        ),
                      },
                    ]}
                  />
                  <Collapse
                    items={[
                      {
                        key: "settings",
                        label: "Import settings",
                        children: (
                          <div className="import-settings">
                            <Checkbox defaultChecked>First row contains headers</Checkbox>
                            <Checkbox defaultChecked>Auto-detect data types</Checkbox>
                            <Select
                              defaultValue="Comma"
                              options={["Comma", "Tab", "Semicolon", "Pipe", "Custom"].map((item) => ({
                                label: item,
                                value: item,
                              }))}
                            />
                            <Select
                              defaultValue="UTF-8"
                              options={["UTF-8", "ISO-8859-1"].map((item) => ({ label: item, value: item }))}
                            />
                            <Input placeholder="Date format (e.g. YYYY-MM-DD)" />
                            <InputNumber min={0} defaultValue={0} />
                          </div>
                        ),
                      },
                    ]}
                  />
                  <Divider />
                  <Title level={5}>AI Analysis</Title>
                  <div className="ai-issues">
                    {(importPreview ? [] : SAMPLE_ISSUES).map((issue) => (
                      <Card key={issue.suggestion} className="issue-card">
                        <Space>
                          <WarningOutlined />
                          <div>
                            <Text strong>{issue.count} issue(s){issue.column ? ` in '${issue.column}'` : ""}</Text>
                            <Text type="secondary">{issue.suggestion}</Text>
                          </div>
                        </Space>
                        <Space>
                          <Button size="small">Fix Now</Button>
                          <Button size="small" type="text">Ignore</Button>
                        </Space>
                      </Card>
                    ))}
                  </div>
                  <div className="import-actions">
                    <Button onClick={() => setUploadedFile(null)}>Cancel</Button>
                    <Button type="primary" icon={<RocketOutlined />} onClick={handleImport}>
                      Import Dataset
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          )}

          {importSource === "database" && (
            <Card className="import-placeholder">
              <Title level={4}>Database connections require Pro</Title>
              <Text type="secondary">Upgrade to connect PostgreSQL, MySQL, Snowflake, and more.</Text>
              <Button type="primary" icon={<LockOutlined />}>Upgrade Plan</Button>
            </Card>
          )}

          {importSource === "api" && (
            <Card className="import-placeholder">
              <Title level={4}>API & Cloud Services</Title>
              <Text type="secondary">Connect Google Sheets, AWS S3, Salesforce, and more.</Text>
              <Button type="primary">Connect Service</Button>
            </Card>
          )}
        </div>

        <Card className="recent-imports" title="Recent Imports">
          <Table
            dataSource={recentImports}
            pagination={{ pageSize: 5 }}
            columns={[
              { title: "Dataset", dataIndex: "name" },
              { title: "Source", dataIndex: "sourceType" },
              { title: "Rows", dataIndex: "rows", render: (value) => value.toLocaleString() },
              { title: "Size", dataIndex: "size", render: (value) => `${value.toFixed(1)} MB` },
              { title: "Imported", dataIndex: "importedAt" },
              {
                title: "Status",
                dataIndex: "status",
                render: (value) => (
                  <Tag
                    color={value === "success" ? "green" : value === "processing" ? "blue" : value === "failed" ? "red" : "orange"}
                    icon={value === "processing" ? <LoadingOutlined /> : undefined}
                  >
                    {value}
                  </Tag>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <AIChat context="import" onAction={handleAIAction} suggestions={aiSuggestions} />

      <Modal
        open={showProgress}
        onCancel={() => setShowProgress(false)}
        footer={null}
        centered
  className="import-progress-modal"
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Title level={4}>Importing your data...</Title>
          <Steps
            current={progressStep}
            items={[
              { title: "Uploading file" },
              { title: "Analyzing structure" },
              { title: "Detecting data types" },
              { title: "Validating data" },
              { title: "Creating dataset" },
            ]}
          />
          <Progress percent={progressPercent} />
          <Text type="secondary">
            {importPreview ? `${importPreview.row_count.toLocaleString()} rows processed` : "Processing rows..."}
          </Text>
          <Button onClick={() => setShowProgress(false)}>Cancel Import</Button>
        </Space>
      </Modal>
    </div>
  );
}
