import { Button, Input, Select, Space, Typography, InputNumber } from "antd";
import { useEffect, useState } from "react";
import { updateWidget } from "../api";
import { DashboardWidget } from "../types";
import { useDatasets } from "../hooks/useDatasets";
import { notify } from "../utils/notify";

interface Props {
  dashboardId: string;
  widget: DashboardWidget;
  columns: string[];
  onUpdated: () => void;
  onError?: (message: string) => void;
}

export function WidgetEditor({ dashboardId, widget, columns, onUpdated, onError }: Props) {
  const [title, setTitle] = useState(widget.title);
  const [column, setColumn] = useState<string | undefined>(
    (widget.config?.column as string | undefined) ?? undefined
  );
  const [chartType, setChartType] = useState(widget.chart_type);
  const [datasetId, setDatasetId] = useState<string | undefined>(
    (widget.config?.dataset_id as string | undefined) ?? undefined
  );
  const [bins, setBins] = useState<number>((widget.config?.bins as number | undefined) ?? 10);
  const [topN, setTopN] = useState<number>((widget.config?.top_n as number | undefined) ?? 10);
  const [themeColor, setThemeColor] = useState<string>((widget.config?.theme_color as string | undefined) ?? "#1677ff");
  const { datasets } = useDatasets();
  const [error, setError] = useState<string | null>(null);

  const selectedDataset = datasets.find((d) => d.dataset_id === datasetId);
  const availableColumns = selectedDataset?.columns ?? columns;

  useEffect(() => {
    if (column && availableColumns.length > 0 && !availableColumns.includes(column)) {
      setColumn(undefined);
    }
  }, [availableColumns, column]);

  const handleSave = async () => {
    setError(null);
    try {
      await updateWidget(dashboardId, widget.widget_id, {
        title,
        column,
        chart_type: chartType,
        dataset_id: datasetId,
        bins: chartType === "summary" ? bins : undefined,
        top_n: chartType === "summary" ? topN : undefined,
        theme_color: themeColor
      });
      notify.success("Widget updated");
      onUpdated();
    } catch (err: any) {
      const message = err?.response?.data?.detail || "Failed to update widget.";
      setError(message);
      onError?.(message);
    }
  };

  return (
    <Space wrap>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ minWidth: 180 }}
      />
      <Select
        value={column}
        onChange={setColumn}
        options={availableColumns.map((col) => ({ label: col, value: col }))}
        style={{ minWidth: 160 }}
        disabled={chartType !== "summary"}
      />
      <Select
        value={datasetId}
        onChange={setDatasetId}
        options={datasets.map((d) => ({ label: d.dataset_id, value: d.dataset_id }))}
        style={{ minWidth: 180 }}
      />
      <Select
        value={chartType}
        onChange={setChartType}
        options={[
          { label: "Summary", value: "summary" },
          { label: "Table", value: "table" },
          { label: "Correlation", value: "correlation" }
        ]}
        style={{ minWidth: 140 }}
      />
      {chartType === "summary" && (
        <Space>
          <InputNumber
            min={3}
            max={50}
            value={bins}
            onChange={(value) => setBins(value ?? 10)}
          />
          <InputNumber
            min={3}
            max={50}
            value={topN}
            onChange={(value) => setTopN(value ?? 10)}
          />
        </Space>
      )}
      <Space>
        <Typography.Text type="secondary">Color</Typography.Text>
        <input
          type="color"
          value={themeColor}
          onChange={(event) => setThemeColor(event.target.value)}
          style={{ height: 28, width: 40, border: "none", background: "transparent" }}
        />
      </Space>
      <Button onClick={handleSave}>Save</Button>
      {error && <Typography.Text type="danger">{error}</Typography.Text>}
    </Space>
  );
}
