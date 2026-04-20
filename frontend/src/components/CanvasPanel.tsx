import { useState, useRef, useEffect, useCallback } from "react";
import { usePipelineContext } from "../contexts/PipelineContext";
import type { PipelineStep } from "../contexts/PipelineContext";
import type { Dataset } from "../contexts/WorkspaceContext";
import { IconBarChart, IconClock, IconDownload, IconGitBranch, IconRefresh, IconTable } from "./Icons";
import { DataTable } from "./DataTable";
import { CanvasView } from "./CanvasView";
import { PipelineGraphTab } from "./PipelineGraphTab";
import { PipelineScheduleTab } from "./PipelineScheduleTab";
import { DataVersionHistory } from "./DataVersionHistory";
import { api, exportDatasetCsv, exportDatasetPowerBI, exportDatasetTableau, fetchDatasetPage, fetchSnapshotPreview, fetchStepPreview } from "../api";

type CanvasTab = "data" | "pipeline" | "canvas" | "schedule" | "history";

interface CanvasPanelProps {
  workspaceId: string;
  projectId: string;
  pipelineId?: string;
  dataset: Dataset | null;
  loading: boolean;
  dataError?: string;
  columns: string[];
  rows: Record<string, unknown>[];
  lastAction: string;
  onImport: () => void;
  onSheetsExport?: () => void;
  onArtifactSaved?: () => void;
  /** 50-row preview from the latest AI transform (session-only, not persisted) */
  sessionPreviewRows?: Record<string, unknown>[];
  sessionPreviewColumns?: string[];
  /** True when user toggled back to view the original source dataset */
  showingOriginal?: boolean;
  onViewOriginal?: () => void;
  onViewCleaned?: () => void;
  /** Called when user clicks Save in the amber preview banner */
  onSave?: () => void;
  /** Replay all pipeline steps and restore session preview */
  onRunPipeline?: () => Promise<void>;
  /** True while replay is running */
  replayingPipeline?: boolean;
  /** Error message from the most recent replay attempt */
  replayError?: string | null;
  /** Clear the replay error (e.g. when user dismisses) */
  onClearReplayError?: () => void;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CanvasPanel({ workspaceId, projectId, pipelineId, dataset, loading, dataError, columns, rows, lastAction, onImport, onSheetsExport, onArtifactSaved, sessionPreviewRows, sessionPreviewColumns, showingOriginal, onViewOriginal, onViewCleaned, onSave, onRunPipeline, replayingPipeline, replayError, onClearReplayError }: CanvasPanelProps) {
  const { steps, liveArtifact } = usePipelineContext();
  const [tab, setTab] = useState<CanvasTab>("data");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Export confirmation modal state ───────────────────────────────────────
  const [exportConfirmTarget, setExportConfirmTarget] = useState<"csv" | "powerbi" | "tableau" | null>(null);
  const [exportCheckpoint, setExportCheckpoint] = useState(false);

  // ── Step-preview state (triggered from PipelineSection 👁 buttons) ────────
  const [viewingStepIndex, setViewingStepIndex] = useState<number | null>(null);
  const [timelineRows, setTimelineRows] = useState<Record<string, unknown>[] | null>(null);
  const [timelineCols, setTimelineCols] = useState<string[] | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const timelineAbortRef = useRef<AbortController | null>(null);

  // ── Before/After diff view state ──────────────────────────────────────────
  const [diffStep, setDiffStep] = useState<PipelineStep | null>(null);
  const [diffBefore, setDiffBefore] = useState<{ rows: Record<string, unknown>[]; cols: string[] } | null>(null);
  const [diffAfter, setDiffAfter] = useState<{ rows: Record<string, unknown>[]; cols: string[] } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // Listen for compare requests dispatched from PipelineSection
  useEffect(() => {
    function handleCompare(e: Event) {
      const step = (e as CustomEvent<PipelineStep>).detail;
      setDiffStep(step);
      setTab("data");
      setDiffBefore(null);
      setDiffAfter(null);
      setDiffLoading(true);

      // Helper to fetch data for a step (or original dataset)
      async function fetchForStep(s: PipelineStep | null): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
        if (!s) {
          // Original dataset
          if (dataset?.id) {
            return fetchDatasetPage(dataset.id, 0, 100) as Promise<{ rows: Record<string, unknown>[]; columns: string[] }>;
          }
          return { rows: [], columns: [] };
        }
        const sp = s.snapshot_path || (typeof s.rawConfig?.snapshot_path === "string" ? s.rawConfig.snapshot_path : undefined);
        if (sp && dataset?.id) {
          return fetchSnapshotPreview(dataset.id, sp, 100);
        }
        if (s.outputDataset?.id) {
          return fetchDatasetPage(s.outputDataset.id, 0, 100) as Promise<{ rows: Record<string, unknown>[]; columns: string[] }>;
        }
        return { rows: [], columns: [] };
      }

      // Find the index of the compare step so we can get the previous step for "before"
      const idx = steps.findIndex((s) => s.id === step.id);
      const prevStep: PipelineStep | null = idx > 0 ? steps[idx - 1] : null;

      Promise.all([
        fetchForStep(prevStep),
        fetchForStep(step),
      ])
        .then(([before, after]) => {
          setDiffBefore({ rows: before.rows ?? [], cols: before.columns ?? [] });
          setDiffAfter({ rows: after.rows ?? [], cols: after.columns ?? [] });
        })
        .catch(() => { /* best-effort */ })
        .finally(() => setDiffLoading(false));
    }
    window.addEventListener("datahub:compare:step", handleCompare);
    return () => window.removeEventListener("datahub:compare:step", handleCompare);
  }, [steps, dataset?.id]);

