import { Card, Select, Typography, Space, Slider, Switch } from "antd";
import { useEffect, useState } from "react";
import { fetchChartSummary } from "../api";
import { ChartSummary } from "../types";

interface Props {
  datasetId: string | null;
  columns: string[];
}

export function ChartSummaryPanel({ datasetId, columns }: Props) {
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<ChartSummary | null>(null);
  const [bins, setBins] = useState(10);
  const [topN, setTopN] = useState(10);
  const [normalize, setNormalize] = useState(false);

  useEffect(() => {
    if (!datasetId || !selected) {
      setSummary(null);
      return;
    }

    fetchChartSummary(datasetId, selected, { bins, top_n: topN }).then(setSummary);
  }, [datasetId, selected, bins, topN]);

  return (
    <Card>
      <Space wrap>
        <Select
          placeholder="Select column"
          options={columns.map((col) => ({ label: col, value: col }))}
          value={selected}
          onChange={setSelected}
          style={{ minWidth: 200 }}
        />
        <div style={{ minWidth: 180 }}>
          <Typography.Text type="secondary">Bins</Typography.Text>
          <Slider min={3} max={30} value={bins} onChange={setBins} />
        </div>
        <div style={{ minWidth: 180 }}>
          <Typography.Text type="secondary">Top N</Typography.Text>
          <Slider min={3} max={30} value={topN} onChange={setTopN} />
        </div>
        <Space align="center">
          <Typography.Text type="secondary">Normalize</Typography.Text>
          <Switch checked={normalize} onChange={setNormalize} />
        </Space>
      </Space>
      {summary && (
        <div style={{ marginTop: 12 }}>
          <Typography.Text type="secondary">
            {summary.kind} summary
          </Typography.Text>
          <div style={{ marginTop: 8 }}>
            {summary.series.map((item) => {
              const total = summary.series.reduce((acc, cur) => acc + cur.value, 0) || 1;
              const value = normalize ? Math.round((item.value / total) * 100) : item.value;
              const label = normalize ? `${value}%` : item.value;
              return (
              <div key={item.label} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                <div style={{ minWidth: 120 }}>{item.label}</div>
                <div style={{ flex: 1, background: "#f0f0f0" }}>
                  <div
                    style={{
                      width: `${Math.min(value * (normalize ? 1 : 8), 100)}%`,
                      background: "#1677ff",
                      height: 12
                    }}
                  />
                </div>
                <div>{label}</div>
              </div>
            );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
