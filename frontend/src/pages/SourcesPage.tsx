import { useEffect, useState } from "react";
import { api } from "../api";

interface DataSource {
  id: string;
  name: string;
  source_type: string;
  config: Record<string, unknown>;
  last_tested_at: string | null;
  last_pulled_at: string | null;
  is_active: boolean;
  created_at: string;
  pipeline_count?: number;
}

interface TestResult {
  ok: boolean;
  message: string;
  preview: Record<string, unknown>[];
}

const SOURCE_TYPES = [
  { value: "manual_upload", label: "Manual Upload" },
  { value: "s3_folder", label: "S3 Folder" },
  { value: "google_sheets", label: "Google Sheets" },
  { value: "url", label: "URL" },
  { value: "sftp", label: "SFTP" },
];

const SOURCE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_TYPES.map((t) => [t.value, t.label])
);

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

const panelStyle: React.CSSProperties = {
  background: "var(--bg2, #1a1a2e)",
  border: "1px solid var(--bd2, #2a2a3e)",
  borderRadius: 8,
  padding: "20px",
};

export function SourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add source form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState("manual_upload");
  const [addConfig, setAddConfig] = useState("{}");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Test source
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; result: TestResult } | null>(null);

  // Edit source
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editConfig, setEditConfig] = useState("{}");
  const [editSaving, setEditSaving] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSources = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DataSource[]>("/sources");
      setSources(res.data);
    } catch {
      setError("Failed to load data sources.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const handleAddSource = async () => {
    setAddSaving(true);
    setAddError(null);
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(addConfig);
    } catch {
      setAddError("Config must be valid JSON.");
      setAddSaving(false);
      return;
    }
    try {
      await api.post("/sources", { name: addName, source_type: addType, config });
      setShowAddForm(false);
      setAddName("");
      setAddType("manual_upload");
      setAddConfig("{}");
      await loadSources();
    } catch {
      setAddError("Failed to create source.");
    } finally {
      setAddSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await api.post<TestResult>(`/sources/${id}/test`);
      setTestResult({ id, result: res.data });
    } catch {
      setTestResult({ id, result: { ok: false, message: "Request failed.", preview: [] } });
    } finally {
      setTestingId(null);
    }
  };

  const startEdit = (src: DataSource) => {
    setEditingId(src.id);
    setEditName(src.name);
    setEditConfig(JSON.stringify(src.config, null, 2));
  };

  const handleSaveEdit = async (id: string) => {
    setEditSaving(true);
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(editConfig);
    } catch {
      setEditSaving(false);
      return;
    }
    try {
      await api.patch(`/sources/${id}`, { name: editName, config });
      setEditingId(null);
      await loadSources();
    } catch {
      // ignore
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this data source?")) return;
    setDeletingId(id);
    try {
      await api.delete(`/sources/${id}`);
      await loadSources();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="app-page" style={{ padding: "24px 32px", paddingTop: 60, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Data Sources</h1>
          <p style={{ color: "var(--tx1, #888)", fontSize: 13 }}>
            Manage the upstream data connections used by your pipelines.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? "Cancel" : "+ Add Source"}
        </button>
      </div>

      {/* Add Source Form */}
      {showAddForm && (
        <div style={{ ...panelStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>New Data Source</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>Name</label>
              <input
                className="input"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Monthly Sales CSV"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>Type</label>
              <select
                className="input"
                value={addType}
                onChange={(e) => setAddType(e.target.value)}
                style={{ width: "100%" }}
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>
              Config (JSON)
            </label>
            <textarea
              className="input"
              value={addConfig}
              onChange={(e) => setAddConfig(e.target.value)}
              rows={4}
              style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
              placeholder='{"match_filename": "sales_"}'
            />
          </div>
          {addError && <p style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{addError}</p>}
          <button
            className="btn btn-primary"
            onClick={handleAddSource}
            disabled={addSaving || !addName.trim()}
          >
            {addSaving ? "Saving…" : "Create Source"}
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ color: "#f87171", marginBottom: 16, fontSize: 13 }}>{error}</div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ textAlign: "center", color: "var(--tx1)", padding: 40 }}>Loading…</div>
      ) : sources.length === 0 ? (
        <div style={{ ...panelStyle, textAlign: "center", padding: 48, color: "var(--tx1)" }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>No data sources yet.</p>
          <p style={{ fontSize: 13 }}>Add a source to enable automatic pipeline refresh.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sources.map((src) => (
            <div key={src.id} style={panelStyle}>
              {editingId === src.id ? (
                /* Edit form */
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>Name</label>
                      <input
                        className="input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>Type</label>
                      <input className="input" value={SOURCE_TYPE_LABELS[src.source_type] ?? src.source_type} disabled style={{ width: "100%" }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: 12, color: "var(--tx1)", marginBottom: 4 }}>Config (JSON)</label>
                    <textarea
                      className="input"
                      value={editConfig}
                      onChange={(e) => setEditConfig(e.target.value)}
                      rows={4}
                      style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary" onClick={() => handleSaveEdit(src.id)} disabled={editSaving}>
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                    <button className="btn" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                /* View row */
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{src.name}</span>
                      <span style={{
                        fontSize: 11,
                        padding: "2px 7px",
                        borderRadius: 10,
                        background: "var(--bg3, #252540)",
                        color: "var(--tx1)",
                      }}>
                        {SOURCE_TYPE_LABELS[src.source_type] ?? src.source_type}
                      </span>
                      {!src.is_active && (
                        <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: "#3f1515", color: "#f87171" }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 20, fontSize: 12, color: "var(--tx1)" }}>
                      <span>Pipelines: <strong>{src.pipeline_count ?? 0}</strong></span>
                      <span>Last tested: {formatDate(src.last_tested_at)}</span>
                      <span>Last pulled: {formatDate(src.last_pulled_at)}</span>
                    </div>
                  </div>

                  {/* Test result inline */}
                  {testResult?.id === src.id && (
                    <div style={{
                      fontSize: 12,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: testResult.result.ok ? "#0d2d1a" : "#2d0d0d",
                      color: testResult.result.ok ? "#4ade80" : "#f87171",
                      maxWidth: 320,
                    }}>
                      {testResult.result.message}
                      {testResult.result.ok && testResult.result.preview.length > 0 && (
                        <div style={{ marginTop: 6, overflowX: "auto" }}>
                          <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                            <thead>
                              <tr>
                                {Object.keys(testResult.result.preview[0]).map((k) => (
                                  <th key={k} style={{ padding: "2px 6px", textAlign: "left", borderBottom: "1px solid #2a4a2a", color: "#86efac" }}>{k}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {testResult.result.preview.map((row, i) => (
                                <tr key={i}>
                                  {Object.values(row).map((v, j) => (
                                    <td key={j} style={{ padding: "2px 6px", borderBottom: "1px solid #1a3a1a" }}>{String(v)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      className="btn"
                      onClick={() => handleTest(src.id)}
                      disabled={testingId === src.id}
                      style={{ fontSize: 12 }}
                    >
                      {testingId === src.id ? "Testing…" : "Test"}
                    </button>
                    <button className="btn" onClick={() => startEdit(src)} style={{ fontSize: 12 }}>Edit</button>
                    <button
                      className="btn"
                      onClick={() => handleDelete(src.id)}
                      disabled={deletingId === src.id}
                      style={{ fontSize: 12, color: "#f87171" }}
                    >
                      {deletingId === src.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