  // Reset diff when steps change or dataset changes
  useEffect(() => { setDiffStep(null); setDiffBefore(null); setDiffAfter(null); }, [dataset?.id]);

  // Reset timeline when dataset or steps change
  useEffect(() => { setViewingStepIndex(null); setTimelineRows(null); setTimelineCols(null); }, [dataset?.id]);

  const handleTimelineClick = useCallback(async (idx: number) => {
    const step = steps[idx];
    const tableName = step?.output_table
      || (typeof step?.rawConfig?.output_table === "string" ? step.rawConfig.output_table : undefined);
    const snapshotPath = step?.snapshot_path
      || (typeof step?.rawConfig?.snapshot_path === "string" ? step.rawConfig.snapshot_path : undefined);
    // Need at least one way to fetch the step data
    if (!tableName && !snapshotPath && !step?.outputDataset?.id) return;
    // Cancel any in-flight request
    timelineAbortRef.current?.abort();
    const controller = new AbortController();
    timelineAbortRef.current = controller;
    setViewingStepIndex(idx);
    setTimelineLoading(true);
    try {
      let data: { rows: Record<string, unknown>[]; columns: string[] };
      if (snapshotPath && dataset?.id) {
        // Preferred: read directly from the persisted Parquet snapshot
        // (works even after server restart / session eviction)
        data = await fetchSnapshotPreview(dataset.id, snapshotPath, 200);
      } else if (tableName && dataset?.id && liveArtifact?.sessionId) {
        // Session is alive — preview via DuckDB session
        data = await fetchStepPreview(dataset.id, liveArtifact.sessionId, tableName, 200, 0,
          steps.map((s, i) => ({
            step_number: s.stepNumber ?? i + 1,
            operation: s.operation,
            description: s.description,
            sql: s.sql ?? s.rawConfig?.sql ?? "",
            output_table: s.output_table ?? s.rawConfig?.output_table ?? "",
          })).filter((s) => s.sql && s.output_table),
        );
      } else if (step?.outputDataset?.id) {
        // Legacy fallback — derived dataset
        data = await fetchDatasetPage(step.outputDataset.id, 0, 200) as { rows: Record<string, unknown>[]; columns: string[] };
      } else {
        data = { rows: [], columns: [] };
      }
      if (!controller.signal.aborted) {
        setTimelineRows(data.rows ?? []);
        setTimelineCols(data.columns ?? []);
      }
    } catch {
      if (!controller.signal.aborted) { setTimelineRows([]); setTimelineCols([]); }
    } finally {
      if (!controller.signal.aborted) setTimelineLoading(false);
    }
  }, [steps, dataset?.id, liveArtifact?.sessionId]);

