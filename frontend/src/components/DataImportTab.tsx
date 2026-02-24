import { useEffect, useState } from "react";
import type { JSX } from "react";
import {
  Card,
  Upload,
  Button,
  Progress,
  Alert,
  Space,
  Typography,
  Form,
  Input,
  Table,
  Tag,
  Divider,
  List,
  message,
  Modal,
  InputNumber,
  Switch,
  Tooltip,
  Row,
  Col,
} from "antd";
import {
  InboxOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  AmazonOutlined,
  GoogleOutlined,
  WindowsOutlined,
  ApiOutlined,
  TableOutlined,
  EyeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ReloadOutlined,
  LockOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  CloudServerOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { getAuthToken } from "../utils/auth";
import { formatFileSize, useUser } from "../contexts/UserContext";

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "uploading" | "processing" | "completed" | "error";
  progress: number;
  tableName?: string;
  datasetId?: string;
  tableCount?: number;
  rowCount?: number;
  uploadedAt: Date;
  error?: string;
}

interface DatabaseConnection {
  id: string;
  name: string;
  type: string;
  host: string;
  database: string;
  status: "connected" | "disconnected" | "error";
  tableCount?: number;
  lastSync?: Date;
}

interface TableInfo {
  name: string;
  datasetId: string;
  rowCount: number;
  columnCount: number;
  size: string;
  lastUpdated: string;
}

