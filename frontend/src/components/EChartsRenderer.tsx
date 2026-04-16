import { useRef } from "react";
import ReactECharts from "echarts-for-react";
import { ConditionalTable } from "./ConditionalTable";

interface EChartsRendererProps {
  /** Complete ECharts option object from backend, OR ConditionalTable envelope. Null = loading. */
  config: Record<string, unknown> | null;
  height?: number | string;
  /** Called with ECharts params when user clicks a bar/pie segment */
  onChartClick?: (params: unknown) => void;
  className?: string;
}

export function EChartsRenderer({
  config,
  height = 340,
  onChartClick,
  className = "",
}: EChartsRendererProps) {
  const chartRef = useRef<ReactECharts | null>(null);

  if (!config) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#94A3B8",
          fontSize: 13,
        }}
        className={className}
      >
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Building chart…
        </span>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  // ConditionalTable envelope
  if (config.__type === "table") {
    return (
      <ConditionalTable
        title={config.title as string | undefined}
        subtitle={config.subtitle as string | undefined}
        columns={(config.columns as string[] | undefined) ?? []}
        rows={(config.rows as unknown[][] | undefined) ?? []}
        rowCount={config.row_count as number | undefined}
        conditional={config.conditional as Array<{ row: number; type: string; color: string; bg: string }> | undefined}
        className={className}
      />
    );
  }

  // Standard ECharts option
  const onEvents = onChartClick
    ? { click: onChartClick }
    : undefined;

  return (
    <ReactECharts
      ref={chartRef}
      option={config}
      style={{ height, width: "100%" }}
      className={className}
      opts={{ renderer: "canvas", locale: "EN" }}
      onEvents={onEvents}
      lazyUpdate={false}
    />
  );
}
