import { Button, Card, Table, Typography } from "antd";
import { useEffect, useState } from "react";
import { fetchChartSummary, fetchDatasetPage, fetchCorrelationSummary } from "../api";
import { ChartSummary, DashboardWidget, DatasetPage, CorrelationSummary } from "../types";

interface Props {
  widget: DashboardWidget;
}

export function WidgetRenderer({ widget }: Props) {
  const [summary, setSummary] = useState<ChartSummary | null>(null);
  const [page, setPage] = useState<DatasetPage | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const datasetId = widget.config?.dataset_id as string | undefined;
    const column = widget.config?.column as string | undefined;
    const bins = widget.config?.bins as number | undefined;
    const topN = widget.config?.top_n as number | undefined;
    const themeColor = (widget.config?.theme_color as string | undefined) ?? "#1677ff";
    setSummary(null);
    setPage(null);
    setCorrelation(null);
    setError(null);
    setLoading(false);

    if (!datasetId || (widget.chart_type === "summary" && !column)) {
      setError("Missing dataset or column configuration.");
      return () => {
        active = false;
      };
    }

    const load = async () => {
      try {
        setLoading(true);
        if (widget.chart_type === "table") {
          const data = await fetchDatasetPage(datasetId, 0, 10);
          if (active) {
            setPage(data);
          }
          return;
        }
        if (widget.chart_type === "correlation") {
          const data = await fetchCorrelationSummary(datasetId);
          if (active) {
            setCorrelation(data);
          }
          return;
        }
        const data = await fetchChartSummary(datasetId, column, {
          bins,
          top_n: topN
        });
        if (active) {
          setSummary(data);
        }
      } catch (err) {
        if (active) {
          setError("Unable to load widget data.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [widget, reloadKey]);

  return (
    <Card size="small" style={{ marginBottom: 12 }}>
      <Typography.Text strong>{widget.title}</Typography.Text>
      {loading && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
          Loading widget data...
        </Typography.Paragraph>
      )}
      {error && (
        <Typography.Paragraph type="danger" style={{ marginTop: 8 }}>
          {error}
        </Typography.Paragraph>
      )}
      {error && (
        <Button size="small" onClick={() => setReloadKey((prev) => prev + 1)}>
          Retry
        </Button>
      )}
      {widget.chart_type === "table" && page && (
        <Table
          size="small"
          dataSource={page.rows.map((row, index) => ({ key: index, ...row }))}
          columns={page.columns.map((col) => ({ title: col, dataIndex: col, key: col }))}
          pagination={false}
          scroll={{ x: true }}
          style={{ marginTop: 8 }}
        />
      )}
      {summary && (
        <div style={{ marginTop: 8 }}>
          <Typography.Text type="secondary">
            {summary.kind} widget
          </Typography.Text>
          <div style={{ marginTop: 6 }}>
            {summary.series.map((item) => (
              <div key={item.label} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                <div style={{ minWidth: 120 }}>{item.label}</div>
                <div style={{ flex: 1, background: "#f0f0f0" }}>
                  <div
                    style={{
                      width: `${Math.min(item.value * 8, 100)}%`,
                      background: themeColor,
                      height: 10
                    }}
                  />
                </div>
                <div>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {correlation && (
        <div style={{ marginTop: 8 }}>
          <Typography.Text type="secondary">Top correlations</Typography.Text>
          <div style={{ marginTop: 6 }}>
            {correlation.pairs.map((item) => (
              <div key={`${item.column_a}-${item.column_b}`} style={{ marginBottom: 4 }}>
                <span style={{ color: themeColor }}>
                  {item.column_a} ↔ {item.column_b}: {item.value.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