interface ImportSelection {
  datasetId: string;
  tableName: string;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Enhanced data source configuration with categories and descriptions
const dataSourceOptions: Array<{
  value: string;
  label: string;
  icon: JSX.Element;
  category: "files" | "databases" | "storage" | "warehouses";
  requiredFeature: "databaseConnections" | "cloudStorage" | "enterpriseConnectors" | null;
  description: string;
}> = [
  // Files - Always available
  { 
    value: "csv", 
    label: "CSV/Excel", 
    icon: <FileTextOutlined />, 
    category: "files",
    requiredFeature: null,
    description: "Upload CSV, Excel, TSV files" 
  },
  { 
    value: "json", 
    label: "JSON/Parquet", 
    icon: <FileExcelOutlined />, 
    category: "files",
    requiredFeature: null,
    description: "Upload JSON, Parquet files" 
  },
  
  // Databases - Professional+
  { 
    value: "postgresql", 
    label: "PostgreSQL", 
    icon: <DatabaseOutlined />, 
    category: "databases",
    requiredFeature: "databaseConnections",
    description: "Connect to PostgreSQL database" 
  },
  { 
    value: "mysql", 
    label: "MySQL", 
    icon: <DatabaseOutlined />, 
    category: "databases",
    requiredFeature: "databaseConnections",
    description: "Connect to MySQL database" 
  },
  { 
    value: "mssql", 
    label: "SQL Server", 
    icon: <WindowsOutlined />, 
    category: "databases",
    requiredFeature: "databaseConnections",
    description: "Connect to Microsoft SQL Server" 
  },
  { 
    value: "mongodb", 
    label: "MongoDB", 
    icon: <DatabaseOutlined />, 
    category: "databases",
    requiredFeature: "databaseConnections",
    description: "Connect to MongoDB database" 
  },
  
  // Cloud Storage - Professional+
  { 
    value: "s3", 
    label: "Amazon S3", 
    icon: <AmazonOutlined />, 
    category: "storage",
    requiredFeature: "cloudStorage",
    description: "Connect to Amazon S3 bucket" 
  },
  { 
    value: "gcs", 
    label: "Google Cloud Storage", 
    icon: <GoogleOutlined />, 
    category: "storage",
    requiredFeature: "cloudStorage",
    description: "Connect to GCS bucket" 
  },
  { 
    value: "azure-blob", 
    label: "Azure Blob", 
    icon: <WindowsOutlined />, 
    category: "storage",
    requiredFeature: "cloudStorage",
    description: "Connect to Azure Blob Storage" 
  },
  
  // Cloud Warehouses - Team+
  { 
    value: "snowflake", 
    label: "Snowflake", 
    icon: <CloudServerOutlined />, 
    category: "warehouses",
    requiredFeature: "enterpriseConnectors",
    description: "Connect to Snowflake data warehouse" 
  },
  { 
    value: "bigquery", 
    label: "BigQuery", 
    icon: <GoogleOutlined />, 
    category: "warehouses",
    requiredFeature: "enterpriseConnectors",
    description: "Connect to Google BigQuery" 
  },
  { 
    value: "redshift", 
    label: "Redshift", 
    icon: <AmazonOutlined />, 
    category: "warehouses",
    requiredFeature: "enterpriseConnectors",
    description: "Connect to Amazon Redshift" 
  },
  { 
    value: "azure-sql", 
    label: "Azure Synapse", 
    icon: <WindowsOutlined />, 
    category: "warehouses",
    requiredFeature: "enterpriseConnectors",
    description: "Connect to Azure Synapse Analytics" 
  },
];

export const DataImportTab = ({ onImportComplete }: { onImportComplete?: (selection: ImportSelection) => void }) => {
  const { plan, limits, usage, workspaceId } = useUser();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [databases, setDatabases] = useState<DatabaseConnection[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);
  const [tableColumns, setTableColumns] = useState<
    { title: string; dataIndex: string; key: string; ellipsis: boolean }[]
  >([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [selectedDatabaseType, setSelectedDatabaseType] = useState<string>("");

  const maxFileSize = limits.maxFileSize;
  const maxFileSizeLabel = maxFileSize < 0 ? "Unlimited" : formatFileSize(maxFileSize);
  const allowedExtensions = limits.features.allFileFormats
    ? [".csv", ".xlsx", ".xls", ".json", ".parquet", ".tsv", ".txt"]
    : [".csv", ".xlsx", ".xls"];
  
  // Check if a data source is available for the user's plan
  const isDataSourceAvailable = (source: typeof dataSourceOptions[0]) => {
    if (!source.requiredFeature) return true;
    if (source.requiredFeature === "databaseConnections") return limits.features.databaseConnections;
    if (source.requiredFeature === "cloudStorage") return limits.features.cloudStorage;
    if (source.requiredFeature === "enterpriseConnectors") return limits.features.enterpriseConnectors;
    return false;
  };

  const getUpgradeMessage = (source: typeof dataSourceOptions[0]) => {
    if (source.requiredFeature === "databaseConnections") {
      return "Upgrade to Professional ($79/mo) to unlock database connections";
    }
    if (source.requiredFeature === "cloudStorage") {
      return "Upgrade to Professional ($79/mo) to unlock cloud storage";
    }
    if (source.requiredFeature === "enterpriseConnectors") {
      return "Upgrade to Team ($149/mo) to unlock cloud warehouses";
    }
    return "";
  };

  const handleDataSourceClick = (source: typeof dataSourceOptions[0]) => {
    if (!isDataSourceAvailable(source)) {
      message.warning(getUpgradeMessage(source));
      return;
    }

    // If it's a file source, the Dragger component handles the upload
    if (source.category === "files") {
      return;
    }

    // Otherwise, it's a connector - open connection modal
    setSelectedDatabaseType(source.value);
    setShowConnectionModal(true);
  };

  const fetchTables = async () => {
    try {
      const response = await api.get("/import/tables", {
        headers: { "X-Workspace-Id": workspaceId },
      });
      setTables(response.data.tables || []);
    } catch (error) {
      console.error("Failed to fetch tables:", error);
    }
  };

  const handleFileUpload = async (file: File) => {
    const extension = `.${file.name.split(".").pop() || ""}`.toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      message.error(`File type ${extension} is not supported for the ${plan} plan.`);
      return false;
    }

    if (maxFileSize >= 0 && file.size > maxFileSize) {
      const upgradeTarget = plan === "Free"
        ? "Professional"
        : plan === "Professional"
          ? "Team"
          : "Business";
      message.error(
        `File size exceeds ${plan} plan limit of ${formatFileSize(maxFileSize)}. ` +
          `Please upgrade to ${upgradeTarget} for larger files.`
      );
      return false;
    }

    if (limits.maxDatasets !== -1 && usage.datasetsUsed >= limits.maxDatasets) {
      message.error(
        `You have reached the ${plan} plan limit of ${limits.maxDatasets} datasets. ` +
          "Please upgrade to add more datasets."
      );
      return false;
    }

    const fileId = `file-${Date.now()}`;
    const newFile: UploadedFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      status: "uploading",
      progress: 0,
      uploadedAt: new Date(),
    };

    setUploadedFiles((prev) => [...prev, newFile]);
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await api.post("/import/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          "X-Plan": plan,
          "X-Workspace-Id": workspaceId,
        },
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || 1;
          const progress = Math.round((progressEvent.loaded * 100) / total);
          setUploadedFiles((prev) =>
            prev.map((entry) => (entry.id === fileId ? { ...entry, progress } : entry))
          );
        },
      });

      setUploadedFiles((prev) =>
        prev.map((entry) =>
          entry.id === fileId
            ? {
                ...entry,
                status: "completed",
                progress: 100,
                tableName: response.data.tableName,
                datasetId: response.data.datasetId,
                tableCount: response.data.tableCount,
                rowCount: response.data.rowCount,
              }
            : entry
        )
      );

      fetchTables();
      message.success(`${file.name} uploaded successfully!`);
      
      // Call the callback if provided
      if (onImportComplete && response.data.tableName && response.data.datasetId) {
        onImportComplete({
          datasetId: response.data.datasetId,
          tableName: response.data.tableName,
        });
      }
    } catch (error: any) {
      // Log full error for debugging
      console.error("Upload error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.response?.data?.message,
        detail: error.response?.data?.detail,
        fullError: error,
      });

      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        "Upload failed";

      setUploadedFiles((prev) =>
        prev.map((entry) =>
          entry.id === fileId
            ? {
                ...entry,
                status: "error",
                error: errorMessage,
              }
            : entry
        )
      );

      message.error(`Failed to upload ${file.name}: ${errorMessage}`);
    } finally {
      setIsUploading(false);
    }

    return false;
  };

  const handleDatabaseConnect = async (values: Record<string, unknown>) => {
    try {
      const response = await api.post(
        "/import/connect",
        {
          type: selectedDatabaseType,
          ...values,
        },
        {
          headers: { "X-Workspace-Id": workspaceId },
        }
      );

      const newConnection: DatabaseConnection = {
        id: response.data.connectionId,
        name: (values.name as string) || (values.database as string) || "Connection",
        type: selectedDatabaseType,
        host: (values.host as string) || "",
        database: (values.database as string) || "",
        status: "connected",
        tableCount: response.data.tableCount,
        lastSync: new Date(),
      };

      setDatabases((prev) => [...prev, newConnection]);
      setShowConnectionModal(false);
      message.success("Database connected successfully!");
      fetchTables();
    } catch (error: any) {
      message.error(error.response?.data?.message || "Connection failed");
    }
  };

  const handleTablePreview = async (tableName: string) => {
    setSelectedTable(tableName);
    try {
      const response = await api.get(`/import/tables/${encodeURIComponent(tableName)}/preview`, {
        headers: { "X-Workspace-Id": workspaceId },
      });
      const rows = response.data.rows || [];
      const columns = response.data.columns || [];

      setTableData(
        rows.map((row: Record<string, unknown>, index: number) => ({
          key: `${tableName}-${index}`,
          ...row,
        }))
      );
      setTableColumns(
        columns.map((col: { name: string }) => ({
          title: col.name,
          dataIndex: col.name,
          key: col.name,
          ellipsis: true,
        }))
      );
    } catch (error) {
      message.error("Failed to load table preview");
    }
  };

  const handleDeleteTable = async (tableName: string) => {
    try {
      await api.delete(`/import/tables/${encodeURIComponent(tableName)}`, {
        headers: { "X-Workspace-Id": workspaceId },
      });
      message.success("Table deleted successfully");
      fetchTables();
      if (selectedTable === tableName) {
        setSelectedTable(null);
        setTableData([]);
        setTableColumns([]);
      }
    } catch (error) {
      message.error("Failed to delete table");
    }
  };

  const handleExportTable = async (tableName: string) => {
    try {
      const response = await api.post(`/import/tables/${encodeURIComponent(tableName)}/export`, null, {
        responseType: "blob",
        headers: { "X-Workspace-Id": workspaceId },
      });
      const blob = new Blob([response.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${tableName}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error("Failed to export table");
    }
  };

  const handleUseInWorkspace = (table: TableInfo) => {
    if (!onImportComplete) {
      return;
    }
    onImportComplete({ datasetId: table.datasetId, tableName: table.name });
    message.success(`Selected ${table.name} for workspace`);
  };

  useEffect(() => {
    fetchTables();
  }, [workspaceId]);

  return (
    <div className="data-import-container" style={{ padding: "24px", height: "100%", overflowY: "auto" }}>
      {/* Usage Stats Banner */}
      <Alert
        message={
          <Space direction="vertical" size={4}>
            <Text strong>{plan} Plan</Text>
            <Space split={<Divider type="vertical" />} wrap>
              <Text type="secondary">
                Datasets: {usage.datasetsUsed}
                {limits.maxDatasets !== -1 ? `/${limits.maxDatasets}` : " (unlimited)"}
              </Text>
              <Text type="secondary">
                Storage: {formatFileSize(usage.storageUsed)}
                {limits.maxStorage !== -1 ? `/${formatFileSize(limits.maxStorage)}` : " (unlimited)"}
              </Text>
              <Text type="secondary">
                Max File Size: {maxFileSizeLabel}
              </Text>
            </Space>
          </Space>
        }
        type="info"
        showIcon
        action={
          plan === "Free" && (
            <Button type="primary" size="small">
              Upgrade Plan
            </Button>
          )
        }
        style={{ marginBottom: 24 }}
      />

      {/* SECTION 1: File Upload Area */}
      <Card style={{ marginBottom: 24 }}>
        <Title level={4}>
          <CloudUploadOutlined /> Import Data
        </Title>
        <Paragraph type="secondary">
          Drop your files here or connect to a database
        </Paragraph>

        <Dragger
          name="file"
          multiple
          beforeUpload={handleFileUpload}
          showUploadList={false}
          disabled={isUploading}
          accept={allowedExtensions.join(",")}
          style={{ marginTop: 16 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 64, color: "#2563eb" }} />
          </p>
          <p className="ant-upload-text" style={{ fontSize: 16 }}>
            Click or drag files to upload
          </p>
          <p className="ant-upload-hint">
            Supported: CSV, Excel, JSON, Parquet, TSV • Max size: {maxFileSizeLabel}
          </p>
        </Dragger>

        {uploadedFiles.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <Title level={5}>Recent Uploads</Title>
            <List
              dataSource={uploadedFiles.slice(0, 3)}
              size="small"
              renderItem={(file) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      file.status === "uploading" ? (
                        <LoadingOutlined />
                      ) : file.status === "completed" ? (
                        <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 20 }} />
                      ) : (
                        <ExclamationCircleOutlined style={{ color: "#ff4d4f", fontSize: 20 }} />
                      )
                    }
                    title={file.name}
                    description={
                      file.status === "uploading" ? (
                        <Progress percent={file.progress} size="small" />
                      ) : file.status === "completed" ? (
                        <Text type="secondary">{file.rowCount?.toLocaleString()} rows imported</Text>
                      ) : (
                        <Text type="danger">{file.error}</Text>
                      )
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        )}
      </Card>

      {/* SECTION 2: Data Source Options Grid */}
      <Card style={{ marginBottom: 24 }}>
        <Title level={4}>
          <ApiOutlined /> Available Data Sources
        </Title>
        <Paragraph type="secondary">
          Select a data source to connect. Some options require a higher plan tier.
        </Paragraph>

        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          {dataSourceOptions.map((source) => {
            const available = isDataSourceAvailable(source);
            const isFileSource = source.category === "files";
            
            return (
              <Col xs={12} sm={8} md={6} lg={4} xl={4} key={source.value}>
                <Tooltip title={available ? source.description : getUpgradeMessage(source)}>
                  <Card
                    hoverable={available}
                    onClick={() => handleDataSourceClick(source)}
                    style={{
                      textAlign: "center",
                      opacity: available ? 1 : 0.4,
                      cursor: available ? "pointer" : "not-allowed",
                      border: available ? "1px solid #d9d9d9" : "1px solid #f0f0f0",
                      backgroundColor: available ? "#ffffff" : "#fafafa",
                      position: "relative",
                      transition: "all 0.3s ease",
                    }}
                    bodyStyle={{ padding: "16px 8px" }}
                  >
                    {!available && (
                      <LockOutlined
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          fontSize: 14,
                          color: "#faad14",
                        }}
                      />
                    )}
                    <div style={{ fontSize: 32, marginBottom: 8, color: available ? "#2563eb" : "#bfbfbf" }}>
                      {source.icon}
                    </div>
                    <Text
                      strong
                      style={{
                        fontSize: 13,
                        display: "block",
                        color: available ? "#262626" : "#bfbfbf",
                      }}
                    >
                      {source.label}
                    </Text>
                    {!available && (
                      <Tag
                        color="orange"
                        style={{ marginTop: 8, fontSize: 10 }}
                      >
                        {source.requiredFeature === "databaseConnections" && "Pro"}
                        {source.requiredFeature === "cloudStorage" && "Pro"}
                        {source.requiredFeature === "enterpriseConnectors" && "Team"}
                      </Tag>
                    )}
                  </Card>
                </Tooltip>
              </Col>
            );
          })}
        </Row>
      </Card>

      {/* SECTION 3: Imported Datasets List */}

      <Card
        title={
          <Space>
            <TableOutlined />
            <Text strong>Imported Datasets ({tables.length})</Text>
          </Space>
        }
        extra={
          tables.length > 0 && (
            <Button icon={<ReloadOutlined />} onClick={fetchTables}>
              Refresh
            </Button>
          )
        }
      >
        {tables.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <DatabaseOutlined style={{ fontSize: 64, color: "#d9d9d9", marginBottom: 16 }} />
            <Paragraph type="secondary">
              No datasets imported yet. Upload a file or connect a data source to get started.
            </Paragraph>
          </div>
        ) : (
          <List
            dataSource={tables}
            rowKey={(table) => table.datasetId || table.name}
            renderItem={(table) => (
              <List.Item
                actions={[
                  <Button
                    type="primary"
                    icon={<CloudUploadOutlined />}
                    onClick={() => handleUseInWorkspace(table)}
                  >
                    Use in workspace
                  </Button>,
                  <Button
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={() => handleTablePreview(table.name)}
                  >
                    Preview
                  </Button>,
                  <Button
                    type="link"
                    icon={<DownloadOutlined />}
                    onClick={() => handleExportTable(table.name)}
                  >
                    Export
                  </Button>,
                  <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteTable(table.name)}
                  >
                    Delete
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        backgroundColor: "#e6f7ff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <TableOutlined style={{ fontSize: 24, color: "#2563eb" }} />
                    </div>
                  }
                  title={<Text strong>{table.name}</Text>}
                  description={
                    <Space split={<Divider type="vertical" />} wrap>
                      <Text type="secondary">{table.rowCount.toLocaleString()} rows</Text>
                      <Text type="secondary">{table.columnCount} columns</Text>
                      <Text type="secondary">{table.size}</Text>
                      <Text type="secondary">
                        {table.lastUpdated
                          ? `Updated ${new Date(table.lastUpdated).toLocaleDateString()}`
                          : "Recently imported"}
                      </Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* Table Preview */}
      {selectedTable && tableData.length > 0 && (
        <Card
          title={
            <Space>
              <EyeOutlined />
              <Text strong>Preview: {selectedTable}</Text>
            </Space>
          }
          style={{ marginTop: 24 }}
          extra={
            <Button
              onClick={() => {
                setSelectedTable(null);
                setTableData([]);
                setTableColumns([]);
              }}
            >
              Close Preview
            </Button>
          }
        >
          <Table
            columns={tableColumns}
            dataSource={tableData}
            scroll={{ x: true }}
            pagination={{ pageSize: 10 }}
            size="small"
          />
        </Card>
      )}

      {/* Database Connection Modal */}
      <DatabaseConnectionModal
        open={showConnectionModal}
        databaseType={selectedDatabaseType}
        onCancel={() => setShowConnectionModal(false)}
        onConnect={handleDatabaseConnect}
      />
    </div>
  );
};

const DatabaseConnectionModal = ({
  open,
  databaseType,
  onCancel,
  onConnect,
}: {
  open: boolean;
  databaseType: string;
  onCancel: () => void;
  onConnect: (values: Record<string, unknown>) => void;
}) => {
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);

  const handleTestConnection = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);

      const response = await api.post("/import/test-connection", {
        type: databaseType,
        ...values,
      });

      if (response.data.success) {
        message.success("Connection successful!");
      } else {
        message.error(response.data.message || "Connection test failed");
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onConnect(values);
    } catch (error) {
      console.error("Validation failed:", error);
    }
  };

  const sqlFields = (
    <>
      <Form.Item name="host" label="Host" rules={[{ required: true }]}>
        <Input placeholder="localhost or IP address" />
      </Form.Item>
      <Form.Item name="port" label="Port" rules={[{ required: true }]}>
        <InputNumber placeholder="5432" style={{ width: "100%" }} />
      </Form.Item>
      <Form.Item name="database" label="Database" rules={[{ required: true }]}>
        <Input placeholder="database_name" />
      </Form.Item>
      <Form.Item name="username" label="Username" rules={[{ required: true }]}>
        <Input placeholder="username" />
      </Form.Item>
      <Form.Item name="password" label="Password" rules={[{ required: true }]}>
        <Input.Password placeholder="password" />
      </Form.Item>
      <Form.Item name="ssl" label="Use SSL" valuePropName="checked">
        <Switch />
      </Form.Item>
    </>
  );

  const s3Fields = (
    <>
      <Form.Item name="region" label="AWS Region" rules={[{ required: true }]}>
        <Input placeholder="us-east-1" />
      </Form.Item>
      <Form.Item name="bucket" label="Bucket Name" rules={[{ required: true }]}>
        <Input placeholder="my-bucket" />
      </Form.Item>
      <Form.Item name="accessKeyId" label="Access Key ID" rules={[{ required: true }]}>
        <Input placeholder="AKIA..." />
      </Form.Item>
      <Form.Item name="secretAccessKey" label="Secret Access Key" rules={[{ required: true }]}>
        <Input.Password />
      </Form.Item>
      <Form.Item name="prefix" label="Prefix (Optional)">
        <Input placeholder="data/" />
      </Form.Item>
    </>
  );

  const bigqueryFields = (
    <>
      <Form.Item name="projectId" label="Project ID" rules={[{ required: true }]}>
        <Input placeholder="my-project-123" />
      </Form.Item>
      <Form.Item name="dataset" label="Dataset" rules={[{ required: true }]}>
        <Input placeholder="my_dataset" />
      </Form.Item>
      <Form.Item name="credentials" label="Service Account JSON" rules={[{ required: true }]}>
        <Input.TextArea rows={6} placeholder="Paste service account JSON here" />
      </Form.Item>
    </>
  );

  const getFormFields = () => {
    switch (databaseType) {
      case "postgresql":
      case "mysql":
      case "mssql":
        return sqlFields;
      case "s3":
        return s3Fields;
      case "bigquery":
        return bigqueryFields;
      default:
        return sqlFields;
    }
  };

  return (
    <Modal
      title={`Connect to ${databaseType.toUpperCase()}`}
      open={open}
      onCancel={onCancel}
      width={600}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="test" onClick={handleTestConnection} loading={testing}>
          Test Connection
        </Button>,
        <Button key="connect" type="primary" onClick={handleSubmit}>
          Connect
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Connection Name" rules={[{ required: true }]}>
          <Input placeholder="My Database Connection" />
        </Form.Item>
        {getFormFields()}
      </Form>
    </Modal>
  );
};
