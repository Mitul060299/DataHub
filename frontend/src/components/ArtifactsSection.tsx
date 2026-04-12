/**
 * ArtifactsSection
 * ─────────────────
 * Flat list under a single ARTIFACTS heading.
 * In-session tables and S3-persisted artifacts shown together.
 * Actions: rename + delete (stored) / rename + remove (in-session).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { IconBarChart, IconCode, IconTable } from "./Icons";
import { api } from "../api";
import type { Dataset } from "../contexts/WorkspaceContext";

export type ArtifactKind = "table" | "metric" | "variable";

export interface ArtifactItem extends Dataset {
  kind: ArtifactKind;
}

// Shape returned by GET /api/artifacts
interface StoredArtifact {
  id: string;
  name: string;
  description?: string | null;
  type: string;          // 'auto' | 'export'
  format: string;        // 'parquet'
  row_count?: number | null;
  column_schema?: { name: string; type: string }[];
  pipeline_run_id?: string | null;
  step_id?: string | null;
  session_id?: string | null;
  created_at?: string | null;
  download_url?: string | null;    // presigned URL for parquet directly
  dataset_id?: string | null;      // DatasetMetaDB id — present when artifact has a loaded dataset
}

interface ArtifactsSectionProps {
  artifacts: ArtifactItem[];
  activeDatasetId?: string;
  sessionId?: string;
  refreshNonce?: number;
  onSelect: (dataset: Dataset) => void;
  onRemove: (dataset: Dataset) => void;
  onRename?: (dataset: Dataset, newName: string) => void;
  /** The current in-session DuckDB table representing the pipeline leaf */
  liveArtifact?: { tableName: string; rowCount: number; stepLabel: string } | null;
  /** Called when the user clicks "Save ↑" on the live artifact */
  onSaveLive?: (tableName: string, label: string) => Promise<void>;
}

const kindIcon: Record<ArtifactKind, typeof IconTable> = {
  table: IconTable,
  metric: IconBarChart,
  variable: IconCode,
};

