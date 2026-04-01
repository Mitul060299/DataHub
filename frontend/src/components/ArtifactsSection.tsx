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
}

interface ArtifactsSectionProps {
  artifacts: ArtifactItem[];
  activeDatasetId?: string;
  sessionId?: string;
  refreshNonce?: number;
  onSelect: (dataset: Dataset) => void;
  onRemove: (dataset: Dataset) => void;
  onRename?: (dataset: Dataset, newName: string) => void;
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
}: ArtifactsSectionProps) {
  const [open, setOpen] = useState(true);

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

  const totalCount = artifacts.length + stored.length;

  return (
    <section style={{ borderTop: "1px solid var(--bd)", paddingTop: 8, marginTop: 10 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ color: "var(--tx1)", fontSize: 11, letterSpacing: "0.08em", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {open ? "▼" : "▶"} ARTIFACTS
          {totalCount > 0 ? (
            <span style={{ background: "#27272a", borderRadius: 10, padding: "1px 7px", fontSize: 10, color: "#71717a", letterSpacing: "normal" }}>
              {totalCount}
            </span>
          ) : null}
        </button>
        {open && stored.length > 0 ? (
          <button className="btn" style={{ fontSize: 10, padding: "1px 6px" }} onClick={() => void fetchStored()}>
            ↻
          </button>
        ) : null}
      </header>

      {open ? (
        <div style={{ display: "grid", gap: 4 }}>
          {/* ── In-Session Tables ─────────────────────────────────────── */}
          {artifacts.map((artifact) => {
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
                    <span
                      className="mono"
                      style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--tx0)" }}
                      title={artifact.name}
                    >
                      {artifact.name}
                    </span>
                  )}
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 9,
                      letterSpacing: "0.07em",
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: artifact.type === "auto" ? "#1e1b4b" : "#1a2a1a",
                      color: artifact.type === "auto" ? "#818cf8" : "#4ade80",
                      border: `1px solid ${artifact.type === "auto" ? "#312e81" : "#166534"}`,
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
                    style={{ height: 20, width: 20, padding: 0, flexShrink: 0, borderColor: "transparent", background: "transparent", color: "#f87171" }}
                    title="Delete artifact"
                    disabled={deletingId === artifact.id}
                    onClick={() => void handleDelete(artifact)}
                  >
                    {deletingId === artifact.id ? "…" : "×"}
                  </button>
                </div>
                {/* Meta row */}
                {(artifact.row_count != null || artifact.created_at) ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 19, color: "#52525b", fontSize: 10 }}>
                    {artifact.row_count != null ? <span>{artifact.row_count.toLocaleString()} rows</span> : null}
                    {artifact.created_at ? <span>{relativeTime(artifact.created_at)}</span> : null}
                  </div>
                ) : null}
              </div>
            ))
          )}

          {/* Empty state */}
          {!artifacts.length && !stored.length && !storedLoading ? (
            <p style={{ color: "var(--tx2)", fontSize: 12 }}>
              No artifacts yet. Run transformations to create them.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
