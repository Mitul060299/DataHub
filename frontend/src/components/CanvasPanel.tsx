import { useState } from "react";
import { usePipelineContext } from "../contexts/PipelineContext";
import type { Dataset } from "../contexts/WorkspaceContext";
import type { CalculatedColumn } from "../types";
import { IconBarChart, IconDownload, IconPlay, IconTable, IconUpload } from "./Icons";
import { DataTable } from "./DataTable";
import { ChartView } from "./ChartView";

type CanvasTab = "data" | "charts";

interface CanvasPanelProps {
  workspaceId: string;
  dataset: Dataset | null;
  loading: boolean;
  columns: string[];
  rows: Record<string, unknown>[];
  calculatedColumns: CalculatedColumn[];
  lastAction: string;
  onImport: () => void;
  onExport: () => void;
  onRun: () => void;
  onColumnsChanged: () => void;
}

export function CanvasPanel({ workspaceId, dataset, loading, columns, rows, calculatedColumns, lastAction, onImport, onExport, onRun, onColumnsChanged }: CanvasPanelProps) {
  const { steps } = usePipelineContext();
  const [tab, setTab] = useState<CanvasTab>("data");

  return (
    <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ height: 40, borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", background: "var(--bg1)" }}>
        <div style={{ display: "inline-flex", gap: 6 }}>
          <button className="btn" onClick={() => setTab("data")} style={{ background: tab === "data" ? "var(--acl)" : "var(--bg3)", borderColor: tab === "data" ? "var(--acg)" : "var(--bd2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconTable size={14} />Data</span>
          </button>
          <button className="btn" onClick={() => setTab("charts")} style={{ background: tab === "charts" ? "var(--acl)" : "var(--bg3)", borderColor: tab === "charts" ? "var(--acg)" : "var(--bd2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconBarChart size={14} />Charts</span>
          </button>
          <span className="mono" style={{ height: 30, padding: "0 10px", borderRadius: "var(--r6)", background: "var(--bg3)", border: "1px solid var(--bd2)", display: "inline-flex", alignItems: "center", color: "var(--tx1)" }}>
            {dataset?.name ?? "No dataset"}
          </span>
        </div>
        <div style={{ display: "inline-flex", gap: 6 }}>
          <button className="btn" onClick={onImport}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconUpload size={14} />Import</span></button>
          <button className="btn" onClick={onExport}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconDownload size={14} />Export</span></button>
          <button className="btn btn-primary" onClick={onRun}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><IconPlay size={14} />Run</span></button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === "data" ? (
          <DataTable
            datasetId={dataset?.id}
            loading={loading}
            rows={rows}
            columns={columns}
            calculatedColumns={calculatedColumns}
            stepCount={steps.length}
            lastAction={lastAction}
            onColumnsChanged={onColumnsChanged}
          />
        ) : (
          <ChartView workspaceId={workspaceId} datasetId={dataset?.id} />
        )}
      </div>
    </section>
  );
}
