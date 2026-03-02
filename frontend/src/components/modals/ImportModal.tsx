import { useState, useRef } from "react";
import { api } from "../../api";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const sources = [
  "File upload (CSV, Excel, JSON, Parquet)",
  "PostgreSQL",
  "Snowflake",
  "Amazon S3",
  "Google BigQuery",
  "Google Sheets",
];

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  if (!open) return null;

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
        headers: { "Content-Type": "multipart/form-data" },
      });
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
            setSelectedFile(file);
            if (file && !datasetName.trim()) {
              const suggested = file.name.replace(/\.[^/.]+$/, "");
              setDatasetName(suggested || file.name);
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
        {selectedFile ? <p style={{ marginBottom: 10, color: "var(--tx1)", fontSize: 12 }}>Selected file: {selectedFile.name}</p> : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {sources.map((source) => (
            <button
              key={source}
              className="btn"
              disabled={isUploading}
              style={{ height: 56, justifyContent: "flex-start", textAlign: "left" }}
              onClick={() => {
                if (source.startsWith("File upload")) {
                  fileRef.current?.click();
                }
              }}
            >
              {source}
            </button>
          ))}
        </div>
        {errorText ? <p style={{ marginTop: 10, color: "var(--rd)", fontSize: 12 }}>{errorText}</p> : null}
        {isUploading ? <p style={{ marginTop: 10, color: "var(--tx2)", fontSize: 12 }}>Uploading...</p> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn btn-primary" onClick={() => void uploadFile()} disabled={!selectedFile || isUploading} style={{ marginRight: 8 }}>
            {isUploading ? "Uploading..." : "Upload Selected File"}
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