  const handleTimelineReset = useCallback(() => {
    timelineAbortRef.current?.abort();
    setViewingStepIndex(null);
    setTimelineRows(null);
    setTimelineCols(null);
    setTimelineLoading(false);
  }, []);

  // Listen for step preview requests from PipelineSection (👁 button)
  const onViewOriginalRef = useRef(onViewOriginal);
  onViewOriginalRef.current = onViewOriginal;

  useEffect(() => {
    function handlePreview(e: Event) {
      const { stepIndex } = (e as CustomEvent<{ stepIndex: number }>).detail;
      void handleTimelineClick(stepIndex);
    }
    function handleViewSource() {
      handleTimelineReset();
      onViewOriginalRef.current?.();
    }
    window.addEventListener("datahub:preview:step", handlePreview);
    window.addEventListener("datahub:view:source", handleViewSource);
    return () => {
      window.removeEventListener("datahub:preview:step", handlePreview);
      window.removeEventListener("datahub:view:source", handleViewSource);
    };
  }, [handleTimelineClick, handleTimelineReset]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsExportOpen(false);
      }
    }
    if (isExportOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [isExportOpen]);

  const handleExport = useCallback(async (type: "csv" | "powerbi" | "tableau") => {
    if (!dataset?.id) return;
    setIsExportOpen(false);
    setIsExporting(type);
    const name = dataset.name ?? "data";
    try {
      if (type === "csv") {
        const blob = await exportDatasetCsv(dataset.id) as Blob;
        triggerBlobDownload(blob, `${name}.csv`);
      } else if (type === "powerbi") {
        const blob = await exportDatasetPowerBI(dataset.id);
        triggerBlobDownload(blob, `${name}.xlsx`);
      } else if (type === "tableau") {
        const blob = await exportDatasetTableau(dataset.id);
        triggerBlobDownload(blob, `${name}.hyper`);
      }
    } catch (err) {
      console.error(`Export ${type} failed:`, err);
    } finally {
      setIsExporting(null);
    }
  }, [dataset]);

  // Opens the confirmation modal before exporting
  const requestExport = (type: "csv" | "powerbi" | "tableau") => {
    setIsExportOpen(false);
    setExportCheckpoint(false);
    setExportConfirmTarget(type);
  };

  const handleExportConfirm = useCallback(async () => {
    if (!exportConfirmTarget) return;
    const type = exportConfirmTarget;
    setExportConfirmTarget(null);
    if (exportCheckpoint) {
      onSave?.();
      // Brief yield so the save can start before the download triggers
      await new Promise<void>((r) => setTimeout(r, 400));
    }
    void handleExport(type);
  }, [exportConfirmTarget, exportCheckpoint, handleExport, onSave]);

  // dataset.rows is the authoritative count (always set by setActiveDataset callers)
  // dataset.row_count is the new optional field; fall back to rows if not present
  const rowCount = dataset?.rows ?? dataset?.row_count ?? null;

  // Effective row/col data for the DataTable: timeline preview overrides live/session data
  const effectiveRows = viewingStepIndex !== null && timelineRows ? timelineRows
    : (sessionPreviewRows && sessionPreviewRows.length > 0 ? sessionPreviewRows : rows);
  const effectiveCols = viewingStepIndex !== null && timelineCols ? timelineCols
    : (sessionPreviewColumns && sessionPreviewColumns.length > 0 ? sessionPreviewColumns : columns);

  return (
    <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* ── Export Confirmation Modal ───────────────────────────────────── */}
      {exportConfirmTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setExportConfirmTarget(null)}>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--bd)", borderRadius: 10, padding: "24px 28px", minWidth: 340, maxWidth: 420, boxShadow: "0 16px 48px rgba(0,0,0,0.6)" }}
            onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "var(--tx0)" }}>Export dataset</p>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--tx2)" }}>
              {dataset?.name ?? "dataset"} &nbsp;·&nbsp;
              {(liveArtifact?.rowCount ?? rowCount)?.toLocaleString() ?? "—"} rows &nbsp;·&nbsp;
              {(columns ?? []).length} columns
              {liveArtifact?.stepLabel ? <> &nbsp;·&nbsp; <em style={{ color: "var(--ac)" }}>{liveArtifact.stepLabel}</em></> : null}
            </p>
            {liveArtifact && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--tx1)", marginBottom: 20, cursor: "pointer" }}>
                <input type="checkbox" checked={exportCheckpoint} onChange={(e) => setExportCheckpoint(e.target.checked)} />
                Save checkpoint before exporting
              </label>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setExportConfirmTarget(null)}>Cancel</button>
              <button className="btn" style={{ background: "var(--acl)", borderColor: "var(--acg)", color: "var(--ac)" }}
                onClick={() => void handleExportConfirm()}>
                Export {exportConfirmTarget === "csv" ? "CSV" : exportConfirmTarget === "powerbi" ? "Excel" : "Tableau"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ height: 38, borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", background: "var(--bg1)" }}>
        <div style={{ display: "inline-flex", gap: 1 }}>
          {([
            { key: "data",     icon: <IconTable size={16} />,     label: "Data" },
            { key: "pipeline", icon: <IconGitBranch size={16} />, label: `Pipeline${steps.length > 0 ? ` (${steps.length} steps)` : ""}`, badge: steps.length > 0 ? steps.length : null },
            { key: "canvas",   icon: <IconBarChart size={16} />,  label: "Canvas",   tourAttr: true },
            ...(pipelineId ? [{ key: "schedule", icon: <IconClock size={16} />,   label: "Schedule" }] : []),
            ...(dataset?.id  ? [{ key: "history",  icon: <IconRefresh size={16} />, label: "History"  }] : []),
          ] as { key: string; icon: React.ReactNode; label: string; badge?: number | null; tourAttr?: boolean }[]).map(({ key, icon, label, badge, tourAttr }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                title={label}
                {...(tourAttr ? { "data-tour": "canvas-tab" } : {})}
                onClick={() => setTab(key as CanvasTab)}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 34,
                  height: 34,
                  border: "none",
                  borderBottom: active ? "2px solid var(--ac)" : "2px solid transparent",
                  borderRadius: 0,
                  background: "transparent",
                  color: active ? "var(--ac)" : "var(--tx2)",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {icon}
                {badge != null && (
                  <span style={{ position: "absolute", top: 5, right: 4, background: "var(--ac)", color: "var(--bg1)", fontSize: 8, fontWeight: 800, borderRadius: 999, minWidth: 13, height: 13, lineHeight: "13px", textAlign: "center", padding: "0 3px" }}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Export dropdown */}
        <div style={{ display: "inline-flex", gap: 6, position: "relative" }} ref={dropdownRef}>
          <button
            className="btn"
            title="Export dataset"
            disabled={!(columns ?? []).length || isExporting !== null}
            onClick={() => setIsExportOpen((o) => !o)}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <IconDownload size={14} />
              {isExporting ? "Exporting…" : "Export"}
              <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </span>
          </button>

          {isExportOpen && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 50,
              background: "var(--bg2)",
              border: "1px solid var(--bd)",
              borderRadius: 8,
              minWidth: 230,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              padding: "4px 0",
            }}>
              {/* Header row */}
              <div style={{ padding: "6px 14px 4px", borderBottom: "1px solid var(--bd)", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--tx2)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Export{rowCount != null ? ` · ${rowCount.toLocaleString()} rows` : ""}
                </span>
              </div>

              {/* BI destinations */}
              <ExportItem
                label="Download as Excel (.xlsx)"
                sub="For Power BI, Looker &amp; general use"
                accent="#F2C811"
                badge="XLS"
                onClick={() => requestExport("powerbi")}
              />
              <ExportItem
                label="Export to Tableau"
                sub=".hyper · Tableau Desktop"
                accent="#E97627"
                badge="VIZ"
                onClick={() => requestExport("tableau")}
              />
              <ExportItem
                label="Sync to Google Sheets"
                sub="Live sync · Looker Studio ready"
                accent="#34A853"
                badge="SYNC"
                onClick={() => { setIsExportOpen(false); onSheetsExport?.(); }}
              />

              {/* Divider */}
              <div style={{ height: 1, background: "var(--bd)", margin: "4px 0" }} />

              {/* Standard downloads */}
              <ExportItem
                label="Download as CSV"
                sub="Universal · plain text"
                accent="#9898b0"
                onClick={() => requestExport("csv")}
              />
            </div>
          )}
        </div>
      </div>
      {/* ── Step preview indicator (when previewing a step's snapshot) ── */}
      {viewingStepIndex !== null && tab === "data" && (
        <div style={{ height: 32, borderBottom: "1px solid var(--bd)", background: "rgba(91,106,240,0.06)", display: "flex", alignItems: "center", padding: "0 12px", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--tx2)", flex: 1 }}>
            👁 Previewing: <strong style={{ color: "var(--ac)" }}>{steps[viewingStepIndex]?.description || `Step ${viewingStepIndex + 1}`}</strong>
            {timelineLoading && <span style={{ marginLeft: 8, color: "var(--tx2)" }}>Loading…</span>}
          </span>
          <button
            onClick={handleTimelineReset}
            style={{ fontSize: 10, padding: "2px 10px", borderRadius: 4, border: "1px solid var(--bd2)", background: "transparent", color: "var(--tx2)", cursor: "pointer" }}
          >
            ✕ Close preview
          </button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {dataError && tab === "data" && !(sessionPreviewRows && sessionPreviewRows.length > 0) && (
          <div style={{ padding: "10px 16px", background: "rgba(248,113,113,0.08)", borderBottom: "1px solid rgba(248,113,113,0.2)", color: "var(--rd)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <span>⚠</span>
            <span>{dataError}</span>
          </div>
        )}
        {/* Amber banner: cleaned preview mode */}
        {tab === "data" && sessionPreviewRows && sessionPreviewRows.length > 0 && (() => {
          // True total: prefer last step's row_count_after (always from the server),
          // fall back to liveArtifact.rowCount, then preview length as last resort.
          const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
          const trueTotal = lastStep?.row_count_after ?? liveArtifact?.rowCount ?? sessionPreviewRows.length;
          const isPreviewing = sessionPreviewRows.length < trueTotal;
          // rows_changed = EXCEPT count from backend (set-difference between source and output).
          // This gives: null-fill → nulls replaced; filter → rows removed; dedup → dupes removed.
          const rowsChanged = liveArtifact?.rowsChanged;
          const rowsBefore = lastStep?.row_count_before;
          const rowsAfter = lastStep?.row_count_after;
          const rowDelta = rowsBefore != null && rowsAfter != null ? rowsAfter - rowsBefore : null;
          // Build the insight string
          let insight: string | null = null;
          if (rowsChanged != null) {
            if (rowDelta != null && rowDelta < 0) {
              // rows were removed (filter/dedup) — rowsChanged == |rowDelta|
              insight = `${Math.abs(rowDelta).toLocaleString()} rows removed`;
            } else if (rowDelta != null && rowDelta > 0) {
              insight = `${rowDelta.toLocaleString()} rows added`;
            } else {
              // In-place transform (null fill, value replacement, type cast, rename…)
              insight = rowsChanged === 0
                ? "no values changed"
                : `${rowsChanged.toLocaleString()} value${rowsChanged === 1 ? "" : "s"} changed`;
            }
          } else if (rowDelta != null) {
            // Fallback when rows_changed wasn't computed (older code path)
            if (rowDelta === 0) insight = null; // don't show "no rows added or removed" — unhelpful
            else if (rowDelta < 0) insight = `${Math.abs(rowDelta).toLocaleString()} rows removed`;
            else insight = `${rowDelta.toLocaleString()} rows added`;
          }
          return (
          <div style={{ padding: "6px 14px", background: "rgba(234,179,8,0.1)", borderBottom: "1px solid rgba(234,179,8,0.25)", color: "#fde68a", fontSize: 12, display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
            <span>⚡</span>
            <span style={{ flex: 1 }}>
              {isPreviewing
                ? `Preview — first ${sessionPreviewRows.length.toLocaleString()} of ${trueTotal.toLocaleString()} rows. Not saved yet.`
                : `Complete result — ${trueTotal.toLocaleString()} rows. Not saved yet.`}
              {insight && (
                <span style={{ marginLeft: 8, opacity: 0.8, fontSize: 11 }}>
                  ({insight})
                </span>
              )}
            </span>
            <button
              onClick={onViewOriginal}
              style={{ background: "transparent", border: "1px solid rgba(234,179,8,0.4)", borderRadius: 4, color: "#fde68a", fontSize: 11, padding: "2px 8px", cursor: "pointer", flexShrink: 0 }}
            >
              View original
            </button>
            {onSave && (
              <button
                onClick={onSave}
                style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.4)", borderRadius: 4, color: "#fde68a", fontSize: 11, padding: "2px 8px", cursor: "pointer", flexShrink: 0 }}
              >
                Save ↑
              </button>
            )}
          </div>
          );
        })()}
        {/* Green banner: steps exist but liveArtifact is gone (page refresh) — prompt user to re-run */}
        {tab === "data" && steps.length > 0 && !liveArtifact && !showingOriginal && viewingStepIndex === null && !(sessionPreviewRows && sessionPreviewRows.length > 0) && (
          <div style={{ padding: "6px 14px", background: replayError ? "rgba(248,113,113,0.08)" : "rgba(34,197,94,0.08)", borderBottom: `1px solid ${replayError ? "rgba(248,113,113,0.2)" : "rgba(34,197,94,0.2)"}`, color: replayError ? "var(--rd)" : "#86efac", fontSize: 12, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span>{replayError ? "⚠" : "🔄"}</span>
            <span style={{ flex: 1 }}>{replayError ?? `Your pipeline has ${steps.length} step${steps.length === 1 ? "" : "s"} — run it to restore the cleaned preview.`}</span>
            {replayError && onClearReplayError && (
              <button
                onClick={onClearReplayError}
                style={{ background: "transparent", border: "none", color: "var(--rd)", fontSize: 13, cursor: "pointer", padding: "2px 6px", flexShrink: 0, opacity: 0.7 }}
                title="Dismiss"
              >✕</button>
            )}
            <button
              onClick={() => { if (onRunPipeline && !replayingPipeline) { onClearReplayError?.(); void onRunPipeline(); } }}
              disabled={replayingPipeline}
              style={{ background: replayError ? "rgba(248,113,113,0.15)" : "rgba(34,197,94,0.15)", border: `1px solid ${replayError ? "rgba(248,113,113,0.35)" : "rgba(34,197,94,0.35)"}`, borderRadius: 4, color: replayError ? "var(--rd)" : "#86efac", fontSize: 11, padding: "2px 10px", cursor: replayingPipeline ? "default" : "pointer", flexShrink: 0, opacity: replayingPipeline ? 0.85 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {replayingPipeline ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ animation: "rp-spin 0.9s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.2-8.55" strokeLinecap="round" />
                  </svg>
                  <span>Running…</span>
                  <style>{`@keyframes rp-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
                </>
              ) : replayError ? "↺ Retry" : "▶ Run Pipeline"}
            </button>
          </div>
        )}
        {/* Blue banner: viewing original while a live artifact exists */}
        {tab === "data" && showingOriginal && (
          <div style={{ padding: "6px 14px", background: "rgba(91,106,240,0.1)", borderBottom: "1px solid rgba(91,106,240,0.25)", color: "#a5b4fc", fontSize: 12, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span>👁</span>
            <span style={{ flex: 1 }}>Viewing original data.</span>
            <button
              onClick={onViewCleaned}
              style={{ background: "transparent", border: "1px solid rgba(91,106,240,0.4)", borderRadius: 4, color: "#a5b4fc", fontSize: 11, padding: "2px 8px", cursor: "pointer", flexShrink: 0 }}
            >
              ▶ See cleaned data ({liveArtifact?.rowCount?.toLocaleString() ?? ""} rows)
            </button>
          </div>
        )}
        {/* ── Before/After diff view ── */}
        {diffStep && tab === "data" ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "6px 12px", background: "rgba(91,106,240,0.07)", borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "var(--tx1)", flex: 1 }}>
                Comparing: <strong>{diffStep.description || diffStep.operation}</strong>
                {diffStep.row_count_before != null && diffStep.row_count_after != null ? (
                  <span style={{ marginLeft: 10, fontSize: 10, color: diffStep.row_count_after >= diffStep.row_count_before ? "var(--gr)" : "var(--rd)" }}>
                    {diffStep.row_count_after >= diffStep.row_count_before ? "+" : ""}{(diffStep.row_count_after - diffStep.row_count_before).toLocaleString()} rows
                  </span>
                ) : null}
              </span>
              <button className="btn" style={{ height: 22, padding: "0 8px", fontSize: 10 }} onClick={() => { setDiffStep(null); setDiffBefore(null); setDiffAfter(null); }}>✕ Exit compare</button>
            </div>
            {diffLoading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx2)", fontSize: 12 }}>Loading comparison…</div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 1 }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--bd)" }}>
                  <div style={{ padding: "4px 10px", background: "var(--bg2)", borderBottom: "1px solid var(--bd)", fontSize: 10, color: "var(--tx2)", flexShrink: 0 }}>
                    BEFORE &nbsp;·&nbsp; {diffStep.inputDataset?.name ?? (steps.findIndex(s => s.id === diffStep.id) > 0 ? steps[steps.findIndex(s => s.id === diffStep.id) - 1].description || "prev step" : dataset?.name || "source")} &nbsp;·&nbsp; {(diffStep.row_count_before ?? diffBefore?.rows.length ?? 0).toLocaleString()} rows
                  </div>
                  <DataTable
                    loading={false}
                    rows={diffBefore?.rows ?? []}
                    columns={diffBefore?.cols ?? []}
                    stepCount={0}
                    lastAction=""
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "4px 10px", background: "var(--bg2)", borderBottom: "1px solid var(--bd)", fontSize: 10, color: "var(--tx2)", flexShrink: 0 }}>
                    AFTER &nbsp;·&nbsp; {diffStep.outputDataset?.name ?? diffStep.description ?? "this step"} &nbsp;·&nbsp; {(diffStep.row_count_after ?? diffAfter?.rows.length ?? 0).toLocaleString()} rows
                  </div>
                  <DataTable
                    loading={false}
                    rows={diffAfter?.rows ?? []}
                    columns={diffAfter?.cols ?? []}
                    stepCount={0}
                    lastAction=""
                  />
                </div>
              </div>
            )}
          </div>
        ) : tab === "pipeline" ? (
          <PipelineGraphTab />
        ) : tab === "schedule" && pipelineId ? (
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <PipelineScheduleTab pipelineId={pipelineId} />
          </div>
        ) : tab === "history" && dataset?.id ? (
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <DataVersionHistory datasetId={dataset.id} />
          </div>
        ) : tab === "data" ? (
          <DataTable
            loading={viewingStepIndex !== null ? timelineLoading : loading}
            rows={effectiveRows ?? []}
            columns={effectiveCols ?? []}
            stepCount={steps.length}
            lastAction={viewingStepIndex !== null ? "" : lastAction}
          />
        ) : (
          <CanvasView workspaceId={workspaceId} projectId={projectId} />
        )}
      </div>
    </section>
  );
}

interface ExportItemProps {
  label: string;
  sub: string;
  accent: string;
  badge?: string;
  onClick: () => void;
}

function ExportItem({ label, sub, accent, badge, onClick }: ExportItemProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "7px 14px",
        background: "none",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        color: "var(--tx0)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
    >
      {badge && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: accent,
          background: `${accent}22`,
          border: `1px solid ${accent}55`,
          borderRadius: 4,
          padding: "1px 4px",
          letterSpacing: "0.04em",
          flexShrink: 0,
          minWidth: 30,
          textAlign: "center",
        }}>{badge}</span>
      )}
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tx0)" }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 1 }}>{sub}</div>
      </div>
    </button>
  );
}
