import { useEffect, useState } from "react";
import type { JSX } from "react";
import {
  Card,
  Tabs,
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
  Radio,
  InputNumber,
  Switch,
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
  rowCount: number;
  columnCount: number;
  size: string;
  lastUpdated: string;
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

const databaseTypes: Array<{
  value: string;
  label: string;
  icon: JSX.Element;
  requiredFeature: "databaseConnections" | "cloudStorage" | "enterpriseConnectors";
}> = [
  { value: "postgresql", label: "PostgreSQL", icon: <DatabaseOutlined />, requiredFeature: "databaseConnections" },
  { value: "mysql", label: "MySQL", icon: <DatabaseOutlined />, requiredFeature: "databaseConnections" },
  { value: "mssql", label: "SQL Server", icon: <WindowsOutlined />, requiredFeature: "databaseConnections" },
  { value: "mongodb", label: "MongoDB", icon: <DatabaseOutlined />, requiredFeature: "databaseConnections" },
  { value: "snowflake", label: "Snowflake", icon: <CloudUploadOutlined />, requiredFeature: "enterpriseConnectors" },
  { value: "bigquery", label: "Google BigQuery", icon: <GoogleOutlined />, requiredFeature: "enterpriseConnectors" },
  { value: "redshift", label: "Amazon Redshift", icon: <AmazonOutlined />, requiredFeature: "enterpriseConnectors" },
  { value: "s3", label: "Amazon S3", icon: <AmazonOutlined />, requiredFeature: "cloudStorage" },
  { value: "azure-sql", label: "Azure SQL Database", icon: <WindowsOutlined />, requiredFeature: "enterpriseConnectors" },
  { value: "azure-blob", label: "Azure Blob Storage", icon: <WindowsOutlined />, requiredFeature: "cloudStorage" },
  { value: "gcs", label: "Google Cloud Storage", icon: <GoogleOutlined />, requiredFeature: "cloudStorage" },
];

export const DataImportTab = () => {
  const { plan, limits, usage, workspaceId } = useUser();
  const [activeImportType, setActiveImportType] = useState<"file" | "database">("file");
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
  const allowedExtensions = limits.features.allFileFormats
    ? [".csv", ".xlsx", ".xls", ".json", ".parquet", ".tsv", ".txt"]
    : [".csv", ".xlsx", ".xls"];
  const filteredDatabaseTypes = databaseTypes.filter((db) => {
    if (db.requiredFeature === "enterpriseConnectors") {
      return limits.features.enterpriseConnectors;
    }
    if (db.requiredFeature === "cloudStorage") {
      return limits.features.cloudStorage;
    }
    return limits.features.databaseConnections;
  });

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

    if (file.size > maxFileSize) {
      const upgradeTarget = plan === "Free" ? "Professional" : "Team";
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
                tableCount: response.data.tableCount,
                rowCount: response.data.rowCount,
              }
            : entry
        )
      );

      fetchTables();
      message.success(`${file.name} uploaded successfully!`);
    } catch (error: any) {
      setUploadedFiles((prev) =>
        prev.map((entry) =>
          entry.id === fileId
            ? {
                ...entry,
                status: "error",
                error: error.response?.data?.message || "Upload failed",
              }
            : entry
        )
      );
      message.error(`Failed to upload ${file.name}`);
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

  useEffect(() => {
    fetchTables();
  }, [workspaceId]);

  return (
    <div className="data-import-container">
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
                AI Messages: {usage.aiMessagesUsed}
                {limits.aiMessagesPerMonth !== -1 ? `/${limits.aiMessagesPerMonth}` : " (unlimited)"}
              </Text>
            </Space>
          </Space>
        }
        type="info"
        showIcon
        action={
          plan === "Free" && (
            <Button type="primary" size="small">
              Upgrade to Pro
            </Button>
          )
        }
        style={{ marginBottom: 16 }}
      />
      <Tabs
        activeKey={activeImportType}
        onChange={(key) => setActiveImportType(key as "file" | "database")}
        items={[
          {
            key: "file",
            label: (
              <span>
                <CloudUploadOutlined /> File Upload
              </span>
            ),
            children: (
              <div className="import-section">
                <Card className="upload-card">
                  <Space direction="vertical" size="large" style={{ width: "100%" }}>
                    <Alert
                      message={`Max file size: ${formatFileSize(maxFileSize)}`}
                      description={
                        plan === "Free"
                          ? "Upgrade to Professional ($49/mo) for 100 MB files, or Team ($149/mo) for 500 MB files."
                          : null
                      }
                      type="info"
                      showIcon
                    />

                    <Dragger
                      name="file"
                      multiple
                      beforeUpload={handleFileUpload}
                      showUploadList={false}
                      disabled={isUploading}
                      accept={allowedExtensions.join(",")}
                    >
                      <p className="ant-upload-drag-icon">
                        <InboxOutlined style={{ color: "#2563eb" }} />
                      </p>
                      <p className="ant-upload-text">Click or drag files to upload</p>
                      <p className="ant-upload-hint">
                        Supported formats: CSV, Excel, JSON, Parquet, TSV, TXT
                      </p>
                    </Dragger>

                    {uploadedFiles.length > 0 && (
                      <div className="upload-progress-section">
                        <Title level={5}>Upload History</Title>
                        <List
                          dataSource={uploadedFiles}
                          rowKey={(file) => file.id}
                          renderItem={(file) => (
                            <List.Item
                              actions={[
                                file.status === "completed" && (
                                  <Button
                                    type="link"
                                    size="small"
                                    onClick={() =>
                                      handleTablePreview(file.tableName || file.name.split(".")[0])
                                    }
                                  >
                                    Preview
                                  </Button>
                                ),
                              ]}
                            >
                              <List.Item.Meta
                                avatar={
                                  file.status === "uploading" ? (
                                    <LoadingOutlined />
                                  ) : file.status === "completed" ? (
                                    <CheckCircleOutlined style={{ color: "#52c41a" }} />
                                  ) : (
                                    <ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />
                                  )
                                }
                                title={
                                  <Space>
                                    <Text>{file.name}</Text>
                                    <Text type="secondary">({formatFileSize(file.size)})</Text>
                                  </Space>
                                }
                                description={
                                  <>
                                    {file.status === "uploading" && (
                                      <Progress percent={file.progress} size="small" />
                                    )}
                                    {file.status === "completed" && (
                                      <Text type="secondary">
                                        {file.rowCount?.toLocaleString()} rows • {file.tableCount} table(s)
                                      </Text>
                                    )}
                                    {file.status === "error" && <Text type="danger">{file.error}</Text>}
                                  </>
                                }
                              />
                            </List.Item>
                          )}
                        />
                      </div>
                    )}
                  </Space>
                </Card>
              </div>
            ),
          },
          {
            key: "database",
            label: (
              <span>
                <DatabaseOutlined /> Database Connection
              </span>
            ),
            children: (
              <div className="import-section">
                {!limits.features.databaseConnections ? (
                  <Card className="upgrade-prompt-card">
                    <Space direction="vertical" align="center" style={{ width: "100%" }} size="large">
                      <LockOutlined style={{ fontSize: 48, color: "#faad14" }} />
                      <Title level={4}>Database Connections</Title>
                      <Text type="secondary">
                        Unlock PostgreSQL, MySQL, MongoDB, and more with Professional plan
                      </Text>
                      <Button type="primary" size="large">
                        Upgrade to Pro - $49/month
                      </Button>
                    </Space>
                  </Card>
                ) : (
                  <Card className="database-connection-card">
                    <Space direction="vertical" size="large" style={{ width: "100%" }}>
                      <div>
                        <Title level={5}>Connect to Database</Title>
                        <Paragraph type="secondary">
                          Choose a database type and provide connection details
                        </Paragraph>
                      </div>

                      <div className="database-type-grid">
                        <Radio.Group
                          value={selectedDatabaseType}
                          onChange={(e) => setSelectedDatabaseType(e.target.value)}
                          style={{ width: "100%" }}
                        >
                          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                            <Text strong>Databases</Text>
                            <div className="db-options-row">
                              {filteredDatabaseTypes
                                .filter((db) => ["postgresql", "mysql", "mssql", "mongodb"].includes(db.value))
                                .map((db) => (
                                  <Radio.Button key={db.value} value={db.value} className="db-option-button">
                                    {db.icon} {db.label}
                                  </Radio.Button>
                                ))}
                            </div>

                            <Text strong>Data Warehouses</Text>
                            <div className="db-options-row">
                              {filteredDatabaseTypes
                                .filter((db) => ["snowflake", "bigquery", "redshift", "azure-sql"].includes(db.value))
                                .map((db) => (
                                  <Radio.Button key={db.value} value={db.value} className="db-option-button">
                                    {db.icon} {db.label}
                                  </Radio.Button>
                                ))}
                            </div>

                            <Text strong>Data Lakes / Cloud Storage</Text>
                            <div className="db-options-row">
                              {filteredDatabaseTypes
                                .filter((db) => ["s3", "azure-blob", "gcs"].includes(db.value))
                                .map((db) => (
                                  <Radio.Button key={db.value} value={db.value} className="db-option-button">
                                    {db.icon} {db.label}
                                  </Radio.Button>
                                ))}
                            </div>
                          </Space>
                        </Radio.Group>
                      </div>

                      {selectedDatabaseType && (
                        <Button
                          type="primary"
                          icon={<ApiOutlined />}
                          onClick={() => setShowConnectionModal(true)}
                          size="large"
                        >
                          Configure {filteredDatabaseTypes.find((d) => d.value === selectedDatabaseType)?.label} Connection
                        </Button>
                      )}

                      {databases.length > 0 && (
                        <>
                          <Divider />
                          <div>
                            <Title level={5}>Active Connections</Title>
                            <List
                              dataSource={databases}
                              rowKey={(db) => db.id}
                              renderItem={(db) => (
                                <List.Item
                                  actions={[
                                    <Button type="link" icon={<ReloadOutlined />} key="sync">
                                      Sync
                                    </Button>,
                                    <Button type="link" danger key="disconnect">
                                      Disconnect
                                    </Button>,
                                  ]}
                                >
                                  <List.Item.Meta
                                    avatar={filteredDatabaseTypes.find((d) => d.value === db.type)?.icon}
                                    title={db.name}
                                    description={
                                      <Space direction="vertical" size={0}>
                                        <Text type="secondary">
                                          {db.host} • {db.database}
                                        </Text>
                                        <Space>
                                          <Tag color={db.status === "connected" ? "success" : "error"}>
                                            {db.status}
                                          </Tag>
                                          <Text type="secondary">{db.tableCount} tables</Text>
                                        </Space>
                                      </Space>
                                    }
                                  />
                                </List.Item>
                              )}
                            />
                          </div>
                        </>
                      )}
                    </Space>
                  </Card>
                )}
              </div>
            ),
          },
        ]}
      />

      <Card
        title={
          <span>
            <TableOutlined /> Imported Tables ({tables.length})
          </span>
        }
        className="tables-list-card"
        style={{ marginTop: 24 }}
      >
        <List
          dataSource={tables}
          rowKey={(table) => table.name}
          renderItem={(table) => (
            <List.Item
              actions={[
                <Button type="link" icon={<EyeOutlined />} onClick={() => handleTablePreview(table.name)}>
                  Preview
                </Button>,
                <Button type="link" icon={<DownloadOutlined />} onClick={() => handleExportTable(table.name)}>
                  Export
                </Button>,
                <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDeleteTable(table.name)}>
                  Delete
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<TableOutlined style={{ fontSize: 24, color: "#2563eb" }} />}
                title={<Text strong>{table.name}</Text>}
                description={
                  <Space split={<Divider type="vertical" />}>
                    <Text type="secondary">{table.rowCount.toLocaleString()} rows</Text>
                    <Text type="secondary">{table.columnCount} columns</Text>
                    <Text type="secondary">{table.size}</Text>
                    <Text type="secondary">
                      Updated {table.lastUpdated ? new Date(table.lastUpdated).toLocaleDateString() : "Unknown"}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
          locale={{ emptyText: "No tables imported yet. Upload a file or connect a database to get started." }}
        />
      </Card>

      {selectedTable && tableData.length > 0 && (
        <Card
          title={
            <span>
              <EyeOutlined /> Preview: {selectedTable}
            </span>
          }
          className="data-preview-card"
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
