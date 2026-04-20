import { useState } from "react";
import { IconLayers, IconX } from "./Icons";
import { PipelineSection } from "./PipelineSection";
import { usePipeline } from "../hooks/usePipeline";
import { usePipelineContext } from "../contexts/PipelineContext";

interface PipelinePanelProps {
  width: number;
  onClose: () => void;
  onRunPipeline?: () => Promise<void>;
}

export function PipelinePanel({ width, onClose, onRunPipeline }: PipelinePanelProps) {
  const { steps } = usePipelineContext();
  const { exportPipeline } = usePipeline();

  const lastStep = steps[steps.length - 1];
  const lastRowCount = lastStep?.outputDataset?.rowCount ?? lastStep?.row_count_after ?? null;

  return (
    <aside
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        borderRight: "1px solid var(--bd)",
        background: "var(--bg1)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          height: 42,
          borderBottom: "1px solid var(--bd)",
          display: "flex",
          alignItems: "center",
          padding: "0 10px 0 12px",
          gap: 8,
          flexShrink: 0,
          background: "var(--bg1)",
        }}
      >
        <IconLayers size={14} color="var(--ac)" />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--tx1)",
            flex: 1,
          }}
        >
          PIPELINE
        </span>
        {steps.length > 0 && (
          <span
            style={{
              background: "var(--acg)",
              color: "var(--ac)",
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 999,
              padding: "1px 6px",
              lineHeight: "18px",
              whiteSpace: "nowrap",
            }}
          >
            {lastRowCount != null
              ? `${steps.length} · ${lastRowCount.toLocaleString()} rows`
              : `${steps.length}`}
          </span>
        )}
        <button
          title="Close pipeline panel"
          onClick={onClose}
          style={{
            width: 24,
            height: 24,
            borderRadius: "var(--r6)",
            border: "none",
            background: "transparent",
            display: "grid",
            placeItems: "center",
            color: "var(--tx2)",
            cursor: "pointer",
          }}
        >
          <IconX size={13} />
        </button>
      </div>

      {/* ── Pipeline steps content ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        <PipelineSection
          onExport={() => exportPipeline(steps)}
          hideHeader
          onRunPipeline={onRunPipeline}
        />
      </div>
    </aside>
  );
}
