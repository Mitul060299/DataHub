import { useState, useRef, useEffect, useCallback } from "react";
import { usePipelineContext } from "../contexts/PipelineContext";
import type { PipelineStep } from "../contexts/PipelineContext";
import type { Dataset } from "../contexts/WorkspaceContext";
import type { CalculatedColumn } from "../types";
import { IconBarChart, IconDownload, IconGitBranch, IconTable } from "./Icons";
import { DataTable } from "./DataTable";
import { CanvasView } from "./CanvasView";
import { PipelineGraphTab } from "./PipelineGraphTab";
import { PipelineScheduleTab } from "./PipelineScheduleTab";
import { DataVersionHistory } from "./DataVersionHistory";
import { api, exportDatasetCsv, exportDatasetPowerBI, exportDatasetTableau, fetchDatasetPage } from "../api";

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
  calculatedColumns: CalculatedColumn[];
  lastAction: string;
  onImport: () => void;
  onColumnsChanged: () => void;
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
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CanvasPanel({ workspaceId, projectId, pipelineId, dataset, loading, dataError, columns, rows, calculatedColumns, lastAction, onImport, onColumnsChanged, onSheetsExport, onArtifactSaved, sessionPreviewRows, sessionPreviewColumns, showingOriginal, onViewOriginal, onViewCleaned, onSave }: CanvasPanelProps) {
  const { steps, liveArtifact, runPipeline } = usePipelineContext();
  const [tab, setTab] = useState<CanvasTab>("data");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Export confirmation modal state ───────────────────────────────────────
  const [exportConfirmTarget, setExportConfirmTarget] = useState<"csv" | "powerbi" | "tableau" | null>(null);
  const [exportCheckpoint, setExportCheckpoint] = useState(false);

  // ── Timeline breadcrumb state ─────────────────────────────────────────────
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
      if (!step.inputDataset?.id || !step.outputDataset?.id) return;
      setDiffLoading(true);
      Promise.all([
        fetchDatasetPage(step.inputDataset.id, 0, 100) as Promise<{ rows: Record<string, unknown>[]; columns: string[] }>,
        fetchDatasetPage(step.outputDataset.id, 0, 100) as Promise<{ rows: Record<string, unknown>[]; columns: string[] }>,
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
  }, []);

  // Reset diff when steps change or dataset changes
  useEffect(() => { setDiffStep(null); setDiffBefore(null); setDiffAfter(null); }, [dataset?.id]);

  // Reset timeline when dataset or steps change
  useEffect(() => { setViewingStepIndex(null); setTimelineRows(null); setTimelineCols(null); }, [dataset?.id]);

  const handleTimelineClick = useCallback(async (idx: number) => {
    const step = steps[idx];
    if (!step?.outputDataset?.id) return;
    // Cancel any in-flight request
    timelineAbortRef.current?.abort();
    const controller = new AbortController();
    timelineAbortRef.current = controller;
    setViewingStepIndex(idx);
    setTimelineLoading(true);
    try {
      const data = await fetchDatasetPage(step.outputDataset.id, 0, 200) as { rows: Record<string, unknown>[]; columns: string[] };
      if (!controller.signal.aborted) {
        setTimelineRows(data.rows ?? []);
        setTimelineCols(data.columns ?? []);
      }
    } catch {
      if (!controller.signal.aborted) { setTimelineRows([]); setTimelineCols([]); }
    } finally {
      if (!controller.signal.aborted) setTimelineLoading(false);
    }
  }, [steps]);

  const handleTimelineReset = useCallback(() => {
    timelineAbortRef.current?.abort();
    setViewingStepIndex(null);
    setTimelineRows(null);
    setTimelineCols(null);
    setTimelineLoading(false);
  }, []);

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
              {columns.length} columns
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
      <div style={{ height: 40, borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", background: "var(--bg1)" }}>
        <div style={{ display: "inline-flex", gap: 6 }}>
          <button className="btn" onClick={() => setTab("data")} style={{ background: tab === "data" ? "var(--acl)" : "var(--bg3)", borderColor: tab === "data" ? "var(--acg)" : "var(--bd2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconTable size={14} />Data</span>
          </button>
          <button className="btn" onClick={() => setTab("pipeline")} style={{ background: tab === "pipeline" ? "var(--acl)" : "var(--bg3)", borderColor: tab === "pipeline" ? "var(--acg)" : "var(--bd2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <IconGitBranch size={14} />Pipeline
              {steps.length > 0 && (
                <span style={{ background: "var(--acg)", color: "var(--ac)", fontSize: 9, fontWeight: 700, borderRadius: 999, padding: "0 4px", lineHeight: "14px" }}>
                  {steps.length}
                </span>
              )}
            </span>
          </button>
          <button data-tour="canvas-tab" className="btn" onClick={() => setTab("canvas")} style={{ background: tab === "canvas" ? "var(--acl)" : "var(--bg3)", borderColor: tab === "canvas" ? "var(--acg)" : "var(--bd2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconBarChart size={14} />Canvas</span>
          </button>
          {pipelineId && (
            <button className="btn" onClick={() => setTab("schedule")} style={{ background: tab === "schedule" ? "var(--acl)" : "var(--bg3)", borderColor: tab === "schedule" ? "var(--acg)" : "var(--bd2)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>⏱ Schedule</span>
            </button>
          )}
          {dataset?.id && (
            <button className="btn" onClick={() => setTab("history")} style={{ background: tab === "history" ? "var(--acl)" : "var(--bg3)", borderColor: tab === "history" ? "var(--acg)" : "var(--bd2)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🕘 History</span>
            </button>
          )}
          <span className="mono" style={{ height: 30, padding: "0 10px", borderRadius: "var(--r6)", background: "var(--bg3)", border: "1px solid var(--bd2)", display: "inline-flex", alignItems: "center", color: "var(--tx1)" }}>
            {sessionPreviewRows && sessionPreviewRows.length > 0
              ? (liveArtifact?.stepLabel ?? "cleaned preview")
              : showingOriginal
              ? `${dataset?.name ?? "dataset"} (original)`
              : (dataset?.name ?? "No dataset")}
          </span>
        </div>

        {/* Export dropdown */}
        <div style={{ display: "inline-flex", gap: 6, position: "relative" }} ref={dropdownRef}>
          <button
            className="btn"
            title="Export dataset"
            disabled={!columns.length || isExporting !== null}
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
      {/* ── Timeline Breadcrumb ────────────────────────────────────────── */}
      {steps.length > 0 && tab === "data" && (
        <div style={{ height: 32, borderBottom: "1px solid var(--bd)", background: "var(--bg1)", display: "flex", alignItems: "center", padding: "0 10px", gap: 0, overflowX: "auto", flexShrink: 0 }}>
          <button
            onClick={handleTimelineReset}
            title="Go back to original source"
            style={{ flexShrink: 0, fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--bd2)", background: viewingStepIndex === null ? "var(--bg3)" : "transparent", color: "var(--tx2)", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Original
          </button>
          {steps.map((step, idx) => {
            const active = viewingStepIndex === idx;
            const isLast = idx === steps.length - 1;
            return (
              <span key={step.id} style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                <span style={{ color: "var(--tx2)", fontSize: 10, padding: "0 4px" }}>›</span>
                <button
                  onClick={() => { if (!step.outputDataset?.id) return; void handleTimelineClick(idx); }}
                  title={step.description}
                  style={{
                    flexShrink: 0,
                    fontSize: 10,
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: `1px solid ${active ? "var(--acg)" : isLast && viewingStepIndex === null ? "var(--acg)" : "var(--bd2)"}`,
                    background: active ? "var(--acl)" : isLast && viewingStepIndex === null ? "var(--acl)" : "transparent",
                    color: active || (isLast && viewingStepIndex === null) ? "var(--ac)" : "var(--tx2)",
                    cursor: step.outputDataset?.id ? "pointer" : "default",
                    whiteSpace: "nowrap",
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {isLast && viewingStepIndex === null ? "▶ " : ""}{step.description || `Step ${idx + 1}`}
                </button>
              </span>
            );
          })}
          {viewingStepIndex !== null && (
            <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
              <span style={{ color: "var(--tx2)", fontSize: 10, padding: "0 4px" }}>›</span>
              <button
                onClick={handleTimelineReset}
                style={{ flexShrink: 0, fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--bd2)", background: "transparent", color: "var(--tx2)", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                ← Current
              </button>
            </span>
          )}
          {timelineLoading && <span style={{ fontSize: 10, color: "var(--tx2)", marginLeft: 8, flexShrink: 0 }}>Loading…</span>}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {dataError && tab === "data" && (
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
          <div style={{ padding: "6px 14px", background: "rgba(34,197,94,0.08)", borderBottom: "1px solid rgba(34,197,94,0.2)", color: "#86efac", fontSize: 12, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span>🔄</span>
            <span style={{ flex: 1 }}>Your pipeline has {steps.length} step{steps.length === 1 ? "" : "s"} — run it to restore the cleaned preview.</span>
            <button
              onClick={() => { void runPipeline(); }}
              style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 4, color: "#86efac", fontSize: 11, padding: "2px 10px", cursor: "pointer", flexShrink: 0 }}
            >
              ▶ Run Pipeline
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
                    BEFORE &nbsp;·&nbsp; {diffStep.inputDataset?.name ?? "input"} &nbsp;·&nbsp; {(diffStep.row_count_before ?? diffBefore?.rows.length ?? 0).toLocaleString()} rows
                  </div>
                  <DataTable
                    datasetId={diffStep.inputDataset?.id}
                    loading={false}
                    rows={diffBefore?.rows ?? []}
                    columns={diffBefore?.cols ?? []}
                    calculatedColumns={[]}
                    stepCount={0}
                    lastAction=""
                    onColumnsChanged={onColumnsChanged}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "4px 10px", background: "var(--bg2)", borderBottom: "1px solid var(--bd)", fontSize: 10, color: "var(--tx2)", flexShrink: 0 }}>
                    AFTER &nbsp;·&nbsp; {diffStep.outputDataset?.name ?? "output"} &nbsp;·&nbsp; {(diffStep.row_count_after ?? diffAfter?.rows.length ?? 0).toLocaleString()} rows
                  </div>
                  <DataTable
                    datasetId={diffStep.outputDataset?.id}
                    loading={false}
                    rows={diffAfter?.rows ?? []}
                    columns={diffAfter?.cols ?? []}
                    calculatedColumns={[]}
                    stepCount={0}
                    lastAction=""
                    onColumnsChanged={onColumnsChanged}
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
            datasetId={dataset?.id}
            loading={viewingStepIndex !== null ? timelineLoading : loading}
            rows={effectiveRows}
            columns={effectiveCols}
            calculatedColumns={calculatedColumns}
            stepCount={steps.length}
            lastAction={viewingStepIndex !== null ? "" : lastAction}
            onColumnsChanged={onColumnsChanged}
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
