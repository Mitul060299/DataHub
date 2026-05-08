import { useState, useRef, useEffect, useCallback } from "react";
import { usePipelineContext } from "../contexts/PipelineContext";
import { usePipeline } from "../hooks/usePipeline";
import type { Dataset } from "../contexts/WorkspaceContext";
import { IconBarChart, IconClock, IconDownload, IconGitBranch, IconRefresh, IconTable } from "./Icons";
import { DataTable } from "./DataTable";
import { CanvasView } from "./CanvasView";
import { PipelineGraphTab } from "./PipelineGraphTab";
import { PipelineScheduleTab } from "./PipelineScheduleTab";
import { PipelineSection } from "./PipelineSection";
import { DataVersionHistory } from "./DataVersionHistory";
import { api, exportDatasetCsv, exportDatasetPowerBI, exportDatasetTableau, fetchDatasetPage, fetchSnapshotPreview, fetchStepPreview } from "../api";

type CanvasTab = "data" | "pipeline" | "canvas" | "schedule" | "history";

interface CanvasPanelProps {
  workspaceId?: string;
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
  /** Called whenever the active tab changes — lets the parent hide/show sibling panels */
  onTabChange?: (tab: CanvasTab) => void;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Defer revoke + DOM cleanup so the browser actually starts the download in Firefox / Safari.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1500);
}

