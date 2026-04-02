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

type SourceType = "file";

const sourceCards: Array<{ key: SourceType; label: string; description: string }> = [
  { key: "file", label: "File Upload", description: "CSV, Excel, JSON, Parquet" },
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceType] = useState<SourceType>("file");
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);

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


  const uploadFile = async () => {
    if (!selectedFile || isUploading) return;
    setErrorText(null);
    setIsUploading(true);
    setUploadProgress(0);

    const extraHeaders = workspaceId ? { "X-Workspace-Id": workspaceId } : {};

    // Files larger than 50 MB use the presigned direct-to-S3 flow so that
    // the Render server never buffers the bytes in RAM.
    const PRESIGN_THRESHOLD = 50 * 1024 * 1024;

    try {
      if (selectedFile.size > PRESIGN_THRESHOLD) {
        // ── Step 1: obtain presigned PUT URL ────────────────────────────────
        const presignRes = await api.post(
          "/import/presign",
          {
            filename: selectedFile.name,
            file_size_bytes: selectedFile.size,
            ...(datasetName.trim() ? { dataset_name: datasetName.trim() } : {}),
          },
          { headers: extraHeaders },
        );
        const { dataset_id, presigned_url } = presignRes.data as {
          dataset_id: string;
          presigned_url: string;
        };

        // ── Step 2: PUT directly to S3/R2 with progress ─────────────────────
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", presigned_url);
          xhr.setRequestHeader("Content-Type", "application/octet-stream");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              // Reserve the last 10 % for finalize round-trip
              setUploadProgress(Math.round((e.loaded / e.total) * 90));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`S3 PUT failed with status ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error("Network error during S3 upload"));
          xhr.send(selectedFile);
        });

        // ── Step 3: finalize (schema extraction + DB records) ────────────────
        setUploadProgress(92);
        await api.post(
          "/import/finalize",
          { dataset_id, filename: selectedFile.name },
          { headers: extraHeaders },
        );
        setUploadProgress(100);
      } else {
        // ── Small files: server-side upload (existing path) ──────────────────
        const formData = new FormData();
        formData.append("file", selectedFile);
        if (datasetName.trim()) {
          formData.append("dataset_name", datasetName.trim());
        }
        await api.post("/import/upload", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
            ...extraHeaders,
          },
          timeout: 300000,
        });
      }

      capture("file_uploaded", {
        type: selectedFile.type,
        size: selectedFile.size,
        workspace_id: workspaceId,
        presigned: selectedFile.size > PRESIGN_THRESHOLD,
      });
      markFirstUpload();
      onImported();
      onClose();
    } catch (error: unknown) {
      const maybeError = error as { response?: { data?: { detail?: unknown } } };
      const detail = maybeError.response?.data?.detail;
      if (detail && typeof detail === "object" && (detail as Record<string, unknown>).error === "file_too_large") {
        setErrorText((detail as Record<string, unknown>).message as string);
      } else if (typeof detail === "string") {
        setErrorText(detail);
      } else if (error instanceof Error) {
        setErrorText(error.message);
      } else {
        setErrorText("Upload failed. Please try again.");
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
      setDatasetName("");
      setSelectedFile(null);
      setFilePreview(null);
    }
  };

  const testConnection = async () => {
    // Only file uploads are supported in this modal; DB connections use the Connector modal.
    return;
  };

  const importConnector = async () => {
    // Only file uploads are supported in this modal; DB connections use the Connector modal.
    return;
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
              disabled={isUploading}
              style={{
                height: 56,
                justifyContent: "flex-start",
                textAlign: "left",
                borderColor: sourceType === source.key ? "var(--ac)" : "var(--bd2)",
                background: sourceType === source.key ? "var(--acl)" : "var(--bg3)",
              }}
              onClick={() => {
                setErrorText(null);
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
        {errorText ? <p style={{ marginTop: 10, color: "var(--rd)", fontSize: 12 }}>{errorText}</p> : null}
        {isUploading ? (
          <div style={{ marginTop: 10 }}>
            <p style={{ color: "var(--tx2)", fontSize: 12, marginBottom: 4 }}>
              {uploadProgress < 90 ? `Uploading… ${uploadProgress}%` : uploadProgress < 100 ? "Finalising…" : "Done!"}
            </p>
            <div style={{ height: 4, background: "var(--bd2)", borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${uploadProgress}%`,
                  background: "var(--ac)",
                  borderRadius: 2,
                  transition: "width 0.15s ease",
                }}
              />
            </div>
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn btn-primary" onClick={() => void uploadFile()} disabled={!selectedFile || !filePreview || isUploading || isValidating} style={{ marginRight: 8 }}>
            {isUploading ? "Uploading..." : isValidating ? "Validating…" : filePreview ? "Upload File" : "Select a file first"}
          </button>
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
