import { useState, useRef } from "react";
import { api, validateFile } from "../../api";
import { capture } from "../../lib/posthog";
import { useUser } from "../../contexts/UserContext";

interface ImportModalProps {
  open: boolean;
  workspaceId?: string;
  onClose: () => void;
  onImported: () => void;
}

type SourceType = "file" | "snowflake" | "bigquery" | "redshift";

const sourceCards: Array<{ key: SourceType; label: string; description: string }> = [
  { key: "file", label: "File Upload", description: "CSV, Excel, JSON, Parquet" },
  { key: "snowflake", label: "Snowflake", description: "Warehouse + table or query" },
  { key: "bigquery", label: "BigQuery", description: "Project + table or SQL" },
  { key: "redshift", label: "Redshift", description: "Host + DB + table or query" },
];

interface FilePreview {
  filename: string;
  file_size_mb: number;
  row_count: number;
  column_count: number;
  columns: { name: string; type: string }[];
  encoding_converted: boolean;
  warnings: string[];
}


export function ImportModal({ open, workspaceId, onClose, onImported }: ImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { markFirstUpload } = useUser();
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [testResultText, setTestResultText] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>("file");
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);

  const [snowflake, setSnowflake] = useState({
    account: "",
    username: "",
    password: "",
    warehouse: "",
    database: "",
    schema: "PUBLIC",
    table: "",
    query: "",
  });
  const [bigquery, setBigquery] = useState({
    project_id: "",
    dataset: "",
    table: "",
    query: "",
    credentials_json: "",
  });
  const [redshift, setRedshift] = useState({
    host: "",
    port: "5439",
    database: "",
    username: "",
    password: "",
    schema: "public",
    table: "",
    query: "",
  });

  if (!open) return null;

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setFilePreview(null);
    setErrorText(null);
    if (!datasetName.trim()) {
      setDatasetName(file.name.replace(/\.[^/.]+$/, "") || file.name);
    }
    setIsValidating(true);
    try {
      const preview = await validateFile(file);
      setFilePreview(preview);
    } catch (err: unknown) {
      const maybeErr = err as { response?: { data?: { detail?: { message?: string } | string } } };
      const raw = maybeErr?.response?.data?.detail;
      const msg = raw && typeof raw === "object" ? raw.message : (typeof raw === "string" ? raw : "File validation failed.");
      setErrorText(msg ?? "File validation failed.");
      setSelectedFile(null);
    } finally {
      setIsValidating(false);
    }
  };

  const resetFileState = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setErrorText(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const connectorPayload = () => {
    if (sourceType === "snowflake") {
      return { type: "snowflake", ...snowflake };
    }
    if (sourceType === "bigquery") {
      return { type: "bigquery", ...bigquery };
    }
    return {
      type: "redshift",
      ...redshift,
      port: redshift.port ? Number(redshift.port) : 5439,
    };
  };

  const uploadFile = async () => {
    if (!selectedFile || isUploading) return;
    setErrorText(null);
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    if (datasetName.trim()) {
      formData.append("dataset_name", datasetName.trim());
    }
    try {
      await api.post("/import/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
        },
        timeout: 300000,
      });
      capture("file_uploaded", { type: selectedFile.type, size: selectedFile.size, workspace_id: workspaceId });
      markFirstUpload();
      onImported();
      onClose();
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: string } } };
      setErrorText(maybeError.response?.data?.detail ?? "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
      setDatasetName("");
      setSelectedFile(null);
      setFilePreview(null);
    }
  };

  const testConnection = async () => {
    if (sourceType === "file" || isTesting || isUploading) return;
    setErrorText(null);
    setTestResultText(null);
    setIsTesting(true);
    try {
      const response = await api.post("/import/test-connection", connectorPayload(), {
        headers: workspaceId ? { "X-Workspace-Id": workspaceId } : undefined,
        timeout: 120000,
      });
      if (response.data?.success) {
        setTestResultText(response.data?.message ?? "Connection successful");
      } else {
        setErrorText(response.data?.error ?? "Connection failed");
      }
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: string } } };
      setErrorText(maybeError.response?.data?.detail ?? "Connection test failed. Please check your settings.");
    } finally {
      setIsTesting(false);
    }
  };

  const importConnector = async () => {
    if (sourceType === "file" || isUploading) return;
    setErrorText(null);
    setTestResultText(null);
    setIsUploading(true);
    try {
      await api.post("/import/connector-import", {
        ...connectorPayload(),
        dataset_name: datasetName.trim() || undefined,
      }, {
        headers: workspaceId ? { "X-Workspace-Id": workspaceId } : undefined,
        timeout: 300000,
      });
      onImported();
      onClose();
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: string } } };
      setErrorText(maybeError.response?.data?.detail ?? "Import failed. Please try again.");
    } finally {
      setIsUploading(false);
      setDatasetName("");
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={{ marginBottom: 10 }}>Import Data Source</h3>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".csv,.xlsx,.xls,.json,.parquet"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            if (file) {
              void handleFileSelect(file);
            }
          }}
        />
        <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          <span style={{ color: "var(--tx1)", fontSize: 12 }}>Dataset name (optional)</span>
          <input
            value={datasetName}
            onChange={(event) => setDatasetName(event.target.value)}
            placeholder="Leave blank to use file name"
            disabled={isUploading}
            style={{
              height: 34,
              border: "1px solid var(--bd2)",
              borderRadius: "var(--r8)",
              background: "var(--bg2)",
              color: "var(--tx0)",
              padding: "0 10px",
            }}
          />
        </label>
        {sourceType === "file" && selectedFile && !filePreview && isValidating ? (
          <p style={{ marginTop: 10, color: "var(--tx2)", fontSize: 12 }}>Validating file…</p>
        ) : null}
        {sourceType === "file" && filePreview ? (
          <FilePreviewPanel preview={filePreview} onReset={resetFileState} />
        ) : (
          sourceType === "file" && selectedFile && !isValidating ? (
            <p style={{ marginBottom: 10, color: "var(--tx1)", fontSize: 12 }}>Selected file: {selectedFile.name}</p>
          ) : null
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {sourceCards.map((source) => (
            <button
              key={source.key}
              className="btn"
              disabled={isUploading || isTesting}
              style={{
                height: 56,
                justifyContent: "flex-start",
                textAlign: "left",
                borderColor: sourceType === source.key ? "var(--ac)" : "var(--bd2)",
                background: sourceType === source.key ? "var(--acl)" : "var(--bg3)",
              }}
              onClick={() => {
                setSourceType(source.key);
                setErrorText(null);
                setTestResultText(null);
                if (source.key === "file") {
                  fileRef.current?.click();
                }
              }}
            >
              <span style={{ display: "grid", gap: 2 }}>
                <strong style={{ fontSize: 12, color: "var(--tx0)" }}>{source.label}</strong>
                <span style={{ fontSize: 11, color: "var(--tx1)" }}>{source.description}</span>
              </span>
            </button>
          ))}
        </div>
        {sourceType !== "file" ? (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {sourceType === "snowflake" ? (
              <>
                <input value={snowflake.account} onChange={(event) => setSnowflake((prev) => ({ ...prev, account: event.target.value }))} placeholder="Account" style={inputStyle} />
                <input value={snowflake.username} onChange={(event) => setSnowflake((prev) => ({ ...prev, username: event.target.value }))} placeholder="Username" style={inputStyle} />
                <input value={snowflake.password} onChange={(event) => setSnowflake((prev) => ({ ...prev, password: event.target.value }))} placeholder="Password" type="password" style={inputStyle} />
                <input value={snowflake.warehouse} onChange={(event) => setSnowflake((prev) => ({ ...prev, warehouse: event.target.value }))} placeholder="Warehouse" style={inputStyle} />
                <input value={snowflake.database} onChange={(event) => setSnowflake((prev) => ({ ...prev, database: event.target.value }))} placeholder="Database" style={inputStyle} />
                <input value={snowflake.schema} onChange={(event) => setSnowflake((prev) => ({ ...prev, schema: event.target.value }))} placeholder="Schema (optional)" style={inputStyle} />
                <input value={snowflake.table} onChange={(event) => setSnowflake((prev) => ({ ...prev, table: event.target.value }))} placeholder="Table (or use query below)" style={inputStyle} />
                <textarea value={snowflake.query} onChange={(event) => setSnowflake((prev) => ({ ...prev, query: event.target.value }))} placeholder="Query (optional)" rows={3} style={textareaStyle} />
              </>
            ) : null}
            {sourceType === "bigquery" ? (
              <>
                <input value={bigquery.project_id} onChange={(event) => setBigquery((prev) => ({ ...prev, project_id: event.target.value }))} placeholder="Project ID" style={inputStyle} />
                <input value={bigquery.dataset} onChange={(event) => setBigquery((prev) => ({ ...prev, dataset: event.target.value }))} placeholder="Dataset (optional)" style={inputStyle} />
                <input value={bigquery.table} onChange={(event) => setBigquery((prev) => ({ ...prev, table: event.target.value }))} placeholder="Table (or use query below)" style={inputStyle} />
                <textarea value={bigquery.query} onChange={(event) => setBigquery((prev) => ({ ...prev, query: event.target.value }))} placeholder="Query (optional)" rows={3} style={textareaStyle} />
                <textarea value={bigquery.credentials_json} onChange={(event) => setBigquery((prev) => ({ ...prev, credentials_json: event.target.value }))} placeholder="Service account JSON (optional)" rows={4} style={textareaStyle} />
              </>
            ) : null}
            {sourceType === "redshift" ? (
              <>
                <input value={redshift.host} onChange={(event) => setRedshift((prev) => ({ ...prev, host: event.target.value }))} placeholder="Host" style={inputStyle} />
                <input value={redshift.port} onChange={(event) => setRedshift((prev) => ({ ...prev, port: event.target.value }))} placeholder="Port" style={inputStyle} />
                <input value={redshift.database} onChange={(event) => setRedshift((prev) => ({ ...prev, database: event.target.value }))} placeholder="Database" style={inputStyle} />
                <input value={redshift.username} onChange={(event) => setRedshift((prev) => ({ ...prev, username: event.target.value }))} placeholder="Username" style={inputStyle} />
                <input value={redshift.password} onChange={(event) => setRedshift((prev) => ({ ...prev, password: event.target.value }))} placeholder="Password" type="password" style={inputStyle} />
                <input value={redshift.schema} onChange={(event) => setRedshift((prev) => ({ ...prev, schema: event.target.value }))} placeholder="Schema (optional)" style={inputStyle} />
                <input value={redshift.table} onChange={(event) => setRedshift((prev) => ({ ...prev, table: event.target.value }))} placeholder="Table (or use query below)" style={inputStyle} />
                <textarea value={redshift.query} onChange={(event) => setRedshift((prev) => ({ ...prev, query: event.target.value }))} placeholder="Query (optional)" rows={3} style={textareaStyle} />
              </>
            ) : null}
          </div>
        ) : null}
        {errorText ? <p style={{ marginTop: 10, color: "var(--rd)", fontSize: 12 }}>{errorText}</p> : null}
        {testResultText ? <p style={{ marginTop: 10, color: "var(--gr)", fontSize: 12 }}>{testResultText}</p> : null}
        {isUploading ? <p style={{ marginTop: 10, color: "var(--tx2)", fontSize: 12 }}>Uploading...</p> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          {sourceType === "file" ? (
            <button className="btn btn-primary" onClick={() => void uploadFile()} disabled={!selectedFile || !filePreview || isUploading || isValidating} style={{ marginRight: 8 }}>
              {isUploading ? "Uploading..." : isValidating ? "Validating…" : filePreview ? "Upload File" : "Select a file first"}
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => void testConnection()} disabled={isTesting || isUploading} style={{ marginRight: 8 }}>
                {isTesting ? "Testing..." : "Test Connection"}
              </button>
              <button className="btn btn-primary" onClick={() => void importConnector()} disabled={isUploading || isTesting} style={{ marginRight: 8 }}>
                {isUploading ? "Importing..." : "Import from Connector"}
              </button>
            </>
          )}
          <button className="btn" onClick={onClose} disabled={isUploading}>Close</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#00000080",
  display: "grid",
  placeItems: "center",
  zIndex: 40,
};

const modal: React.CSSProperties = {
  width: "min(680px, 92vw)",
  background: "var(--bg1)",
  border: "1px solid var(--bd2)",
  borderRadius: "var(--r12)",
  padding: 14,
};

const inputStyle: React.CSSProperties = {
  height: 34,
  border: "1px solid var(--bd2)",
  borderRadius: "var(--r8)",
  background: "var(--bg2)",
  color: "var(--tx0)",
  padding: "0 10px",
};

const textareaStyle: React.CSSProperties = {
  border: "1px solid var(--bd2)",
  borderRadius: "var(--r8)",
  background: "var(--bg2)",
  color: "var(--tx0)",
  padding: "8px 10px",
  resize: "vertical",
};

// ── File Preview Panel ────────────────────────────────────────────────────────

interface FilePreviewPanelProps {
  preview: FilePreview;
  onReset: () => void;
}

function FilePreviewPanel({ preview, onReset }: FilePreviewPanelProps) {
  return (
    <div
      style={{
        background: "var(--bg2)",
        border: "1px solid var(--bd2)",
        borderRadius: "var(--r8)",
        padding: "12px",
        marginBottom: 12,
        display: "grid",
        gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx0)" }}>{preview.filename}</span>
          <span style={{ fontSize: 11, color: "var(--tx2)", marginLeft: 8 }}>
            {preview.file_size_mb.toFixed(2)} MB
          </span>
        </div>
        <button
          className="btn"
          style={{ fontSize: 11, padding: "2px 8px" }}
          onClick={onReset}
        >
          Change file
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 20 }}>
        <Stat label="Rows" value={preview.row_count.toLocaleString()} />
        <Stat label="Columns" value={String(preview.column_count)} />
        {preview.encoding_converted ? (
          <Stat label="Encoding" value="Auto-converted to UTF-8" accent="var(--or)" />
        ) : null}
      </div>

      {/* Column schema preview */}
      <div>
        <p style={{ fontSize: 11, color: "var(--tx1)", marginBottom: 6 }}>
          Schema preview (first 8 columns):
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 6,
          }}
        >
          {preview.columns.slice(0, 8).map((col) => (
            <div
              key={col.name}
              style={{
                background: "var(--bg3)",
                border: "1px solid var(--bd)",
                borderRadius: 4,
                padding: "4px 8px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--tx0)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={col.name}
              >
                {col.name}
              </div>
              <div style={{ fontSize: 10, color: "var(--tx2)", fontFamily: "monospace" }}>
                {col.type}
              </div>
            </div>
          ))}
          {preview.column_count > 8 ? (
            <div
              style={{
                background: "var(--bg3)",
                border: "1px solid var(--bd)",
                borderRadius: 4,
                padding: "4px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--tx2)" }}>
                +{preview.column_count - 8} more
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Warnings */}
      {preview.warnings.map((w, i) => (
        <p key={i} style={{ fontSize: 11, color: "var(--or)", margin: 0 }}>
          ⚠ {w}
        </p>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--tx2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent ?? "var(--tx0)" }}>{value}</div>
    </div>
  );
}
