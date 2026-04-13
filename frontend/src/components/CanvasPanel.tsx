import { useState, useRef, useEffect, useCallback } from "react";
import { usePipelineContext } from "../contexts/PipelineContext";
import type { Dataset } from "../contexts/WorkspaceContext";
import type { CalculatedColumn } from "../types";
import { IconBarChart, IconDownload, IconGitBranch, IconTable } from "./Icons";
import { DataTable } from "./DataTable";
import { CanvasView } from "./CanvasView";
import { PipelineGraphTab } from "./PipelineGraphTab";
import { api, exportDatasetCsv, exportDatasetPowerBI, exportDatasetTableau } from "../api";

type CanvasTab = "data" | "pipeline" | "canvas";

interface CanvasPanelProps {
  workspaceId: string;
  projectId: string;
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
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CanvasPanel({ workspaceId, projectId, dataset, loading, dataError, columns, rows, calculatedColumns, lastAction, onImport, onColumnsChanged, onSheetsExport, onArtifactSaved, sessionPreviewRows, sessionPreviewColumns }: CanvasPanelProps) {
  const { steps, liveArtifact } = usePipelineContext();
  const [tab, setTab] = useState<CanvasTab>("data");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // dataset.rows is the authoritative count (always set by setActiveDataset callers)
  // dataset.row_count is the new optional field; fall back to rows if not present
  const rowCount = dataset?.rows ?? dataset?.row_count ?? null;

  return (
    <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
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
          <span className="mono" style={{ height: 30, padding: "0 10px", borderRadius: "var(--r6)", background: "var(--bg3)", border: "1px solid var(--bd2)", display: "inline-flex", alignItems: "center", color: "var(--tx1)" }}>
            {dataset?.name ?? "No dataset"}
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
                label="Export to Power BI"
                sub=".xlsx · Power BI Desktop"
                accent="#F2C811"
                badge="BI"
                onClick={() => void handleExport("powerbi")}
              />
              <ExportItem
                label="Export to Tableau"
                sub=".hyper · Tableau Desktop"
                accent="#E97627"
                badge="VIZ"
                onClick={() => void handleExport("tableau")}
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
                sub="Universal · Excel compatible"
                accent="#9898b0"
                onClick={() => void handleExport("csv")}
              />
            </div>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {dataError && tab === "data" && (
          <div style={{ padding: "10px 16px", background: "rgba(248,113,113,0.08)", borderBottom: "1px solid rgba(248,113,113,0.2)", color: "var(--rd)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <span>⚠</span>
            <span>{dataError}</span>
          </div>
        )}
        {/* Amber banner shown when Canvas displays a session-only preview */}
        {tab === "data" && sessionPreviewRows && sessionPreviewRows.length > 0 && (
          <div style={{ padding: "6px 14px", background: "rgba(234,179,8,0.1)", borderBottom: "1px solid rgba(234,179,8,0.25)", color: "#fde68a", fontSize: 12, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span>⚡</span>
            <span style={{ flex: 1 }}>Showing transformed preview ({sessionPreviewRows.length} rows)</span>
            <span style={{ opacity: 0.5, fontSize: 11, flexShrink: 0 }}>rename &amp; save in sidebar →</span>
          </div>
        )}
        {tab === "pipeline" ? (
          <PipelineGraphTab />
        ) : tab === "data" ? (
          <DataTable
            datasetId={dataset?.id}
            loading={loading}
            rows={sessionPreviewRows && sessionPreviewRows.length > 0 ? sessionPreviewRows : rows}
            columns={sessionPreviewColumns && sessionPreviewColumns.length > 0 ? sessionPreviewColumns : columns}
            calculatedColumns={calculatedColumns}
            stepCount={steps.length}
            lastAction={lastAction}
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
