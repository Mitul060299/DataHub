import { useEffect, useState } from "react";
import { api } from "../api";

interface Version {
  id: string;
  name: string;
  version_number: number;
  version_note: string | null;
  row_count: number;
  columns: string[];
  created_at: string | null;
  parent_id: string | null;
  is_current: boolean;
}

interface DataVersionHistoryProps {
  datasetId: string;
  onSwitchVersion?: (versionId: string) => void;
}

export function DataVersionHistory({ datasetId, onSwitchVersion }: DataVersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<{ versions: Version[] }>(`/datasets/${datasetId}/versions`)
      .then((r) => setVersions(r.data.versions))
      .catch(() => setError("Failed to load version history."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (datasetId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx1)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Version History
        </span>
        <button
          className="btn"
          style={{ fontSize: 11, padding: "3px 8px" }}
          onClick={() => setUploadOpen((o) => !o)}
        >
          + New Version
        </button>
      </div>

      {/* Upload new version panel */}
      {uploadOpen ? (
        <UploadVersionPanel
          datasetId={datasetId}
          onUploaded={() => {
            setUploadOpen(false);
            load();
          }}
          onCancel={() => setUploadOpen(false)}
        />
      ) : null}

      {/* Version list */}
      {loading ? (
        <p style={{ color: "var(--tx2)", fontSize: 12 }}>Loading…</p>
      ) : error ? (
        <p style={{ color: "var(--rd)", fontSize: 12 }}>{error}</p>
      ) : versions.length === 0 ? (
        <p style={{ color: "var(--tx2)", fontSize: 12 }}>No versions found.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {[...versions].reverse().map((v) => (
            <VersionRow
              key={v.id}
              version={v}
              onSwitch={onSwitchVersion ? () => onSwitchVersion(v.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VersionRow({
  version,
  onSwitch,
}: {
  version: Version;
  onSwitch?: () => void;
}) {
  const date = version.created_at
    ? new Date(version.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "–";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        background: version.is_current ? "var(--acl)" : "var(--bg2)",
        border: `1px solid ${version.is_current ? "var(--ac)" : "var(--bd)"}`,
        borderRadius: 8,
        padding: "8px 10px",
        gap: 10,
      }}
    >
      <div style={{ display: "grid", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: "var(--bg3)",
              border: "1px solid var(--bd2)",
              borderRadius: 4,
              padding: "1px 6px",
              color: "var(--tx0)",
            }}
          >
            v{version.version_number}
          </span>
          {version.is_current ? (
            <span
              style={{
                fontSize: 10,
                color: "var(--ac)",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              current
            </span>
          ) : null}
        </div>
        {version.version_note ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--tx0)" }}>{version.version_note}</p>
        ) : null}
        <p style={{ margin: 0, fontSize: 11, color: "var(--tx2)" }}>
          {version.row_count.toLocaleString()} rows · {version.columns.length} cols · {date}
        </p>
      </div>
      {!version.is_current && onSwitch ? (
        <button
          className="btn"
          style={{ fontSize: 11, padding: "3px 8px", flexShrink: 0 }}
          onClick={onSwitch}
        >
          Switch
        </button>
      ) : null}
    </div>
  );
}

function UploadVersionPanel({
  datasetId,
  onUploaded,
  onCancel,
}: {
  datasetId: string;
  onUploaded: () => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    if (note.trim()) form.append("version_note", note.trim());
    try {
      await api.post(`/datasets/${datasetId}/upload-version`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      onUploaded();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: { message?: string } | string } } };
      const raw = e?.response?.data?.detail;
      setError(
        (raw && typeof raw === "object" ? (raw as { message?: string }).message : typeof raw === "string" ? raw : null) ?? "Upload failed."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--bg2)",
        border: "1px solid var(--bd2)",
        borderRadius: 8,
        padding: "10px 12px",
        display: "grid",
        gap: 8,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--tx0)" }}>
        Upload New Version
      </p>
      <input
        type="file"
        accept=".csv,.xlsx,.xls,.json,.parquet"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        style={{ fontSize: 12, color: "var(--tx1)" }}
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Version note (optional)"
        style={{
          height: 32,
          border: "1px solid var(--bd2)",
          borderRadius: 6,
          background: "var(--bg3)",
          color: "var(--tx0)",
          padding: "0 8px",
          fontSize: 12,
        }}
      />
      {error ? <p style={{ color: "var(--rd)", fontSize: 12, margin: 0 }}>{error}</p> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!file || uploading}
          onClick={() => void handleUpload()}
          style={{ fontSize: 12, padding: "5px 14px" }}
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <button
          className="btn"
          onClick={onCancel}
          disabled={uploading}
          style={{ fontSize: 12, padding: "5px 10px" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
