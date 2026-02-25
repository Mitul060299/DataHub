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

  if (!open) return null;

  const uploadFile = async (file?: File | null) => {
    if (!file || isUploading) return;
    setErrorText(null);
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
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
          onChange={(event) => void uploadFile(event.target.files?.[0])}
        />
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
