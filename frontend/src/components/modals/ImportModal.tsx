import { useEffect, useState, useRef } from "react";
import { api, validateFile } from "../../api";
import { capture } from "../../lib/posthog";
import { useUser } from "../../contexts/UserContext";

interface ImportModalProps {
  open: boolean;
  workspaceId?: string;
  onClose: () => void;
  onImported: () => void;
  preloadUrl?: string;
}

type FileType = "csv" | "excel" | "json" | "parquet";

const FILE_TYPES: Array<{ key: FileType; label: string; ext: string; accept: string; icon: string }> = [
  { key: "csv",     label: "CSV",     ext: ".csv",                  accept: ".csv,.tsv,.txt",      icon: "CSV" },
  { key: "excel",  label: "Excel",   ext: ".xlsx / .xls",          accept: ".xlsx,.xls",           icon: "XLS" },
  { key: "json",   label: "JSON",    ext: ".json",                 accept: ".json",                icon: "JSON" },
  { key: "parquet",label: "Parquet", ext: ".parquet",              accept: ".parquet",             icon: "PAR" },
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


export function ImportModal({ open, workspaceId, onClose, onImported, preloadUrl }: ImportModalProps) {
  // One hidden <input> per file type so accept filter changes correctly
  const csvRef     = useRef<HTMLInputElement>(null);
  const excelRef   = useRef<HTMLInputElement>(null);
  const jsonRef    = useRef<HTMLInputElement>(null);
  const parquetRef = useRef<HTMLInputElement>(null);
  const fileRef = csvRef; // used by preloadUrl path (CSV)
  const { markFirstUpload } = useUser();
  const [isUploading, setIsUploading]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isValidating, setIsValidating]   = useState(false);
  const [errorText, setErrorText]         = useState<string | null>(null);
  const [datasetName, setDatasetName]     = useState("");
  const [selectedFile, setSelectedFile]   = useState<File | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<FileType | null>(null);
  const [filePreview, setFilePreview]     = useState<FilePreview | null>(null);
  const [customDelimiter, setCustomDelimiter] = useState("");
  const [isDragOver, setIsDragOver]       = useState(false);

  // Auto-load a sample file when preloadUrl is provided
  useEffect(() => {
    if (!preloadUrl || !open) return;
    void (async () => {
      try {
        const res = await fetch(preloadUrl);
        if (!res.ok) throw new Error("Failed to fetch sample");
        const blob = await res.blob();
        const filename = preloadUrl.split("/").pop() ?? "sample.csv";
        const file = new File([blob], filename, { type: blob.type || "text/csv" });
        setSelectedFile(file);
        setFilePreview(null);
        setErrorText(null);
        setDatasetName(filename.replace(/\.[^/.]+$/, "") || filename);
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
      } catch {
        setErrorText("Failed to load sample file.");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadUrl, open]);

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
    setSelectedFileType(null);
    setFilePreview(null);
    setErrorText(null);
    setCustomDelimiter("");
    for (const ref of [csvRef, excelRef, jsonRef, parquetRef]) {
      if (ref.current) ref.current.value = "";
    }
  };

  const detectFileType = (file: File): FileType => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "excel";
    if (name.endsWith(".json")) return "json";
    if (name.endsWith(".parquet")) return "parquet";
    return "csv";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ft = detectFileType(file);
    setSelectedFileType(ft);
    void handleFileSelect(file);
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
    // Only Parquet files can use direct-to-S3 upload.
    // CSV/Excel/JSON must go through the server for conversion.
    const isParquet = /\.parquet$/i.test(selectedFile.name);

    try {
      if (selectedFile.size > PRESIGN_THRESHOLD && isParquet) {
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
        // Pass custom delimiter for CSV files when the user specified one
        if (selectedFileType === "csv" && customDelimiter.trim()) {
          formData.append("delimiter", customDelimiter.trim());
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
      for (const ref of [csvRef, excelRef, jsonRef, parquetRef]) {
        if (ref.current) ref.current.value = "";
      }
      setDatasetName("");
      setSelectedFile(null);
      setSelectedFileType(null);
      setFilePreview(null);
      setCustomDelimiter("");
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
      <div
        style={{
          ...modal,
          outline: isDragOver ? "2px dashed var(--ac, #5B6AF0)" : "2px solid transparent",
          outlineOffset: -2,
          transition: "outline-color 0.15s",
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <h3 style={{ marginBottom: 10 }}>Import Data Source</h3>
        {isDragOver && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: "var(--r12)", zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(91,106,240,0.12)", backdropFilter: "blur(2px)",
            pointerEvents: "none",
          }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--ac, #5B6AF0)" }}>Drop file to import</span>
          </div>
        )}

        {/* One hidden input per file type so the accept filter is exact */}
        {FILE_TYPES.map((ft) => (
          <input
            key={ft.key}
            ref={ft.key === "csv" ? csvRef : ft.key === "excel" ? excelRef : ft.key === "json" ? jsonRef : parquetRef}
            type="file"
            hidden
            accept={ft.accept}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file) {
                setSelectedFileType(ft.key);
                void handleFileSelect(file);
              }
            }}
          />
        ))}

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

        {/* File type selection buttons */}
        {!selectedFile && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 6 }}>
            {FILE_TYPES.map((ft) => (
              <button
                key={ft.key}
                className="btn"
                disabled={isUploading}
                style={{
                  height: 64,
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  borderColor: selectedFileType === ft.key ? "var(--ac)" : "var(--bd2)",
                  background: selectedFileType === ft.key ? "var(--acl)" : "var(--bg3)",
                }}
                onClick={() => {
                  setErrorText(null);
                  const refMap = { csv: csvRef, excel: excelRef, json: jsonRef, parquet: parquetRef };
                  refMap[ft.key].current?.click();
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--ac)", background: "var(--acl)", borderRadius: 4, padding: "2px 6px" }}>{ft.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tx0)" }}>{ft.label}</span>
              </button>
            ))}
          </div>
        )}
        {!selectedFile && (
          <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--tx2, #888)", textAlign: "center" }}>
            Click a file type above or drag &amp; drop a file anywhere in this window
          </p>
        )}

        {/* CSV custom delimiter — only shown when a CSV is selected and not yet previewed */}
        {selectedFileType === "csv" && !filePreview && !isValidating && (
          <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            <span style={{ color: "var(--tx1)", fontSize: 12 }}>
              Custom delimiter <span style={{ color: "var(--tx2)", fontWeight: 400 }}>(optional — leave blank to auto-detect)</span>
            </span>
            <input
              value={customDelimiter}
              onChange={(e) => setCustomDelimiter(e.target.value)}
              placeholder={`e.g.  |  or  ;  or  \\t  for tab`}
              maxLength={4}
              disabled={isUploading}
              style={{
                height: 34,
                border: "1px solid var(--bd2)",
                borderRadius: "var(--r8)",
                background: "var(--bg2)",
                color: "var(--tx0)",
                padding: "0 10px",
                fontFamily: "monospace",
                width: 200,
              }}
            />
          </label>
        )}

        {/* Validation / preview state */}
        {selectedFile && !filePreview && isValidating ? (
          <p style={{ marginTop: 10, color: "var(--tx2)", fontSize: 12 }}>Validating file…</p>
        ) : null}
        {filePreview ? (
          <FilePreviewPanel preview={filePreview} onReset={resetFileState} />
        ) : (
          selectedFile && !isValidating ? (
            <p style={{ marginBottom: 10, color: "var(--tx1)", fontSize: 12 }}>Selected: {selectedFile.name}</p>
          ) : null
        )}
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
  position: "relative",
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
