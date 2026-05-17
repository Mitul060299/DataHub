import { useState, useEffect } from "react";
import {
  listConnectorCredentials,
  saveConnectorCredential,
  exportDatasetToConnector,
  pushDatasetToPowerBI,
  publishDatasetToTableauServer,
  type ConnectorCredential,
} from "../../api";

// ── Destination catalogue ────────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "password";
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}

interface DestinationDef {
  id: string;
  label: string;
  icon: string;
  description: string;
  /** Label shown above the output table name / file key field */
  outputLabel: string;
  outputPlaceholder: string;
  /** SQL destinations support append/replace; object stores always replace */
  supportsMode: boolean;
  /** Underlying connector type sent to the API (defaults to id when not set) */
  connectorType?: string;
  /** Helper hint shown below the output path/table field */
  outputHint?: string;
  /**
   * When set, this destination uses a direct live-push endpoint instead of
   * the generic /export/connector path. Value is the endpoint path suffix,
   * e.g. 'powerbi-push' → POST /datasets/{id}/export/powerbi-push.
   */
  livePushEndpoint?: string;
  /**
   * For live-push destinations the "output name" field maps to this payload key.
   * For Power BI this is table_name; for Tableau this is datasource_name.
   */
  livePushOutputKey?: string;
  fields: FieldDef[];
}