function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ArtifactsSection({
  artifacts,
  activeDatasetId,
  sessionId: _sessionId,
  refreshNonce,
  onSelect,
  onRemove,
  onRename,
  liveArtifact,
  onSaveLive,
}: ArtifactsSectionProps) {
  const [open, setOpen] = useState(true);
  const [savingLive, setSavingLive] = useState(false);

  // ── Session table edit state ─────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Stored artifacts state ───────────────────────────────────────────────
  const [stored, setStored] = useState<StoredArtifact[]>([]);
  const [storedLoading, setStoredLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const storedInputRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchStored = useCallback(async () => {
    setStoredLoading(true);
    try {
      const response = await api.get<StoredArtifact[]>("/api/artifacts");
      setStored(response.data ?? []);
    } catch {
      setStored([]);
    } finally {
      setStoredLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStored();
  }, [fetchStored, refreshNonce]);

  // ── Session table handlers ────────────────────────────────────────────────
  const commitRename = (artifact: ArtifactItem) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== artifact.name) onRename?.(artifact, trimmed);
    setEditingId(null);
  };

  const startEdit = (artifact: ArtifactItem) => {
    setEditingName(artifact.name);
    setEditingId(artifact.id);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  // ── Stored artifact handlers ──────────────────────────────────────────────
  const handleStoredRenameCommit = async (id: string) => {
    const trimmed = renamingName.trim();
    if (!trimmed) { setRenamingId(null); return; }
    try {
      await api.patch(`/api/artifacts/${id}`, { name: trimmed });
      setStored((prev) => prev.map((a) => (a.id === id ? { ...a, name: trimmed } : a)));
    } finally {
      setRenamingId(null);
    }
  };

  const handleLoadArtifact = async (artifact: StoredArtifact) => {
    // If the artifact already has a linked dataset, switch directly to it.
    if (artifact.dataset_id) {
      onSelect({ id: artifact.dataset_id, name: artifact.name, rows: artifact.row_count ?? 0 });
      return;
    }
    // Otherwise call /load to register it in a session then refresh stored list
    // so future clicks use the dataset_id path.
    try {
      await api.post(`/api/artifacts/${artifact.id}/load`, { session_id: "default" });
    } catch {
      // best-effort — the dataset may appear in the list on next refresh
    }
    void fetchStored();
  };

  const handleDelete = async (artifact: StoredArtifact) => {
    if (!window.confirm(`Delete artifact "${artifact.name}"? This cannot be undone.`)) return;
    setDeletingId(artifact.id);
    try {
      await api.delete(`/api/artifacts/${artifact.id}`);
      setStored((prev) => prev.filter((a) => a.id !== artifact.id));
    } finally {
      setDeletingId(null);
    }
  };

  // Deduplicate: hide in-session entries that already have a matching stored artifact
  const storedNames = new Set(stored.map((a) => a.name));
  const dedupedArtifacts = artifacts.filter((a) => !storedNames.has(a.name));
  const liveCount = liveArtifact ? 1 : 0;
  const totalCount = liveCount + dedupedArtifacts.length + stored.length;

  return (
    <section style={{ borderTop: "1px solid var(--bd)", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "6px 0", color: "var(--tx1)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", background: "none", border: "none", cursor: "pointer" }}
        >
          <IconTable size={13} color="var(--tx2)" />
          ARTIFACTS
          {totalCount > 0 && (
            <span style={{ background: "var(--bg3)", borderRadius: 99, padding: "1px 6px", fontSize: 10, fontWeight: 400, color: "var(--tx2)", letterSpacing: "normal", lineHeight: "16px" }}>
              {totalCount}
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--tx2)" }}>{open ? "▾" : "▸"}</span>
        </button>
        <button className="btn" style={{ width: 22, height: 22, padding: 0, flexShrink: 0 }} title="Refresh artifacts" onClick={() => void fetchStored()}>
          ↻
        </button>
      </div>

      {open ? (
        <div style={{ display: "grid", gap: 4 }}>
          <style>{`@keyframes live-blink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
          {/* ── Live In-Session Entry ─────────────────────────────────── */}
          {liveArtifact && (
            <div
              style={{
                minHeight: 38,
                borderRadius: "var(--r6)",
                border: "1px solid rgba(34,197,94,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 8px",
                background: "rgba(34,197,94,0.06)",
                gap: 6,
              }}
            >
              {/* Pulsing green dot */}
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#22c55e",
                  flexShrink: 0,
                  animation: "live-blink 1.7s infinite",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#86efac" }}>
                  {liveArtifact.stepLabel}
                </div>
                <div style={{ fontSize: 10, color: "rgba(134,239,172,0.6)" }}>
                  {liveArtifact.rowCount > 0 ? `${liveArtifact.rowCount.toLocaleString()} rows · ` : ""}LIVE
                </div>
              </div>
              {onSaveLive && (
                <button
                  className="btn"
                  disabled={savingLive}
                  style={{ height: 22, padding: "0 8px", fontSize: 10, flexShrink: 0, borderColor: "rgba(34,197,94,0.4)", color: "#86efac" }}
                  onClick={async () => {
                    setSavingLive(true);
                    try {
                      await onSaveLive(liveArtifact.tableName, liveArtifact.stepLabel);
                      void fetchStored();
                    } finally {
                      setSavingLive(false);
                    }
                  }}
                >
                  {savingLive ? "Saving…" : "Save ↑"}
                </button>
              )}
            </div>
          )}

          {/* ── In-Session Tables ─────────────────────────────────────── */}
          {dedupedArtifacts.map((artifact) => {
            const active = activeDatasetId === artifact.id;
            const KindIcon = kindIcon[artifact.kind];
            return (
              <div
                key={artifact.id}
                style={{
                  minHeight: 34,
                  borderRadius: "var(--r6)",
                  border: "1px solid var(--bd)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 6px 0 8px",
                  background: active ? "var(--acl)" : "transparent",
                }}
              >
                {editingId === artifact.id ? (
                  <>
                    <KindIcon size={14} />
                    <input
                      ref={inputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => commitRename(artifact)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(artifact);
                        else if (e.key === "Escape") setEditingId(null);
                      }}
                      style={{ flex: 1, marginLeft: 6, height: 22, fontSize: 12, background: "var(--bg3)", border: "1px solid var(--ac)", borderRadius: 4, color: "var(--tx0)", padding: "0 6px" }}
                    />
                  </>
                ) : (
                  <button
                    onClick={() => onSelect(artifact)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, textAlign: "left" }}
                  >
                    <KindIcon size={14} />
                    <span className="mono" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {artifact.name}
                    </span>
                  </button>
                )}
                {editingId !== artifact.id ? (
                  <button className="btn" style={{ height: 22, padding: "0 6px", marginLeft: 6, fontSize: 10 }} onClick={() => onSelect(artifact)}>
                    Use
                  </button>
                ) : null}
                {onRename ? (
                  <button
                    className="btn"
                    style={{ height: 22, width: 22, padding: 0, marginLeft: 6, borderColor: "transparent", background: "transparent", color: "var(--tx1)", fontSize: 12 }}
                    onClick={() => startEdit(artifact)}
                  >
                    ✏
                  </button>
                ) : null}
                <button
                  className="btn"
                  style={{ height: 22, width: 22, padding: 0, marginLeft: 6, borderColor: "transparent", background: "transparent", color: "var(--tx1)" }}
                  onClick={() => onRemove(artifact)}
                >
                  ×
                </button>
              </div>
            );
          })}

          {/* ── Stored Artifacts ──────────────────────────────────────── */}
          {storedLoading ? (
            <p style={{ color: "var(--tx2)", fontSize: 12 }}>Loading…</p>
          ) : (
            stored.map((artifact) => (
              <div
                key={artifact.id}
                style={{
                  borderRadius: "var(--r6)",
                  border: "1px solid var(--bd)",
                  background: "var(--bg2)",
                  padding: "8px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {/* Name row + badge + rename/delete */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <IconTable size={13} />
                  {renamingId === artifact.id ? (
                    <input
                      ref={storedInputRef}
                      autoFocus
                      value={renamingName}
                      onChange={(e) => setRenamingName(e.target.value)}
                      onBlur={() => void handleStoredRenameCommit(artifact.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleStoredRenameCommit(artifact.id);
                        else if (e.key === "Escape") setRenamingId(null);
                      }}
                      style={{ flex: 1, height: 20, fontSize: 12, background: "var(--bg3)", border: "1px solid var(--ac)", borderRadius: 4, color: "var(--tx0)", padding: "0 5px" }}
                    />
                  ) : (
                    <button
                      className="btn"
                      style={{ flex: 1, minWidth: 0, height: 20, padding: 0, borderColor: "transparent", background: "transparent", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center" }}
                      title={`Load ${artifact.name}`}
                      onClick={() => void handleLoadArtifact(artifact)}
                    >
                      <span
                        className="mono"
                        style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: artifact.dataset_id ? "var(--ac)" : "var(--tx0)" }}
                        title={artifact.name}
                      >
                        {artifact.name}
                      </span>
                    </button>
                  )}
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 9,
                      letterSpacing: "0.07em",
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: artifact.type === "auto" ? "var(--acl)" : "rgba(34,197,94,0.1)",
                      color: artifact.type === "auto" ? "var(--ac)" : "var(--gr)",
                      border: `1px solid ${artifact.type === "auto" ? "var(--acg)" : "rgba(34,197,94,0.3)"}`,

                    }}
                  >
                    {artifact.type === "auto" ? "AUTO" : "EXPORT"}
                  </span>
                  <button
                    className="btn"
                    style={{ height: 20, width: 20, padding: 0, flexShrink: 0, borderColor: "transparent", background: "transparent", color: "var(--tx1)", fontSize: 12 }}
                    title="Rename"
                    onClick={() => {
                      setRenamingName(artifact.name);
                      setRenamingId(artifact.id);
                      setTimeout(() => storedInputRef.current?.select(), 0);
                    }}
                  >
                    ✏
                  </button>
                  <button
                    className="btn"
                    style={{ height: 20, width: 20, padding: 0, flexShrink: 0, borderColor: "transparent", background: "transparent", color: "var(--rd)" }}
                    title="Delete artifact"
                    disabled={deletingId === artifact.id}
                    onClick={() => void handleDelete(artifact)}
                  >
                    {deletingId === artifact.id ? "…" : "×"}
                  </button>
                </div>
                {/* Meta row */}
                {(artifact.row_count != null || artifact.created_at) ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 19, color: "var(--tx2)", fontSize: 10 }}>
                    {artifact.row_count != null ? <span>{artifact.row_count.toLocaleString()} rows</span> : null}
                    {artifact.created_at ? <span>{relativeTime(artifact.created_at)}</span> : null}
                  </div>
                ) : null}
              </div>
            ))
          )}

          {/* Empty state */}
          {!dedupedArtifacts.length && !stored.length && !storedLoading ? (
            <p style={{ color: "var(--tx2)", fontSize: 12 }}>
              No artifacts yet. Run transformations to create them.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
