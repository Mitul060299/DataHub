import { useState, useEffect } from "react";
import {
  testConnector,
  saveConnection,
  listConnections,
  listConnectionTables,
  deleteConnection,
  importFromConnection,
  submitFeedbackForm,
  type SavedConnection,
  type ConnectionTable,
} from "../../api";

// ── Connector catalogue ────────────────────────────────────────────────────────

interface ConnectorDef {
  id: string;
  label: string;
  icon: string;
  description: string;
  locked?: boolean;
  lockedLabel?: string;
  /** True for SQL databases/warehouses that support DirectQuery (query folding).
   *  False/absent for file/object connectors (S3, GCS, Azure Blob, Google Sheets,
   *  SQLite) where DirectQuery has no meaning — Import is the only option. */
  supportsDirectQuery?: boolean;
  fields: FieldDef[];
}

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "password";
  placeholder?: string;
  defaultValue?: string | number;
  required?: boolean;
}

const CONNECTORS: ConnectorDef[] = [
  // ── File / SaaS connectors (Import-only — no SQL engine to fold to) ─────
  {
    id: "google_sheets",
    label: "Google Sheets",
    icon: "📊",
    description: "Import from a public Google Sheet",
    supportsDirectQuery: false,
    fields: [
      { key: "sheet_url", label: "Sheet URL", type: "text", placeholder: "https://docs.google.com/spreadsheets/d/...", required: true },
      { key: "gid", label: "Sheet tab ID (gid)", type: "number", placeholder: "0 (first tab)", defaultValue: "0" },
    ],
  },
  // ── SQL databases — Import or DirectQuery ──────────────────────────────
  {
    id: "postgresql",
    label: "PostgreSQL",
    icon: "🐘",
    description: "Connect to a PostgreSQL database",
    supportsDirectQuery: true,
    fields: [
      { key: "host", label: "Host", type: "text", placeholder: "db.example.com", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "5432", defaultValue: "5432" },
      { key: "database", label: "Database", type: "text", placeholder: "my_database", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "postgres", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
      { key: "schema", label: "Schema (optional)", type: "text", placeholder: "public", defaultValue: "public" },
    ],
  },
  {
    id: "mysql",
    label: "MySQL",
    icon: "🐬",
    description: "Connect to a MySQL / MariaDB database",
    supportsDirectQuery: true,
    fields: [
      { key: "host", label: "Host", type: "text", placeholder: "db.example.com", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "3306", defaultValue: "3306" },
      { key: "database", label: "Database", type: "text", placeholder: "my_database", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "root", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
    ],
  },
  {
    id: "sqlite",
    label: "SQLite",
    icon: "🗄️",
    description: "Connect to a SQLite database file",
    supportsDirectQuery: false,  // local file — no live remote source
    fields: [
      { key: "file_path", label: "File path", type: "text", placeholder: "/data/mydb.sqlite", required: true },
      { key: "table", label: "Table (optional)", type: "text", placeholder: "my_table" },
      { key: "query", label: "Custom SQL (optional)", type: "text", placeholder: "SELECT * FROM my_table" },
    ],
  },
  {
    id: "mssql",
    label: "SQL Server",
    icon: "🪟",
    description: "Connect to Microsoft SQL Server",
    supportsDirectQuery: true,
    fields: [
      { key: "host", label: "Host", type: "text", placeholder: "db.example.com", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "1433", defaultValue: "1433" },
      { key: "database", label: "Database", type: "text", placeholder: "my_database", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "sa", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
      { key: "schema", label: "Schema (optional)", type: "text", placeholder: "dbo", defaultValue: "dbo" },
    ],
  },
  {
    id: "oracle",
    label: "Oracle",
    icon: "🔶",
    description: "Connect to Oracle Database",
    supportsDirectQuery: true,
    fields: [
      { key: "host", label: "Host", type: "text", placeholder: "db.example.com", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "1521", defaultValue: "1521" },
      { key: "service_name", label: "Service name", type: "text", placeholder: "ORCL", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "scott", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
    ],
  },
  // ── Cloud SQL warehouses — Import or DirectQuery (coming soon) ──────────
  {
    id: "snowflake",
    label: "Snowflake",
    icon: "❄️",
    description: "Snowflake data warehouse",
    locked: true,
    lockedLabel: "coming soon",
    supportsDirectQuery: true,
    fields: [
      { key: "account", label: "Account", type: "text", placeholder: "xy12345.us-east-1", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "my_user", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
      { key: "warehouse", label: "Warehouse", type: "text", placeholder: "COMPUTE_WH", required: true },
      { key: "database", label: "Database", type: "text", placeholder: "MY_DB", required: true },
      { key: "schema", label: "Schema (optional)", type: "text", placeholder: "PUBLIC", defaultValue: "PUBLIC" },
    ],
  },
  {
    id: "bigquery",
    label: "BigQuery",
    icon: "☁️",
    description: "Google BigQuery",
    locked: true,
    lockedLabel: "coming soon",
    supportsDirectQuery: true,
    fields: [
      { key: "project_id", label: "Project ID", type: "text", placeholder: "my-gcp-project", required: true },
      { key: "dataset", label: "Dataset", type: "text", placeholder: "my_dataset", required: true },
      { key: "credentials_json", label: "Service account key (JSON)", type: "password", placeholder: "{\"type\": \"service_account\"...}", required: true },
    ],
  },
  {
    id: "redshift",
    label: "Redshift",
    icon: "🔴",
    description: "Amazon Redshift",
    locked: true,
    lockedLabel: "coming soon",
    supportsDirectQuery: true,
    fields: [
      { key: "host", label: "Host", type: "text", placeholder: "my-cluster.abc123.us-east-1.redshift.amazonaws.com", required: true },
      { key: "port", label: "Port", type: "number", placeholder: "5439", defaultValue: "5439" },
      { key: "database", label: "Database", type: "text", placeholder: "dev", required: true },
      { key: "username", label: "Username", type: "text", placeholder: "awsuser", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
      { key: "schema", label: "Schema (optional)", type: "text", placeholder: "public", defaultValue: "public" },
    ],
  },
  // ── Object storage — Import-only (downloads a file, no SQL engine) ─────
  {
    id: "s3",
    label: "Amazon S3",
    icon: "🪣",
    description: "Import CSV, Parquet, or JSON from S3",
    locked: true,
    lockedLabel: "coming soon",
    supportsDirectQuery: false,
    fields: [
      { key: "access_key_id", label: "Access Key ID", type: "text", placeholder: "AKIAIOSFODNN7EXAMPLE", required: true },
      { key: "secret_access_key", label: "Secret Access Key", type: "password", placeholder: "••••••••", required: true },
      { key: "region", label: "Region", type: "text", placeholder: "us-east-1", defaultValue: "us-east-1" },
      { key: "bucket", label: "Bucket", type: "text", placeholder: "my-bucket", required: true },
      { key: "key", label: "File path (key)", type: "text", placeholder: "data/file.csv", required: true },
    ],
  },
  {
    id: "gcs",
    label: "Google Cloud Storage",
    icon: "🗂️",
    description: "Import CSV, Parquet, or JSON from GCS",
    locked: true,
    lockedLabel: "coming soon",
    supportsDirectQuery: false,
    fields: [
      { key: "project_id", label: "Project ID", type: "text", placeholder: "my-gcp-project" },
      { key: "bucket", label: "Bucket", type: "text", placeholder: "my-bucket", required: true },
      { key: "key", label: "File path", type: "text", placeholder: "data/file.parquet", required: true },
      { key: "credentials_json", label: "Service account key (JSON, optional)", type: "password", placeholder: "{\"type\": \"service_account\"...}" },
    ],
  },
  {
    id: "azure_blob",
    label: "Azure Blob Storage",
    icon: "🔷",
    description: "Import CSV, Parquet, or JSON from Azure Blob",
    locked: true,
    lockedLabel: "coming soon",
    supportsDirectQuery: false,
    fields: [
      { key: "connection_string", label: "Connection string", type: "password", placeholder: "DefaultEndpointsProtocol=https;AccountName=..." },
      { key: "container", label: "Container", type: "text", placeholder: "my-container", required: true },
      { key: "key", label: "File path (blob)", type: "text", placeholder: "data/file.csv", required: true },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface ConnectorModalProps {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
  projectId?: string;
}

type Step = "pick" | "configure" | "browse";

export function ConnectorModal({ open, onClose, onImported, projectId }: ConnectorModalProps) {
  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<ConnectorDef | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [connName, setConnName] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [tables, setTables] = useState<ConnectionTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [importedTables, setImportedTables] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Saved connections
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Waitlist for coming-soon connectors
  const [waitlistConnector, setWaitlistConnector] = useState<string | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  // Import mode: 'cached' = full snapshot, 'live' = sample only + query folding
  const [importMode, setImportMode] = useState<"cached" | "live">("cached");
  // Whether the user explicitly chose a mode in the configure step (vs arriving
  // from a saved connection that skips configure)
  const [modeChosen, setModeChosen] = useState(false);

  // Load saved connections whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setLoadingSaved(true);
    listConnections()
      .then(({ connections }) => setSavedConnections(connections))
      .catch(() => setSavedConnections([]))
      .finally(() => setLoadingSaved(false));
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setStep("pick");
    setSelected(null);
    setFields({});
    setConnName("");
    setTesting(false);
    setTestResult(null);
    setSaving(false);
    setSavedId(null);
    setTables([]);
    setLoadingTables(false);
    setImporting(null);
    setImportedTables(new Set());
    setError(null);
    setImportMode("cached");
    setModeChosen(false);
  };

  const handleClose = () => { reset(); onClose(); };

  // Re-open a previously saved connection (go straight to browse)
  const openSavedConnection = async (conn: SavedConnection) => {
    const def = CONNECTORS.find((c) => c.id === conn.type) ?? null;
    setSelected(def);
    setSavedId(conn.id);
    setConnName(conn.name);
    setError(null);
    setModeChosen(false);  // user hasn't picked a mode yet — show selector in browse
    setImportMode("cached");
    setStep("browse");
    setLoadingTables(true);
    setTables([]);
    setImportedTables(new Set());
    try {
      const { tables: t } = await listConnectionTables(conn.id);
      setTables(t);
    } catch {
      setError("Failed to load tables for this connection.");
    } finally {
      setLoadingTables(false);
    }
  };

  const handleDeleteConnection = async (e: React.MouseEvent, connId: string) => {
    e.stopPropagation();
    setDeletingId(connId);
    try {
      await deleteConnection(connId);
      setSavedConnections((prev) => prev.filter((c) => c.id !== connId));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const pickConnector = (c: ConnectorDef) => {
    if (c.locked) {
      setWaitlistConnector(c.label);
      setWaitlistEmail("");
      setWaitlistDone(false);
      return;
    }
    const defaults: Record<string, string> = {};
    for (const f of c.fields) {
      if (f.defaultValue !== undefined) defaults[f.key] = String(f.defaultValue);
    }
    setSelected(c);
    setFields(defaults);
    setConnName(c.label);
    setTestResult(null);
    setError(null);
    setStep("configure");
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;
    setWaitlistSubmitting(true);
    try {
      await submitFeedbackForm({
        name: "Connector waitlist",
        email: waitlistEmail.trim(),
        subject: `Connector waitlist: ${waitlistConnector}`,
        message: `User wants ${waitlistConnector} connector.`,
      });
    } catch {
      // Silently succeed — don't block the user
    } finally {
      setWaitlistSubmitting(false);
      setWaitlistDone(true);
    }
  };

  const buildConfig = (): Record<string, unknown> => {
    if (!selected) return {};
    if (selected.id === "google_sheets") {
      const url = fields["sheet_url"] || "";
      const match = url.match(/\/spreadsheets\/d\/([^/]+)/);
      const sheet_id = match ? match[1] : url;
      return { sheet_id, gid: parseInt(fields["gid"] || "0", 10) };
    }
    return { ...fields, port: fields["port"] ? parseInt(fields["port"], 10) : undefined };
  };

  const handleTest = async () => {
    if (!selected) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await testConnector(selected.id, buildConfig());
      setTestResult(result);
    } catch {
      setTestResult({ success: false, error: "Network error — check the connection details." });
    } finally {
      setTesting(false);
    }
  };

  // For Google Sheets: skip save, import directly
  const handleGoogleSheetsImport = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await importFromConnection("", selected.id, buildConfig(), undefined, projectId);
      onImported?.();
      handleClose();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Import failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndBrowse = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const conn = await saveConnection(connName || selected.label, selected.id, buildConfig());
      setSavedId(conn.id);
      setSavedConnections((prev) => [conn, ...prev]);
      setModeChosen(true);  // user saw the mode selector in configure step
      setStep("browse");
      setLoadingTables(true);
      const { tables: t } = await listConnectionTables(conn.id);
      setTables(t);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to save connection.");
    } finally {
      setSaving(false);
      setLoadingTables(false);
    }
  };

  const handleImportTable = async (table: string) => {
    if (!savedId || !selected) return;
    setImporting(table);
    setError(null);
    try {
      // Pass connection_id so backend loads credentials from ImportConnectionDB;
      // pass project_id so the dataset appears under the active project.
      await importFromConnection(savedId, selected.id, buildConfig(), table, projectId, importMode);
      setImportedTables((prev) => new Set(prev).add(table));
      onImported?.();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Import failed.");
    } finally {
      setImporting(null);
    }
  };

  const input: React.CSSProperties = {
    width: "100%",
    background: "var(--bg3, #18181e)",
    border: "1px solid var(--bd, #2e2e3a)",
    borderRadius: 6,
    color: "var(--tx0, #e8e8f0)",
    fontSize: 13,
    padding: "7px 10px",
    outline: "none",
    boxSizing: "border-box",
  };

  const label: React.CSSProperties = {
    fontSize: 11,
    color: "var(--tx1, #8888a0)",
    marginBottom: 4,
    display: "block",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add database connection"
      style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} />

      {/* Panel */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 560,
          maxHeight: "85vh",
          background: "var(--bg2, #111115)",
          border: "1px solid var(--bd, #2e2e3a)",
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          margin: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--bd, #2e2e3a)", flexShrink: 0 }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--tx0, #e8e8f0)" }}>
              {step === "pick" ? "Add connection" : step === "configure" ? `Connect ${selected?.label}` : `${selected?.label} tables`}
            </p>
            {step !== "pick" && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--tx1, #8888a0)", marginTop: 2 }}>
                {step === "configure"
                  ? "Enter credentials, choose connection type, then connect"
                  : importMode === "live"
                    ? "Select a table to connect via DirectQuery"
                    : "Select a table to import as a dataset"}
              </p>
            )}
          </div>
          <button onClick={handleClose} style={{ background: "transparent", border: "none", color: "var(--tx1, #8888a0)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>

          {/* ── Step: pick ── */}
          {step === "pick" && (
            <>
            {/* Saved connections */}
            {(loadingSaved || savedConnections.length > 0) && (
              <div style={{ marginBottom: 18 }}>
                <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--tx1, #8888a0)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Saved connections
                </p>
                {loadingSaved ? (
                  <p style={{ fontSize: 12, color: "var(--tx1, #8888a0)" }}>Loading…</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {savedConnections.map((conn) => (
                      <button
                        key={conn.id}
                        onClick={() => void openSavedConnection(conn)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "9px 12px",
                          background: "var(--bg3, #18181e)",
                          border: "1px solid var(--bd, #2e2e3a)",
                          borderRadius: 8,
                          cursor: "pointer",
                          textAlign: "left",
                          width: "100%",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <span style={{ fontSize: 18, flexShrink: 0 }}>
                            {CONNECTORS.find((c) => c.id === conn.type)?.icon ?? "🔌"}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--tx0, #e8e8f0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {conn.name}
                            </p>
                            <p style={{ margin: 0, fontSize: 11, color: "var(--tx1, #8888a0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {conn.host ?? conn.type}{conn.database ? ` / ${conn.database}` : ""}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => void handleDeleteConnection(e, conn.id)}
                          disabled={deletingId === conn.id}
                          title="Remove saved connection"
                          style={{ background: "transparent", border: "none", color: "var(--tx1, #8888a0)", fontSize: 14, cursor: "pointer", padding: "2px 6px", flexShrink: 0, opacity: deletingId === conn.id ? 0.4 : 1 }}
                        >
                          ×
                        </button>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ height: 1, background: "var(--bd, #2e2e3a)", margin: "14px 0" }} />
              </div>
            )}
            <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "var(--tx1, #8888a0)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              New connection
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {CONNECTORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickConnector(c)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 6,
                    padding: "14px 14px",
                    background: waitlistConnector === c.label ? "rgba(91,106,240,0.08)" : "var(--bg3, #18181e)",
                    border: waitlistConnector === c.label ? "1px solid var(--ac, #5B6AF0)" : "1px solid var(--bd, #2e2e3a)",
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 0.15s",
                  }}
                >
                  <span style={{ fontSize: 22 }}>{c.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tx0, #e8e8f0)" }}>{c.label}</span>
                  <span style={{ fontSize: 11, color: c.locked ? "var(--ac, #818cf8)" : "var(--tx1, #8888a0)", lineHeight: 1.4 }}>
                    {c.locked ? c.lockedLabel : c.description}
                  </span>
                </button>
              ))}
            </div>

            {waitlistConnector && (
              <div style={{ marginTop: 16, padding: "14px 16px", border: "1px solid var(--ac, #5B6AF0)", borderRadius: 10, background: "rgba(91,106,240,0.06)" }}>
                {waitlistDone ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--tx0, #e8e8f0)" }}>
                    ✓ You&apos;re on the {waitlistConnector} waitlist! We&apos;ll notify you when it launches.
                  </p>
                ) : (
                  <form onSubmit={(e) => void handleWaitlistSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--tx0, #e8e8f0)" }}>
                      Get notified when {waitlistConnector} launches
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="email"
                        required
                        autoFocus
                        value={waitlistEmail}
                        onChange={(e) => setWaitlistEmail(e.target.value)}
                        placeholder="you@company.com"
                        style={{ flex: 1, background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: 6, color: "var(--tx0)", fontSize: 13, padding: "7px 10px", outline: "none" }}
                      />
                      <button type="submit" disabled={waitlistSubmitting} style={{ padding: "7px 16px", borderRadius: 6, border: "none", background: "var(--ac, #5B6AF0)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: waitlistSubmitting ? 0.7 : 1 }}>
                        {waitlistSubmitting ? "…" : "Notify me"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
            </>
          )}

          {/* ── Step: configure ── */}
          {step === "configure" && selected && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Connection name */}
              <div>
                <span style={label}>Connection name</span>
                <input
                  value={connName}
                  onChange={(e) => setConnName(e.target.value)}
                  placeholder={selected.label}
                  style={input}
                />
              </div>

              {/* Dynamic fields */}
              {selected.id === "google_sheets" ? (
                <>
                  {selected.fields.map((f) => (
                    <div key={f.key}>
                      <span style={label}>{f.label}</span>
                      <input
                        type={f.type}
                        value={fields[f.key] ?? ""}
                        onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        style={input}
                      />
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {selected.fields.map((f) => (
                    <div key={f.key} style={{ gridColumn: ["host", "database"].includes(f.key) ? "1 / -1" : undefined }}>
                      <span style={label}>{f.label}</span>
                      <input
                        type={f.type}
                        value={fields[f.key] ?? ""}
                        onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        style={input}
                        autoComplete={f.type === "password" ? "current-password" : "off"}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Connection type — Import vs DirectQuery (Power BI style) */}
              {/* Only shown for SQL connectors with supportsDirectQuery: true */}
              {selected.supportsDirectQuery && (
                <div>
                  <span style={label}>Connection type</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 2 }}>
                    {(["cached", "live"] as const).map((m) => {
                      const active = importMode === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setImportMode(m)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: active ? "1.5px solid rgba(91,106,240,0.7)" : "1px solid var(--bd, #2e2e3a)",
                            background: active ? "rgba(91,106,240,0.12)" : "var(--bg3, #18181e)",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "border-color 0.12s, background 0.12s",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 14 }}>{m === "cached" ? "⬇" : "⚡"}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: active ? "#818cf8" : "var(--tx0, #e8e8f0)" }}>
                              {m === "cached" ? "Import" : "DirectQuery"}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--tx1, #8888a0)", lineHeight: 1.4 }}>
                            {m === "cached"
                              ? "Copy data into DataHub. Fast queries, manual refresh."
                              : "Query your source directly. Always fresh, no storage used."}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Test result */}
              {testResult && (
                <div style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: testResult.success ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
                  border: `1px solid ${testResult.success ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
                  fontSize: 12,
                  color: testResult.success ? "#34d399" : "#f87171",
                }}>
                  {testResult.success ? `✓ ${testResult.message ?? "Connected successfully"}` : `✗ ${testResult.error}`}
                </div>
              )}

              {error && (
                <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", fontSize: 12, color: "#f87171" }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Step: browse ── */}
          {step === "browse" && (
            <div>
              {/* Mode selector — interactive when arriving from saved connection
                  (modeChosen=false), static badge when mode was set in configure */}
              {selected?.supportsDirectQuery && (
                modeChosen ? (
                  /* Static badge — user already chose in configure step */
                  !loadingTables && tables.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: importMode === "live" ? "1px solid rgba(52,211,153,0.4)" : "1px solid rgba(91,106,240,0.4)",
                        background: importMode === "live" ? "rgba(52,211,153,0.08)" : "rgba(91,106,240,0.08)",
                        color: importMode === "live" ? "#34d399" : "#818cf8",
                        textTransform: "uppercase", letterSpacing: "0.05em",
                      }}>
                        {importMode === "live" ? "⚡ DirectQuery" : "⬇ Import"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--tx1, #8888a0)" }}>
                        {importMode === "live"
                          ? "Queries run against your source database"
                          : "Data will be copied into DataHub"}
                      </span>
                    </div>
                  )
                ) : (
                  /* Interactive selector — saved connection skipped configure */
                  <div style={{ marginBottom: 14 }}>
                    <span style={label}>Connection type</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 2 }}>
                      {(["cached", "live"] as const).map((m) => {
                        const active = importMode === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setImportMode(m)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: active ? "1.5px solid rgba(91,106,240,0.7)" : "1px solid var(--bd, #2e2e3a)",
                              background: active ? "rgba(91,106,240,0.12)" : "var(--bg3, #18181e)",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "border-color 0.12s, background 0.12s",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 14 }}>{m === "cached" ? "⬇" : "⚡"}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: active ? "#818cf8" : "var(--tx0, #e8e8f0)" }}>
                                {m === "cached" ? "Import" : "DirectQuery"}
                              </span>
                            </div>
                            <span style={{ fontSize: 11, color: "var(--tx1, #8888a0)", lineHeight: 1.4 }}>
                              {m === "cached"
                                ? "Copy data into DataHub. Fast queries, manual refresh."
                                : "Query your source directly. Always fresh, no storage used."}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
              {importMode === "live" && !loadingTables && tables.length > 0 && (
                <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)", fontSize: 12, color: "#fbbf24", lineHeight: 1.5 }}>
                  A 500-row preview is cached for the AI agent. All pipeline steps are pushed to your source database. Step outputs are saved as Parquet snapshots.
                </div>
              )}
              {loadingTables && (
                <p style={{ fontSize: 13, color: "var(--tx1, #8888a0)", textAlign: "center", padding: "24px 0" }}>Loading tables…</p>
              )}
              {!loadingTables && tables.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--tx1, #8888a0)", textAlign: "center", padding: "24px 0" }}>No tables found.</p>
              )}
              {!loadingTables && tables.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {tables.map((t) => {
                    const key = `${t.schema}.${t.table}`;
                    const done = importedTables.has(t.table);
                    return (
                      <div
                        key={key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          background: "var(--bg3, #18181e)",
                          border: "1px solid var(--bd, #2e2e3a)",
                          borderRadius: 8,
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 13, color: "var(--tx0, #e8e8f0)", fontFamily: "monospace" }}>
                            {t.schema !== "public" ? `${t.schema}.` : ""}{t.table}
                          </span>
                          {t.row_count > 0 && (
                            <span style={{ fontSize: 11, color: "var(--tx1, #8888a0)", marginLeft: 8 }}>
                              ~{t.row_count.toLocaleString()} rows
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleImportTable(t.table)}
                          disabled={done || importing === t.table}
                          style={{
                            padding: "4px 12px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            border: done ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(91,106,240,0.4)",
                            background: done ? "rgba(52,211,153,0.1)" : "rgba(91,106,240,0.15)",
                            color: done ? "#34d399" : "#818cf8",
                            cursor: done ? "default" : "pointer",
                          }}
                        >
                          {done
                            ? (importMode === "live" ? "✓ Connected" : "✓ Imported")
                            : importing === t.table
                              ? (importMode === "live" ? "Connecting…" : "Importing…")
                              : (importMode === "live" ? "Connect" : "Load")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {error && (
                <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", fontSize: 12, color: "#f87171" }}>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== "pick" && (
          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--bd, #2e2e3a)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <button
              onClick={() => { setStep("pick"); setTestResult(null); setError(null); }}
              style={{ fontSize: 13, color: "var(--tx1, #8888a0)", background: "transparent", border: "none", cursor: "pointer" }}
            >
              ← Back
            </button>

            {step === "configure" && selected && (
              <div style={{ display: "flex", gap: 8 }}>
                {selected.id !== "google_sheets" && (
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    style={{ padding: "7px 14px", borderRadius: 7, fontSize: 13, border: "1px solid var(--bd, #2e2e3a)", background: "transparent", color: "var(--tx1, #8888a0)", cursor: "pointer" }}
                  >
                    {testing ? "Testing…" : "Test connection"}
                  </button>
                )}
                <button
                  onClick={selected.id === "google_sheets" ? handleGoogleSheetsImport : handleSaveAndBrowse}
                  disabled={saving}
                  style={{ padding: "7px 16px", borderRadius: 7, fontSize: 13, fontWeight: 600, border: "1px solid rgba(91,106,240,0.5)", background: "rgba(91,106,240,0.2)", color: "#818cf8", cursor: "pointer" }}
                >
                  {saving
                    ? "Connecting…"
                    : selected.id === "google_sheets"
                      ? "Import sheet"
                      : importMode === "live"
                        ? "Connect & browse tables"
                        : "Save & browse tables"}
                </button>
              </div>
            )}

            {step === "browse" && (
              <button
                onClick={handleClose}
                style={{ padding: "7px 16px", borderRadius: 7, fontSize: 13, fontWeight: 600, border: "1px solid rgba(91,106,240,0.5)", background: "rgba(91,106,240,0.2)", color: "#818cf8", cursor: "pointer" }}
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
