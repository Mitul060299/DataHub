import type { CSSProperties } from "react";

interface MetricThreshold {
  value: number;
  color?: string; // "red" | "green" etc. — overrides default conditional
}

interface MetricTileProps {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "neutral";
  threshold?: MetricThreshold;
  subtitle?: string;
  className?: string;
  style?: CSSProperties;
  /** Array of numeric data points to render as a sparkline (min 2 points). */
  sparkline_data?: number[];
  /** Percentage change to display alongside the value, e.g. 12.5 for +12.5%. */
  delta_pct?: number;
}

function getTrendIcon(trend?: "up" | "down" | "neutral") {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  if (trend === "neutral") return "→";
  return null;
}

function getTrendColor(trend?: "up" | "down" | "neutral") {
  if (trend === "up") return "#22C55E";   // green-500
  if (trend === "down") return "#EF4444"; // red-500
  return "#94A3B8";                        // slate-400
}

function getBackgroundColor(
  value: string | number,
  threshold?: MetricThreshold
): string {
  if (!threshold) return "transparent";
  const numVal = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(numVal)) return "transparent";
  if (threshold.color) {
    // explicit color override
    return threshold.color === "red"
      ? "rgba(239,68,68,0.12)"
      : threshold.color === "green"
      ? "rgba(34,197,94,0.12)"
      : "transparent";
  }
  // default: red if above threshold, green if below
  return numVal > threshold.value
    ? "rgba(239,68,68,0.12)"
    : "rgba(34,197,94,0.12)";
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const W = 80;
  const H = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible", flexShrink: 0 }}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}

export function MetricTile({
  label,
  value,
  trend,
  threshold,
  subtitle,
  className = "",
  style: styleProp,
  sparkline_data,
  delta_pct,
}: MetricTileProps) {
  const bg = getBackgroundColor(value, threshold);
  const trendIcon = getTrendIcon(trend);
  const trendColor = getTrendColor(trend);

  return (
    <div
      className={className}
      style={{
        background: bg || "#121827",
        border: "1px solid #1E293B",
        borderRadius: 10,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        height: "100%",
        ...styleProp,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#64748B",
        }}
      >
        {label}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "#E2E8F0",
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>

        {trendIcon && (
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: trendColor,
              background: `${trendColor}20`,
              borderRadius: 6,
              padding: "2px 8px",
              lineHeight: 1.4,
            }}
          >
            {trendIcon}
          </span>
        )}
      </div>

      {subtitle && (
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
          {subtitle}
        </div>
      )}

      {(sparkline_data && sparkline_data.length >= 2) || delta_pct != null ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          {delta_pct != null ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: delta_pct >= 0 ? "#22C55E" : "#EF4444",
                background: delta_pct >= 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                borderRadius: 5,
                padding: "2px 6px",
              }}
            >
              {delta_pct >= 0 ? "+" : ""}{delta_pct.toFixed(1)}%
            </span>
          ) : <span />}
          {sparkline_data && sparkline_data.length >= 2 && (
            <Sparkline
              data={sparkline_data}
              color={trend === "down" ? "#EF4444" : trend === "neutral" ? "#94A3B8" : "#22C55E"}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
