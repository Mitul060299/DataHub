import { Button, Card, Input, List, Select, Space, Typography, InputNumber } from "antd";
import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { toSvg } from "html-to-image";
import { jsPDF } from "jspdf";
import { addWidget, deleteWidget, listWidgets, reorderWidgets } from "../api";
import { DashboardWidget } from "../types";
import { WidgetRenderer } from "./WidgetRenderer";
import { WidgetEditor } from "./WidgetEditor";
import { useDatasets } from "../hooks/useDatasets";
import { notify } from "../utils/notify";

interface Props {
  dashboardId: string | null;
  columns: string[];
}

export function WidgetsPanel({ dashboardId, columns }: Props) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [title, setTitle] = useState("");
  const [column, setColumn] = useState<string | undefined>(undefined);
  const [chartType, setChartType] = useState<string>("summary");
  const [datasetId, setDatasetId] = useState<string | undefined>(undefined);
  const [bins, setBins] = useState<number>(10);
  const [topN, setTopN] = useState<number>(10);
  const [themeColor, setThemeColor] = useState<string>("#1677ff");
  const { datasets } = useDatasets();
  const [error, setError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const selectedDataset = datasets.find((d) => d.dataset_id === datasetId);
  const availableColumns = selectedDataset?.columns ?? columns;

  const refresh = async () => {
    if (!dashboardId) return;
    const data = await listWidgets(dashboardId);
    setWidgets(data);
  };

  useEffect(() => {
    refresh();
  }, [dashboardId]);

  useEffect(() => {
    if (column && availableColumns.length > 0 && !availableColumns.includes(column)) {
      setColumn(undefined);
    }
  }, [availableColumns, column]);

  const handleAdd = async () => {
    if (!dashboardId || !datasetId || !title.trim()) return;
    if (chartType === "summary" && !column) return;
    setError(null);
    try {
      const prev = widgets;
      const tempWidget: DashboardWidget = {
        widget_id: `temp-${Date.now()}`,
        title: title.trim(),
        chart_type: chartType,
        config:
          chartType === "summary"
            ? { dataset_id: datasetId, column, bins, top_n: topN, theme_color: themeColor }
            : { dataset_id: datasetId, theme_color: themeColor }
      };
      setWidgets([...widgets, tempWidget]);
      await addWidget({
        dashboard_id: dashboardId,
        title: title.trim(),
        chart_type: chartType,
        dataset_id: datasetId,
        column,
        bins: chartType === "summary" ? bins : undefined,
        top_n: chartType === "summary" ? topN : undefined,
        theme_color: themeColor
      });
      setTitle("");
      await refresh();
      notify.success("Widget added");
    } catch (err: any) {
      setWidgets((current) => current.filter((w) => !w.widget_id.startsWith("temp-")));
      const message = err?.response?.data?.detail || "Failed to add widget.";
      setError(message);
    }
  };

  const handleDelete = async (widgetId: string) => {
    if (!dashboardId) return;
    const prev = widgets;
    setWidgets(widgets.filter((w) => w.widget_id !== widgetId));
    try {
      await deleteWidget(dashboardId, widgetId);
      await refresh();
      notify.success("Widget deleted");
    } catch (err: any) {
      setWidgets(prev);
      const message = err?.response?.data?.detail || "Failed to delete widget.";
      setError(message);
    }
  };

  const moveWidget = async (widgetId: string, direction: "up" | "down") => {
    if (!dashboardId) return;
    const index = widgets.findIndex((w) => w.widget_id === widgetId);
    if (index < 0) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= widgets.length) return;
    const prev = widgets;
    const reordered = [...widgets];
    const temp = reordered[index];
    reordered[index] = reordered[swapIndex];
    reordered[swapIndex] = temp;
    setWidgets(reordered);
    try {
      const result = await reorderWidgets(dashboardId, reordered.map((w) => w.widget_id));
      if (result?.widgets) {
        setWidgets(result.widgets);
      }
      notify.success("Widgets reordered");
    } catch (err: any) {
      setWidgets(prev);
      const message = err?.response?.data?.detail || "Failed to reorder widgets.";
      setError(message);
    }
  };

  const handleDropReorder = async (targetId: string) => {
    if (!dashboardId || !draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const currentIndex = widgets.findIndex((w) => w.widget_id === draggingId);
    const targetIndex = widgets.findIndex((w) => w.widget_id === targetId);
    if (currentIndex < 0 || targetIndex < 0) {
      setDraggingId(null);
      return;
    }
    const reordered = [...widgets];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const prev = widgets;
    setWidgets(reordered);
    try {
      const result = await reorderWidgets(dashboardId, reordered.map((w) => w.widget_id));
      if (result?.widgets) {
        setWidgets(result.widgets);
      }
      notify.success("Widgets reordered");
    } catch (err: any) {
      setWidgets(prev);
      const message = err?.response?.data?.detail || "Failed to reorder widgets.";
      setError(message);
    } finally {
      setDraggingId(null);
    }
  };

  const handleExportPng = async () => {
    if (!exportRef.current) return;
    try {
      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        backgroundColor: "#ffffff"
      });
      const url = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = url;
      link.download = `dashboard-${dashboardId || "export"}.png`;
      link.click();
      notify.success("Dashboard exported as PNG");
    } catch (err: any) {
      const message = err?.message || "Failed to export PNG.";
      setError(message);
    }
  };

  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    try {
      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        backgroundColor: "#ffffff"
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let position = 0;
      let remainingHeight = imgHeight;
      while (remainingHeight > 0) {
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        remainingHeight -= pageHeight;
        position -= pageHeight;
        if (remainingHeight > 0) {
          pdf.addPage();
        }
      }
      pdf.save(`dashboard-${dashboardId || "export"}.pdf`);
      notify.success("Dashboard exported as PDF");
    } catch (err: any) {
      const message = err?.message || "Failed to export PDF.";
      setError(message);
    }
  };

  const handleExportSvg = async () => {
    if (!exportRef.current) return;
    try {
      const svgData = await toSvg(exportRef.current, {
        cacheBust: true,
        backgroundColor: "#ffffff"
      });
      const link = document.createElement("a");
      link.href = svgData;
      link.download = `dashboard-${dashboardId || "export"}.svg`;
      link.click();
      notify.success("Dashboard exported as SVG");
    } catch (err: any) {
      const message = err?.message || "Failed to export SVG.";
      setError(message);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Input
            placeholder="Widget title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ minWidth: 200 }}
          />
          <Select
            placeholder="Select column"
            value={column}
            onChange={setColumn}
            options={availableColumns.map((col) => ({ label: col, value: col }))}
            style={{ minWidth: 200 }}
            disabled={chartType !== "summary"}
          />
          <Select
            placeholder="Dataset"
            value={datasetId}
            onChange={setDatasetId}
            options={datasets.map((d) => ({ label: d.dataset_id, value: d.dataset_id }))}
            style={{ minWidth: 200 }}
          />
          <Select
            placeholder="Widget type"
            value={chartType}
            onChange={setChartType}
            style={{ minWidth: 160 }}
            options={[
              { label: "Summary", value: "summary" },
              { label: "Table", value: "table" },
              { label: "Correlation", value: "correlation" }
            ]}
          />
          {chartType === "summary" && (
            <Space>
              <InputNumber
                min={3}
                max={50}
                value={bins}
                onChange={(value) => setBins(value ?? 10)}
                placeholder="Bins"
              />
              <InputNumber
                min={3}
                max={50}
                value={topN}
                onChange={(value) => setTopN(value ?? 10)}
                placeholder="Top N"
              />
            </Space>
          )}
          <Space>
            <Typography.Text type="secondary">Color</Typography.Text>
            <input
              type="color"
              value={themeColor}
              onChange={(event) => setThemeColor(event.target.value)}
              style={{ height: 32, width: 42, border: "none", background: "transparent" }}
            />
          </Space>
          <Button type="primary" onClick={handleAdd}>
            Add Widget
          </Button>
          <Button onClick={handleExportPng} disabled={!widgets.length}>
            Export PNG
          </Button>
          <Button onClick={handleExportPdf} disabled={!widgets.length}>
            Export PDF
          </Button>
          <Button onClick={handleExportSvg} disabled={!widgets.length}>
            Export SVG
          </Button>
        </Space>
        {error && <Typography.Text type="danger">{error}</Typography.Text>}
        <div ref={exportRef}>
          <List
            dataSource={widgets}
            renderItem={(item) => (
              <List.Item
                draggable
                onDragStart={() => setDraggingId(item.widget_id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDropReorder(item.widget_id)}
                style={{ border: draggingId === item.widget_id ? "1px dashed #1677ff" : undefined }}
              >
                <Space direction="vertical" style={{ width: "100%" }}>
                  <WidgetRenderer widget={item} />
                  {dashboardId && (
                    <WidgetEditor
                      dashboardId={dashboardId}
                      widget={item}
                      columns={columns}
                      onUpdated={refresh}
                      onError={setError}
                    />
                  )}
                  {dashboardId && (
                    <Space>
                      <Typography.Text type="secondary">
                        Drag to reorder
                      </Typography.Text>
                      <Button onClick={() => moveWidget(item.widget_id, "up")}>Up</Button>
                      <Button onClick={() => moveWidget(item.widget_id, "down")}>Down</Button>
                      <Button danger onClick={() => handleDelete(item.widget_id)}>
                        Delete
                      </Button>
                    </Space>
                  )}
                </Space>
              </List.Item>
            )}
          />
        </div>
      </Space>
    </Card>
  );
}