const DESTINATIONS: DestinationDef[] = [
  // ── SQL databases ──────────────────────────────────────────────────────
  {
    id: "postgresql",
    label: "PostgreSQL",
    icon: "🐘",
    description: "Write rows to a PostgreSQL table",
    outputLabel: "Destination table",
    outputPlaceholder: "cleaned_customers",
    supportsMode: true,
    fields: [
      { key: "host", label: "Host", type: "text", placeholder: "db.example.com", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "5432", defaultValue: "5432" },
      { key: "database", label: "Database", type: "text", placeholder: "my_database", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "postgres", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
      { key: "schema", label: "Schema", type: "text", placeholder: "public", defaultValue: "public" },
    ],
  },
  {
    id: "mysql",
    label: "MySQL",
    icon: "🐬",
    description: "Write rows to a MySQL / MariaDB table",
    outputLabel: "Destination table",
    outputPlaceholder: "cleaned_data",
    supportsMode: true,
    fields: [
      { key: "host", label: "Host", type: "text", placeholder: "db.example.com", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "3306", defaultValue: "3306" },
      { key: "database", label: "Database", type: "text", placeholder: "my_database", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "root", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
    ],
  },
  {
    id: "mssql",
    label: "SQL Server",
    icon: "🪟",
    description: "Write rows to a SQL Server table",
    outputLabel: "Destination table",
    outputPlaceholder: "cleaned_data",
    supportsMode: true,
    fields: [
      { key: "host", label: "Host", type: "text", placeholder: "db.example.com", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "1433", defaultValue: "1433" },
      { key: "database", label: "Database", type: "text", placeholder: "my_database", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "sa", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
      { key: "schema", label: "Schema", type: "text", placeholder: "dbo", defaultValue: "dbo" },
    ],
  },
  {
    id: "oracle",
    label: "Oracle",
    icon: "🔶",
    description: "Write rows to an Oracle table",
    outputLabel: "Destination table",
    outputPlaceholder: "CLEANED_DATA",
    supportsMode: true,
    fields: [
      { key: "host", label: "Host", type: "text", placeholder: "db.example.com", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "1521", defaultValue: "1521" },
      { key: "service_name", label: "Service name", type: "text", placeholder: "ORCL", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "scott", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
    ],
  },
  // ── Cloud warehouses ───────────────────────────────────────────────────
  {
    id: "snowflake",
    label: "Snowflake",
    icon: "❄️",
    description: "Load into a Snowflake table",
    outputLabel: "Destination table",
    outputPlaceholder: "CLEANED_DATA",
    supportsMode: true,
    fields: [
      { key: "account", label: "Account", type: "text", placeholder: "xy12345.us-east-1", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "my_user", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
      { key: "warehouse", label: "Warehouse", type: "text", placeholder: "COMPUTE_WH", required: true },
      { key: "database", label: "Database", type: "text", placeholder: "MY_DB", required: true },
      { key: "schema", label: "Schema", type: "text", placeholder: "PUBLIC", defaultValue: "PUBLIC" },
    ],
  },
  {
    id: "bigquery",
    label: "BigQuery",
    icon: "☁️",
    description: "Load into a BigQuery table",
    outputLabel: "Destination table",
    outputPlaceholder: "cleaned_data",
    supportsMode: true,
    fields: [
      { key: "project_id", label: "Project ID", type: "text", placeholder: "my-gcp-project", required: true },
      { key: "dataset", label: "Dataset", type: "text", placeholder: "my_dataset", required: true },
      { key: "credentials_json", label: "Service account key (JSON)", type: "password", placeholder: '{"type": "service_account"...}', required: true },
    ],
  },
  {
    id: "redshift",
    label: "Redshift",
    icon: "🔴",
    description: "Load into a Redshift table",
    outputLabel: "Destination table",
    outputPlaceholder: "cleaned_data",
    supportsMode: true,
    fields: [
      { key: "host", label: "Host", type: "text", placeholder: "my-cluster.abc123.us-east-1.redshift.amazonaws.com", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "5439", defaultValue: "5439" },
      { key: "database", label: "Database", type: "text", placeholder: "dev", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "awsuser", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
      { key: "schema", label: "Schema", type: "text", placeholder: "public", defaultValue: "public" },
    ],
  },
  {
    id: "azure-sql",
    label: "Azure Synapse",
    icon: "🔷",
    description: "Load into Azure Synapse Analytics",
    outputLabel: "Destination table",
    outputPlaceholder: "cleaned_data",
    supportsMode: true,
    fields: [
      { key: "server", label: "Server", type: "text", placeholder: "my-server.sql.azuresynapse.net", required: true },
      { key: "database", label: "Database", type: "text", placeholder: "my_database", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "sqladmin", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
      { key: "schema", label: "Schema", type: "text", placeholder: "dbo", defaultValue: "dbo" },
    ],
  },
  // ── Object storage ─────────────────────────────────────────────────────
  {
    id: "s3",
    label: "Amazon S3",
    icon: "🪣",
    description: "Save as Parquet to an S3 bucket",
    outputLabel: "Output file path (key)",
    outputPlaceholder: "cleaned/output.parquet",
    supportsMode: false,
    fields: [
      { key: "access_key_id", label: "Access Key ID", type: "text", placeholder: "AKIAIOSFODNN7EXAMPLE", required: true },
      { key: "secret_access_key", label: "Secret Access Key", type: "password", placeholder: "••••••••", required: true },
      { key: "region", label: "Region", type: "text", placeholder: "us-east-1", defaultValue: "us-east-1" },
      { key: "bucket", label: "Bucket", type: "text", placeholder: "my-bucket", required: true },
    ],
  },
  {
    id: "gcs",
    label: "Google Cloud Storage",
    icon: "🗂️",
    description: "Save as Parquet to a GCS bucket",
    outputLabel: "Output file path",
    outputPlaceholder: "cleaned/output.parquet",
    supportsMode: false,
    fields: [
      { key: "project_id", label: "Project ID", type: "text", placeholder: "my-gcp-project" },
      { key: "bucket", label: "Bucket", type: "text", placeholder: "my-bucket", required: true },
      { key: "credentials_json", label: "Service account key (JSON, optional)", type: "password", placeholder: '{"type": "service_account"...}' },
    ],
  },
  {
    id: "azure_blob",
    label: "Azure Blob Storage",
    icon: "🔷",
    description: "Save as Parquet to Azure Blob Storage",
    outputLabel: "Output blob path",
    outputPlaceholder: "cleaned/output.parquet",
    supportsMode: false,
    fields: [
      { key: "connection_string", label: "Connection string", type: "password", placeholder: "DefaultEndpointsProtocol=https;AccountName=...", required: true },
      { key: "container", label: "Container", type: "text", placeholder: "my-container", required: true },
    ],
  },
  // ── ML Platforms ────────────────────────────────────────────────────────────
  {
    id: "sagemaker",
    label: "Amazon SageMaker",
    icon: "🤖",
    description: "Export training data to S3 for SageMaker",
    connectorType: "s3",
    outputLabel: "S3 data channel path",
    outputPlaceholder: "training/cleaned_data.parquet",
    outputHint: "SageMaker training jobs read from S3 channels. Use Parquet or CSV extension.",
    supportsMode: false,
    fields: [
      { key: "access_key_id", label: "Access Key ID", type: "text", placeholder: "AKIAIOSFODNN7EXAMPLE", required: true },
      { key: "secret_access_key", label: "Secret Access Key", type: "password", placeholder: "••••••••", required: true },
      { key: "region", label: "Region", type: "text", placeholder: "us-east-1", defaultValue: "us-east-1" },
      { key: "bucket", label: "S3 Bucket", type: "text", placeholder: "my-sagemaker-bucket", required: true },
    ],
  },
  {
    id: "vertex_ai",
    label: "Vertex AI",
    icon: "🧠",
    description: "Export training data to GCS for Vertex AI",
    connectorType: "gcs",
    outputLabel: "GCS file path",
    outputPlaceholder: "datasets/cleaned_data.parquet",
    outputHint: "Vertex AI custom training jobs and managed datasets read directly from GCS. Use Parquet or CSV.",
    supportsMode: false,
    fields: [
      { key: "project_id", label: "GCP Project ID", type: "text", placeholder: "my-gcp-project", required: true },
      { key: "bucket", label: "GCS Bucket", type: "text", placeholder: "my-vertex-bucket", required: true },
      { key: "credentials_json", label: "Service account key (JSON, optional)", type: "password", placeholder: '{"type": "service_account"...}' },
    ],
  },
  {
    id: "databricks",
    label: "Databricks",
    icon: "⚡",
    description: "Write data to Databricks via S3 or cloud storage",
    connectorType: "s3",
    outputLabel: "Cloud storage file path",
    outputPlaceholder: "mnt/datasets/cleaned_data.parquet",
    outputHint: "Mount your S3/ADLS bucket in Databricks and reference this path in Delta Lake or notebook code.",
    supportsMode: false,
    fields: [
      { key: "access_key_id", label: "Access Key ID", type: "text", placeholder: "AKIAIOSFODNN7EXAMPLE", required: true },
      { key: "secret_access_key", label: "Secret Access Key", type: "password", placeholder: "••••••••", required: true },
      { key: "region", label: "Region", type: "text", placeholder: "us-east-1", defaultValue: "us-east-1" },
      { key: "bucket", label: "S3 Bucket", type: "text", placeholder: "my-databricks-bucket", required: true },
    ],
  },
  // ── Live Push ──────────────────────────────────────────────────────────
  {
    id: "powerbi_service",
    label: "Power BI Service",
    icon: "📊",
    description: "Push rows live to a Power BI push/streaming dataset",
    outputLabel: "Table name (in push dataset)",
    outputPlaceholder: "RealTimeData",
    supportsMode: false,
    livePushEndpoint: "powerbi-push",
    livePushOutputKey: "table_name",
    fields: [
      { key: "tenant_id", label: "Azure AD Tenant ID", type: "text", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
      { key: "client_id", label: "Application (Client) ID", type: "text", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", placeholder: "••••••••", required: true },
      { key: "workspace_id", label: "Workspace ID", type: "text", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
      { key: "dataset_id", label: "Push Dataset ID", type: "text", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
    ],
  },
  {
    id: "tableau_server",
    label: "Tableau Server / Cloud",
    icon: "📈",
    description: "Publish dataset as a datasource to Tableau Server or Tableau Cloud",
    outputLabel: "Datasource name",
    outputPlaceholder: "My Dataset",
    supportsMode: false,
    livePushEndpoint: "tableau-publish",
    livePushOutputKey: "datasource_name",
    outputHint: "The datasource will be published as a CSV extract into the selected project.",
    fields: [
      { key: "server_url", label: "Server URL", type: "text", placeholder: "https://10ax.online.tableau.com", required: true },
      { key: "site_id", label: "Site Content URL (blank = Default)", type: "text", placeholder: "" },
      { key: "project_id", label: "Project LUID", type: "text", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
      { key: "token_name", label: "Personal Access Token Name", type: "text", placeholder: "my-token", required: true },
      { key: "token_value", label: "Personal Access Token Secret", type: "password", placeholder: "••••••••", required: true },
    ],
  },
];

const DESTINATION_GROUPS: { label: string; ids: string[] }[] = [
  { label: "SQL Databases", ids: ["postgresql", "mysql", "mssql", "oracle"] },
  { label: "Cloud Warehouses", ids: ["snowflake", "bigquery", "redshift", "azure-sql"] },
  { label: "Object Storage", ids: ["s3", "gcs", "azure_blob"] },
  { label: "ML Platforms", ids: ["sagemaker", "vertex_ai", "databricks"] },
  { label: "Live Push", ids: ["powerbi_service", "tableau_server"] },
  { label: "Live Push", ids: ["powerbi_service", "tableau_server"] },
];

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  datasetId: string | null;
  datasetName: string | null;
  rowCount?: number | null;
}

type Step = "pick" | "configure" | "done" | "error";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  background: "var(--bg1)",
  border: "1px solid var(--bd)",
  borderRadius: 6,
  color: "var(--tx0)",
  fontSize: 13,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--tx2)",
  fontWeight: 600,
  marginBottom: 4,
  display: "block",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

export function SendToDestinationModal({ open, onClose, datasetId, datasetName, rowCount }: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<DestinationDef | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [tableName, setTableName] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [saveCred, setSaveCred] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [savedCreds, setSavedCreds] = useState<ConnectorCredential[]>([]);
  const [selectedCredId, setSelectedCredId] = useState<string | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ rows_written: number; table: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingCreds(true);
    listConnectorCredentials()
      .then(({ credentials }) => setSavedCreds(credentials))
      .catch(() => setSavedCreds([]))
      .finally(() => setLoadingCreds(false));
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setStep("pick");
    setSelected(null);
    setFields({});
    setTableName("");
    setMode("append");
    setSaveCred(false);
    setSaveLabel("");
    setSelectedCredId(null);
    setSending(false);
    setResult(null);
    setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const pickDestination = (dest: DestinationDef) => {
    const defaults: Record<string, string> = {};
    for (const f of dest.fields) {
      if (f.defaultValue !== undefined) defaults[f.key] = f.defaultValue;
    }
    setSelected(dest);
    setFields(defaults);
    setSelectedCredId(null);
    setSaveLabel(dest.label);
    setTableName("");
    setStep("configure");
  };

  const pickSavedCred = (cred: ConnectorCredential) => {
    const dest = DESTINATIONS.find((d) => d.id === cred.connector_type) ?? null;
    if (!dest) return;
    setSelected(dest);
    setSelectedCredId(cred.id);
    setFields({});
    setSaveLabel(cred.label);
    setTableName("");
    setStep("configure");
  };

  const handleSend = async () => {
    if (!datasetId || !selected || !tableName.trim()) return;
    setSending(true);
    setError(null);
    try {
      // ── Live-push destinations (Power BI Service, Tableau Server) ──
      if (selected.livePushEndpoint) {
        const livePushKey = selected.livePushOutputKey ?? "table_name";
        const livePushPayload: Record<string, string> = {
          ...fields,
          [livePushKey]: tableName.trim(),
        };
        let res: { rows_written?: number; datasource_id?: string; datasource_name?: string; table_name?: string };
        if (selected.livePushEndpoint === "powerbi-push") {
          res = await pushDatasetToPowerBI(datasetId, livePushPayload as Parameters<typeof pushDatasetToPowerBI>[1]);
          setResult({ rows_written: res.rows_written ?? 0, table: res.table_name ?? tableName.trim() });
        } else {
          res = await publishDatasetToTableauServer(datasetId, livePushPayload as Parameters<typeof publishDatasetToTableauServer>[1]);
          setResult({ rows_written: 0, table: res.datasource_name ?? tableName.trim() });
        }
        setStep("done");
        return;
      }

      // ── Standard connector write-back ──────────────────────────────
      const apiConnectorType = selected.connectorType ?? selected.id;
      let credentialId: string | undefined = selectedCredId ?? undefined;
      if (saveCred && !credentialId && saveLabel.trim()) {
        const saved = await saveConnectorCredential(saveLabel.trim(), apiConnectorType, fields as Record<string, unknown>);
        credentialId = saved.id;
      }
      const payload: Parameters<typeof exportDatasetToConnector>[1] = {
        connector_type: apiConnectorType,
        table_name: tableName.trim(),
        mode: selected.supportsMode ? mode : "replace",
        ...(credentialId
          ? { credential_id: credentialId }
          : { connector_config: fields as Record<string, unknown> }),
      };
      const res = await exportDatasetToConnector(datasetId, payload);
      setResult({ rows_written: res.rows_written, table: res.table });
      setStep("done");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        (err instanceof Error ? err.message : "Write failed. Check your credentials and try again.");
      setError(msg);
      setStep("error");
    } finally {
      setSending(false);
    }
  };

  const canSend =
    !!datasetId &&
    !!selected &&
    tableName.trim().length > 0 &&
    (!!selectedCredId ||
      selected.fields.filter((f) => f.required).every((f) => (fields[f.key] ?? "").trim().length > 0));

  // ── Saved creds relevant to this destination ──────────────────────────
  const relevantCreds = selected
    ? savedCreds.filter((c) => c.connector_type === (selected.connectorType ?? selected.id))
    : savedCreds;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={handleClose}
    >
      <div
        style={{ background: "var(--bg2)", border: "1px solid var(--bd)", borderRadius: 12, width: 560, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.7)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--tx0)" }}>
              Send to destination
            </p>
            {datasetName && (
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--tx2)" }}>
                {datasetName}
                {rowCount != null ? ` · ${rowCount.toLocaleString()} rows` : ""}
              </p>
            )}
          </div>
          {step !== "pick" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" style={{ fontSize: 12 }} onClick={() => { setStep("pick"); setSelected(null); setSelectedCredId(null); }}>
                ← Back
              </button>
              <button className="btn" onClick={handleClose} style={{ padding: "4px 10px" }}>✕</button>
            </div>
          )}
          {step === "pick" && (
            <button className="btn" onClick={handleClose} style={{ padding: "4px 10px" }}>✕</button>
          )}
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {/* ── Step 1: Pick destination ─────────────────────────────── */}
          {step === "pick" && (
            <div style={{ padding: "16px 20px" }}>
              {/* Saved credentials quick-pick */}
              {!loadingCreds && savedCreds.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ ...labelStyle, marginBottom: 8 }}>Saved credentials</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {savedCreds.map((cred) => {
                      const dest = DESTINATIONS.find((d) => d.id === cred.connector_type);
                      if (!dest) return null;
                      return (
                        <button
                          key={cred.id}
                          onClick={() => pickSavedCred(cred)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "var(--bg1)", border: "1px solid var(--bd)", borderRadius: 8, cursor: "pointer", textAlign: "left", color: "var(--tx0)" }}
                        >
                          <span style={{ fontSize: 18 }}>{dest.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{cred.label}</p>
                            <p style={{ margin: 0, fontSize: 11, color: "var(--tx2)" }}>{dest.label}</p>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--ac)" }}>Use →</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ height: 1, background: "var(--bd)", margin: "16px 0" }} />
                </div>
              )}

              {/* Destination groups */}
              {DESTINATION_GROUPS.map((group) => (
                <div key={group.label} style={{ marginBottom: 20 }}>
                  <p style={labelStyle}>{group.label}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {group.ids.map((id) => {
                      const dest = DESTINATIONS.find((d) => d.id === id)!;
                      return (
                        <button
                          key={dest.id}
                          onClick={() => pickDestination(dest)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--bg1)", border: "1px solid var(--bd)", borderRadius: 8, cursor: "pointer", textAlign: "left", color: "var(--tx0)", transition: "border-color 0.15s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--ac)")}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--bd)")}
                        >
                          <span style={{ fontSize: 22 }}>{dest.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dest.label}</p>
                            <p style={{ margin: 0, fontSize: 11, color: "var(--tx2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dest.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Step 2: Configure ────────────────────────────────────── */}
          {step === "configure" && selected && (
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Destination badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--bg1)", border: "1px solid var(--bd)", borderRadius: 8 }}>
                <span style={{ fontSize: 24 }}>{selected.icon}</span>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--tx0)" }}>{selected.label}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--tx2)" }}>{selected.description}</p>
                </div>
              </div>

              {/* Saved cred selected — show swap option */}
              {selectedCredId && (
                <div style={{ padding: "10px 12px", background: "rgba(91,106,240,0.08)", border: "1px solid rgba(91,106,240,0.25)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--ac)", fontWeight: 600 }}>Using saved credentials</p>
                    <p style={{ margin: 0, fontSize: 11, color: "var(--tx2)" }}>
                      {savedCreds.find((c) => c.id === selectedCredId)?.label ?? selectedCredId}
                    </p>
                  </div>
                  <button className="btn" style={{ fontSize: 11 }} onClick={() => setSelectedCredId(null)}>
                    Change
                  </button>
                </div>
              )}

              {/* Credential fields — shown only when not using saved cred */}
              {!selectedCredId && (
                <>
                  {/* Show relevant saved creds if any */}
                  {relevantCreds.length > 0 && (
                    <div>
                      <label style={labelStyle}>Use saved credential</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {relevantCreds.map((cred) => (
                          <button
                            key={cred.id}
                            onClick={() => setSelectedCredId(cred.id)}
                            style={{ padding: "7px 10px", background: "var(--bg1)", border: "1px solid var(--bd)", borderRadius: 6, cursor: "pointer", textAlign: "left", color: "var(--tx1)", fontSize: 12 }}
                          >
                            {cred.label}
                          </button>
                        ))}
                      </div>
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--tx2)" }}>— or enter new credentials below —</p>
                    </div>
                  )}

                  {/* Credential form fields */}
                  {selected.fields.map((f) => (
                    <div key={f.key}>
                      <label style={labelStyle}>
                        {f.label}
                        {f.required && <span style={{ color: "#e06060", marginLeft: 2 }}>*</span>}
                      </label>
                      <input
                        type={f.type === "password" ? "password" : "text"}
                        inputMode={f.type === "number" ? "numeric" : undefined}
                        placeholder={f.placeholder}
                        value={fields[f.key] ?? ""}
                        onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        style={inputStyle}
                        autoComplete="off"
                      />
                    </div>
                  ))}

                  {/* Save credential toggle */}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--tx1)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={saveCred}
                      onChange={(e) => setSaveCred(e.target.checked)}
                    />
                    Save these credentials for future use
                  </label>
                  {saveCred && (
                    <div>
                      <label style={labelStyle}>Credential label</label>
                      <input
                        type="text"
                        placeholder={`e.g. "Production PostgreSQL"`}
                        value={saveLabel}
                        onChange={(e) => setSaveLabel(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Divider */}
              <div style={{ height: 1, background: "var(--bd)" }} />

              {/* Output table / file path */}
              <div>
                <label style={labelStyle}>
                  {selected.outputLabel}
                  <span style={{ color: "#e06060", marginLeft: 2 }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder={selected.outputPlaceholder}
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  style={inputStyle}
                  autoComplete="off"
                />
                {selected.outputHint && (
                  <p style={{ margin: "5px 0 0", fontSize: 11, color: "var(--tx2)" }}>{selected.outputHint}</p>
                )}
              </div>

              {/* Write mode */}
              {selected.supportsMode && (
                <div>
                  <label style={labelStyle}>Write mode</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["append", "replace"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        style={{
                          flex: 1,
                          padding: "8px 0",
                          background: mode === m ? "rgba(91,106,240,0.12)" : "var(--bg1)",
                          border: mode === m ? "1px solid rgba(91,106,240,0.4)" : "1px solid var(--bd)",
                          borderRadius: 7,
                          color: mode === m ? "var(--ac)" : "var(--tx1)",
                          fontSize: 13,
                          fontWeight: mode === m ? 600 : 400,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {m === "append" ? "Append rows" : "Replace table"}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--tx2)" }}>
                    {mode === "append"
                      ? "New rows are added to the existing table."
                      : "The destination table is truncated and fully replaced."}
                  </p>
                </div>
              )}

              {!selected.supportsMode && (
                <p style={{ margin: 0, fontSize: 11, color: "var(--tx2)", padding: "6px 10px", background: "var(--bg1)", borderRadius: 6, border: "1px solid var(--bd)" }}>
                  Object storage destinations always overwrite the file at the specified path.
                </p>
              )}
            </div>
          )}

          {/* ── Step: Done ───────────────────────────────────────────── */}
          {step === "done" && result && selected && (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "var(--tx0)" }}>
                Data sent successfully
              </p>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--tx2)" }}>
                <strong style={{ color: "var(--tx1)" }}>{result.rows_written.toLocaleString()} rows</strong>
                {" "}written to{" "}
                <code style={{ background: "var(--bg1)", padding: "1px 6px", borderRadius: 4, fontSize: 12, color: "var(--ac)" }}>{result.table}</code>
                {" "}on{" "}
                <strong style={{ color: "var(--tx1)" }}>{selected.label}</strong>
              </p>
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                <button className="btn" onClick={() => { setStep("configure"); setResult(null); }}>
                  Send again
                </button>
                <button className="btn" style={{ background: "var(--acl)", borderColor: "var(--acg)", color: "var(--ac)" }} onClick={handleClose}>
                  Done
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Error ──────────────────────────────────────────── */}
          {step === "error" && (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "var(--tx0)" }}>
                Write failed
              </p>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--tx2)", wordBreak: "break-word" }}>
                {error ?? "An unknown error occurred."}
              </p>
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                <button className="btn" onClick={() => { setStep("configure"); setError(null); }}>
                  ← Fix and retry
                </button>
                <button className="btn" onClick={handleClose}>Close</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer — only shown on configure step */}
        {step === "configure" && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--bd)", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0, background: "var(--bg2)" }}>
            <button className="btn" onClick={handleClose}>Cancel</button>
            <button
              className="btn"
              disabled={!canSend || sending}
              style={{ background: canSend ? "var(--acl)" : undefined, borderColor: canSend ? "var(--acg)" : undefined, color: canSend ? "var(--ac)" : undefined }}
              onClick={() => void handleSend()}
            >
              {sending ? "Sending…" : `Send to ${selected?.label ?? "destination"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