export function CanvasPanel({ workspaceId, projectId, pipelineId, dataset, loading, dataError, columns, rows, lastAction, onImport, onSheetsExport, onArtifactSaved, sessionPreviewRows, sessionPreviewColumns, showingOriginal, onViewOriginal, onViewCleaned, onSave, onRunPipeline, replayingPipeline, replayError, onClearReplayError, onTabChange }: CanvasPanelProps) {
  const { steps, liveArtifact } = usePipelineContext();
  const { exportPipeline } = usePipeline();
  const [tab, setTab] = useState<CanvasTab>("data");

  const switchTab = (next: CanvasTab) => { setTab(next); onTabChange?.(next); };
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
      } else if (tableName && dataset?.id) {
        // Session may be dead after refresh — fall back to the persisted
        // chat session id (or a fresh uuid) so the backend can replay the
        // recorded pipeline_steps and serve the preview.
        const sessionId = liveArtifact?.sessionId
          || localStorage.getItem(`datahub_chat_session_${dataset.id}`)
          || crypto.randomUUID();
        if (!liveArtifact?.sessionId) {
          localStorage.setItem(`datahub_chat_session_${dataset.id}`, sessionId);
        }
        data = await fetchStepPreview(dataset.id, sessionId, tableName, 200, 0,
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
    const labelMap = { csv: "CSV", powerbi: "Excel", tableau: "Tableau" } as const;
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
      window.dispatchEvent(new CustomEvent("datahub:toast", {
        detail: { message: `${labelMap[type]} download started`, tone: "success" },
      }));
    } catch (err) {
      console.error(`Export ${type} failed:`, err);
      const msg = (err instanceof Error && err.message) ? err.message : "Export failed. Please try again.";
      window.dispatchEvent(new CustomEvent("datahub:toast", {
        detail: { message: `${labelMap[type]} export failed \u2014 ${msg}`, tone: "error" },
      }));
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
      {/* ── Global replay progress ribbon ── */}
      {replayingPipeline && (
        <div
          style={{
            height: 3,
            width: "100%",
            background: "linear-gradient(90deg, transparent, rgba(91,106,240,0.1) 20%, rgba(91,106,240,0.9) 50%, rgba(91,106,240,0.1) 80%, transparent)",
            backgroundSize: "200% 100%",
            animation: "replay-slide 1.2s linear infinite",
            flexShrink: 0,
          }}
        >
          <style>{`@keyframes replay-slide{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        </div>
      )}
      <div style={{ height: 40, borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", background: "var(--bg1)" }}>
        <div style={{ display: "inline-flex", gap: 3 }}>          {([
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
                onClick={() => switchTab(key as CanvasTab)}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 38,
                  height: 34,
                  border: active ? "1px solid rgba(91,106,240,0.2)" : "1px solid transparent",
                  borderRadius: 8,
                  background: active ? "rgba(91,106,240,0.12)" : "transparent",
                  color: active ? "var(--ac)" : "var(--tx2)",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                {icon}
                {badge != null && (
                  <span style={{ position: "absolute", top: 4, right: 3, background: "var(--ac)", color: "var(--bg1)", fontSize: 8, fontWeight: 800, borderRadius: 999, minWidth: 14, height: 14, lineHeight: "14px", textAlign: "center", padding: "0 3px" }}>
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
            data-tour="export-button"
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
      {viewingStepIndex !== null && tab === "data" && (() => {
        const stepDesc = steps[viewingStepIndex]?.description || `Step ${viewingStepIndex + 1}`;
        const dsName = dataset?.name ?? "";
        let cleanDesc = stepDesc;
        if (dsName && cleanDesc.toLowerCase().startsWith(dsName.toLowerCase())) {
          const rest = cleanDesc.slice(dsName.length).replace(/^\s*[-\u2013\u2014:_]\s*/, "").trim();
          if (rest) cleanDesc = rest.charAt(0).toUpperCase() + rest.slice(1);
        }
        return (
        <div style={{ minHeight: 36, borderBottom: "1px solid rgba(91,106,240,0.25)", background: "linear-gradient(90deg, rgba(91,106,240,0.12), rgba(124,58,237,0.08))", display: "flex", alignItems: "center", padding: "0 14px", gap: 10, flexShrink: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "rgba(91,106,240,0.22)", border: "1px solid rgba(91,106,240,0.45)", color: "#c7d2fe", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a5b4fc" }} />
            STEP {viewingStepIndex + 1} PREVIEW
          </span>
          <span style={{ flex: 1, fontSize: 12, color: "var(--tx0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {cleanDesc}
            {timelineLoading && <span style={{ marginLeft: 10, color: "var(--tx2)", fontSize: 11 }}>Loading\u2026</span>}
          </span>
          <button
            onClick={handleTimelineReset}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--bd2)", background: "var(--bg2)", color: "var(--tx1)", cursor: "pointer" }}
            title="Close preview and return to live data"
          >
            Close preview
          </button>
        </div>
        );
      })()}
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
        {tab === "pipeline" ? (
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
              <PipelineGraphTab />
            </div>
            <div style={{ width: 1, background: "var(--bd)", flexShrink: 0 }} />
            <div style={{ width: 300, flexShrink: 0, overflowY: "auto" }}>
              <PipelineSection
                onExport={() => exportPipeline(steps)}
                hideHeader
                onRunPipeline={onRunPipeline}
              />
            </div>
          </div>
        ) : tab === "schedule" && pipelineId ? (
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <PipelineScheduleTab pipelineId={pipelineId} />
          </div>
        ) : tab === "history" && dataset?.id ? (
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <DataVersionHistory datasetId={dataset.id} />
          </div>
        ) : tab === "data" ? (
          !dataset && !loading ? (
            <CanvasEmptyState onImport={onImport} />
          ) : (
            <DataTable
              loading={viewingStepIndex !== null ? timelineLoading : loading}
              rows={effectiveRows ?? []}
              columns={effectiveCols ?? []}
              stepCount={steps.length}
              lastAction={viewingStepIndex !== null ? "" : lastAction}
            />
          )
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

// ── Canvas empty state (no dataset selected) ────────────────────────────────
function CanvasEmptyState({ onImport }: { onImport: () => void }) {
  const samples: { title: string; sub: string; file: string; accent: string }[] = [
    { title: "Retail sales", sub: "Storewide transactions \u00b7 CSV", file: "/samples/sales_sample.csv", accent: "#5b6af0" },
    { title: "Employees", sub: "HR directory \u00b7 CSV", file: "/samples/employee_sample.csv", accent: "#22c55e" },
    { title: "Journal entries", sub: "Finance ledger \u00b7 CSV", file: "/samples/journal_entry_sample.csv", accent: "#f59e0b" },
  ];
  const loadSample = (file: string) => {
    window.dispatchEvent(new CustomEvent("datahub:sample:load", { detail: { url: file } }));
  };
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, overflow: "auto" }}>
      <style>{`
        @keyframes cs-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes cs-pulse { 0%, 100% { opacity: 0.5 } 50% { opacity: 1 } }
      `}</style>
      <div style={{ width: "100%", maxWidth: 720, textAlign: "center" }}>
        <div
          style={{
            margin: "0 auto 20px",
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(91,106,240,0.18), rgba(124,58,237,0.14))",
            border: "1px solid rgba(91,106,240,0.35)",
            display: "grid",
            placeItems: "center",
            animation: "cs-float 3.5s ease-in-out infinite",
            boxShadow: "0 8px 28px rgba(91,106,240,0.25)",
          }}
        >
          <IconTable size={26} color="#a5b4fc" />
        </div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "var(--tx0)", letterSpacing: "-0.01em" }}>
          Start with data
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--tx2)", lineHeight: 1.5 }}>
          Upload your own file, connect a database, or try a sample dataset below.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 420, margin: "0 auto 28px" }}>
          <button
            onClick={onImport}
            style={{
              padding: "14px 16px", borderRadius: 10, border: "1px solid var(--ac)",
              background: "linear-gradient(135deg, rgba(91,106,240,0.2), rgba(124,58,237,0.14))",
              color: "#c7d2fe", fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.15s ease",
              boxShadow: "0 4px 16px rgba(91,106,240,0.2)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 22px rgba(91,106,240,0.35)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(91,106,240,0.2)"; }}
          >
            Upload file
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("datahub:connect:database"))}
            style={{
              padding: "14px 16px", borderRadius: 10, border: "1px solid var(--bd2)",
              background: "var(--bg2)", color: "var(--tx0)", fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--bd3)"; e.currentTarget.style.background = "var(--bg3)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--bd2)"; e.currentTarget.style.background = "var(--bg2)"; }}
          >
            Connect database
          </button>
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--tx2)", marginBottom: 12 }}>
          TRY A SAMPLE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 640, margin: "0 auto" }}>
          {samples.map((s) => (
            <button
              key={s.file}
              onClick={() => loadSample(s.file)}
              style={{
                padding: "14px 14px", borderRadius: 10, border: "1px solid var(--bd)",
                background: "var(--bg2)", textAlign: "left", cursor: "pointer",
                display: "flex", flexDirection: "column", gap: 6,
                transition: "all 0.15s ease",
                position: "relative", overflow: "hidden",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = s.accent; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--bd)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.accent, boxShadow: `0 0 8px ${s.accent}`, animation: "cs-pulse 2s ease-in-out infinite" }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx0)" }}>{s.title}</div>
              <div style={{ fontSize: 11, color: "var(--tx2)" }}>{s.sub}</div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 28, fontSize: 11, color: "var(--tx2)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ padding: "2px 6px", border: "1px solid var(--bd2)", borderRadius: 4, background: "var(--bg2)", fontFamily: "monospace", fontSize: 10 }}>Ctrl K</span>
          <span>to open the command palette</span>
        </div>
      </div>
    </div>
  );
}
