import {
  Button,
  Card,
  Collapse,
  Divider,
  Dropdown,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  DragOutlined,
  EditOutlined,
  ExportOutlined,
  EyeOutlined,
  LineChartOutlined,
  SaveOutlined,
  SettingOutlined,
  ShareAltOutlined,
  SlidersOutlined,
  SwapOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import type { Layout, Layouts } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { notify } from "../utils/notify";
import { AIChat, type AIAction, type DatasetSummary } from "./ai/AIChat";

const { Text, Title } = Typography;
const ResponsiveGridLayout = WidthProvider(Responsive);

const SAMPLE_DATA = [
  { name: "Jan", value: 420, count: 20 },
  { name: "Feb", value: 680, count: 32 },
  { name: "Mar", value: 540, count: 26 },
  { name: "Apr", value: 760, count: 40 },
  { name: "May", value: 590, count: 28 },
  { name: "Jun", value: 830, count: 46 },
];

const METRIC_DATA = {
  value: 124_580,
  delta: 0.12,
};

type WidgetType =
  | "line"
  | "bar"
  | "pie"
  | "scatter"
  | "heatmap"
  | "area"
  | "kpi"
  | "gauge"
  | "progress"
  | "comparison"
  | "table"
  | "pivot"
  | "summary"
  | "date_filter"
  | "dropdown_filter"
  | "multi_filter"
  | "title"
  | "description"
  | "markdown";

type WidgetConfig = {
  dataset?: string;
  measure?: string;
  dimension?: string;
  aggregation?: string;
  title?: string;
  palette?: string;
  legend?: boolean;
  axisLabels?: boolean;
  numberFormat?: string;
  sorting?: string;
  limit?: number;
  calc?: string;
  conditionalFormat?: string;
};

type WidgetItem = {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  config: WidgetConfig;
  status: "loading" | "ready" | "error";
};

type DashboardMeta = {
  name: string;
  description: string;
  owner: string;
};

const WIDGET_LIBRARY: Array<{ key: string; label: string; items: Array<{ type: WidgetType; label: string }> }> = [
  {
    key: "charts",
    label: "Charts",
    items: [
      { type: "line", label: "Line chart" },
      { type: "bar", label: "Bar chart" },
      { type: "pie", label: "Pie chart" },
      { type: "scatter", label: "Scatter plot" },
      { type: "heatmap", label: "Heatmap" },
      { type: "area", label: "Area chart" },
    ],
  },
  {
    key: "metrics",
    label: "Metrics",
    items: [
      { type: "kpi", label: "Single value (KPI)" },
      { type: "gauge", label: "Gauge" },
      { type: "progress", label: "Progress bar" },
      { type: "comparison", label: "Comparison" },
    ],
  },
  {
    key: "tables",
    label: "Tables",
    items: [
      { type: "table", label: "Data table" },
      { type: "pivot", label: "Pivot table" },
      { type: "summary", label: "Summary table" },
    ],
  },
  {
    key: "filters",
    label: "Filters",
    items: [
      { type: "date_filter", label: "Date range picker" },
      { type: "dropdown_filter", label: "Dropdown filter" },
      { type: "multi_filter", label: "Multi-select filter" },
    ],
  },
  {
    key: "text",
    label: "Text",
    items: [
      { type: "title", label: "Title / heading" },
      { type: "description", label: "Description text" },
      { type: "markdown", label: "Markdown block" },
    ],
  },
];

const TEMPLATE_LIBRARY = [
  { id: "sales", name: "Sales Dashboard" },
  { id: "marketing", name: "Marketing Analytics" },
  { id: "finance", name: "Financial KPIs" },
  { id: "customer", name: "Customer Overview" },
  { id: "inventory", name: "Inventory Management" },
];

const DEFAULT_WIDGET_SIZE: Record<string, { w: number; h: number }> = {
  chart: { w: 6, h: 6 },
  metric: { w: 3, h: 4 },
  table: { w: 6, h: 5 },
  filter: { w: 3, h: 3 },
  text: { w: 6, h: 3 },
};

const getWidgetSize = (type: WidgetType) => {
  if (["line", "bar", "pie", "scatter", "heatmap", "area"].includes(type)) {
    return DEFAULT_WIDGET_SIZE.chart;
  }
  if (["kpi", "gauge", "progress", "comparison"].includes(type)) {
    return DEFAULT_WIDGET_SIZE.metric;
  }
  if (["table", "pivot", "summary"].includes(type)) {
    return DEFAULT_WIDGET_SIZE.table;
  }
  if (["date_filter", "dropdown_filter", "multi_filter"].includes(type)) {
    return DEFAULT_WIDGET_SIZE.filter;
  }
  return DEFAULT_WIDGET_SIZE.text;
};

const createWidget = (type: WidgetType, position: { x: number; y: number }) => {
  const size = getWidgetSize(type);
  return {
    id: `widget-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    type,
    x: position.x,
    y: position.y,
    w: size.w,
    h: size.h,
    zIndex: 1,
    config: {
      title: `${type.replace(/_/g, " ")}`,
      legend: true,
      palette: "indigo",
      axisLabels: true,
      aggregation: "sum",
    },
    status: "loading" as const,
  };
};

const WIDGET_LABEL: Record<WidgetType, string> = {
  line: "Line chart",
  bar: "Bar chart",
  pie: "Pie chart",
  scatter: "Scatter plot",
  heatmap: "Heatmap",
  area: "Area chart",
  kpi: "KPI",
  gauge: "Gauge",
  progress: "Progress",
  comparison: "Comparison",
  table: "Data table",
  pivot: "Pivot table",
  summary: "Summary table",
  date_filter: "Date filter",
  dropdown_filter: "Dropdown filter",
  multi_filter: "Multi-select filter",
  title: "Title",
  description: "Description",
  markdown: "Markdown",
};

const getWidgetCategoryIcon = (type: WidgetType) => {
  if (["line", "bar", "pie", "scatter", "heatmap", "area"].includes(type)) {
    return <LineChartOutlined />;
  }
  if (["kpi", "gauge", "progress", "comparison"].includes(type)) {
    return <SlidersOutlined />;
  }
  if (["table", "pivot", "summary"].includes(type)) {
    return <SwapOutlined />;
  }
  if (["date_filter", "dropdown_filter", "multi_filter"].includes(type)) {
    return <EditOutlined />;
  }
  return <DragOutlined />;
};

const buildLayouts = (widgets: WidgetItem[], selectedIds: string[]): Layout[] =>
  widgets.map((widget) => ({
    i: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    isResizable: selectedIds.includes(widget.id),
    isDraggable: true,
  }));

export function DashboardBuilderPanel() {
  const [widgets, setWidgets] = useState<WidgetItem[]>([createWidget("line", { x: 0, y: 0 })]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draggingType, setDraggingType] = useState<WidgetType | null>(null);
  const [undoStack, setUndoStack] = useState<WidgetItem[][]>([]);
  const [redoStack, setRedoStack] = useState<WidgetItem[][]>([]);
  const [clipboard, setClipboard] = useState<WidgetItem[] | null>(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [meta, setMeta] = useState<DashboardMeta>({
    name: "Quarterly Performance",
    description: "Executive overview of revenue and pipeline health.",
    owner: "Data Team",
  });
  const [dirty, setDirty] = useState(false);

  const dataset: DatasetSummary = {
    id: "sales_2024",
    name: "sales_2024",
    columns: ["revenue", "orders", "region", "product"],
  };

  const layouts = useMemo<Layouts>(
    () => ({
      lg: buildLayouts(widgets, selectedIds),
      md: buildLayouts(widgets, selectedIds),
      sm: buildLayouts(widgets, selectedIds),
      xs: buildLayouts(widgets, selectedIds),
    }),
    [widgets, selectedIds]
  );

  const selectedWidget = widgets.find((widget) => widget.id === selectedIds[0]) || null;

  const pushHistory = (next: WidgetItem[]) => {
    setUndoStack((prev) => [...prev, widgets]);
    setRedoStack([]);
    setWidgets(next);
    setDirty(true);
  };

  const updateWidgets = (updater: (current: WidgetItem[]) => WidgetItem[]) => {
    pushHistory(updater(widgets));
  };

  const handleAddWidget = (type: WidgetType, position?: { x: number; y: number }) => {
    const widget = createWidget(type, position || { x: 0, y: Infinity });
    updateWidgets((prev) => [...prev, widget]);
    setSelectedIds([widget.id]);
    setTimeout(() => {
      setWidgets((prev) =>
        prev.map((item) => (item.id === widget.id ? { ...item, status: "ready" } : item))
      );
    }, 600);
  };

  const handleDrop = (_layout: Layout[], item: Layout, event: unknown) => {
    const dragEvent = event as DragEvent | undefined;
    const type = (dragEvent?.dataTransfer?.getData("widget-type") || draggingType) as WidgetType;
    if (!type) return;
    handleAddWidget(type, { x: item.x, y: item.y });
    setDraggingType(null);
  };

  const updateLayout = (currentLayout: Layout[]) => {
    setWidgets((prev) =>
      prev.map((widget) => {
        const layoutItem = currentLayout.find((item) => item.i === widget.id);
        if (!layoutItem) return widget;
        return { ...widget, x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h };
      })
    );
  };

  const handleSelect = (id: string, multi: boolean) => {
    setSelectedIds((prev) => {
      if (multi) {
        return prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      }
      return [id];
    });
  };

  const handleDelete = () => {
    if (selectedIds.length === 0) return;
    updateWidgets((prev) => prev.filter((widget) => !selectedIds.includes(widget.id)));
    setSelectedIds([]);
  };

  const handleDuplicate = () => {
    if (selectedIds.length === 0) return;
    updateWidgets((prev) => {
      const next = [...prev];
      selectedIds.forEach((id) => {
        const target = prev.find((widget) => widget.id === id);
        if (target) {
          next.push({
            ...target,
            id: `widget-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            x: target.x + 1,
            y: target.y + 1,
            zIndex: target.zIndex + 1,
          });
        }
      });
      return next;
    });
  };

  const handleAIAction = (action: AIAction) => {
    switch (action.type) {
      case "add_chart":
        handleAddWidget("line");
        break;
      case "add_kpi":
        handleAddWidget("kpi");
        break;
      case "add_filter":
        handleAddWidget("date_filter");
        break;
      case "save_dashboard":
        notify.success("Dashboard saved");
        break;
      default:
        notify.info(`AI action: ${action.type}`);
    }
  };

  const handleCopy = () => {
    const copied = widgets.filter((widget) => selectedIds.includes(widget.id));
    if (copied.length === 0) return;
    setClipboard(copied);
    notify.success("Widgets copied");
  };

  const handlePaste = () => {
    if (!clipboard || clipboard.length === 0) return;
    updateWidgets((prev) => [
      ...prev,
      ...clipboard.map((widget) => ({
        ...widget,
        id: `widget-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        x: widget.x + 1,
        y: widget.y + 1,
        zIndex: widget.zIndex + 1,
      })),
    ]);
  };

  const handleAlign = (mode: "top" | "bottom") => {
    if (selectedIds.length < 2) return;
    updateWidgets((prev) => {
      const selected = prev.filter((widget) => selectedIds.includes(widget.id));
      const targetY = mode === "top"
        ? Math.min(...selected.map((widget) => widget.y))
        : Math.max(...selected.map((widget) => widget.y));
      return prev.map((widget) =>
        selectedIds.includes(widget.id) ? { ...widget, y: targetY } : widget
      );
    });
  };

  const handleZIndex = (direction: "front" | "back") => {
    updateWidgets((prev) =>
      prev.map((widget) =>
        selectedIds.includes(widget.id)
          ? { ...widget, zIndex: direction === "front" ? widget.zIndex + 1 : Math.max(1, widget.zIndex - 1) }
          : widget
      )
    );
  };

  const handleUndo = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next.pop() as WidgetItem[];
      setRedoStack((redoPrev) => [...redoPrev, widgets]);
      setWidgets(last);
      return next;
    });
  };

  const handleRedo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next.pop() as WidgetItem[];
      setUndoStack((undoPrev) => [...undoPrev, widgets]);
      setWidgets(last);
      return next;
    });
  };

  const updateSelectedConfig = (patch: Partial<WidgetConfig>) => {
    if (!selectedWidget) return;
    updateWidgets((prev) =>
      prev.map((widget) =>
        widget.id === selectedWidget.id ? { ...widget, config: { ...widget.config, ...patch } } : widget
      )
    );
  };

  const renderWidgetContent = (widget: WidgetItem) => {
    if (widget.status === "loading") {
      return (
        <div className="widget-state">
          <Spin size="small" />
          <Text type="secondary">Loading data…</Text>
        </div>
      );
    }

    if (widget.status === "error") {
      return (
        <div className="widget-state error">
          <Text type="danger">Data unavailable</Text>
          <Text type="secondary">Check dataset and filters.</Text>
        </div>
      );
    }

    if (!widget.config.dataset && ["line", "bar", "pie", "scatter", "area"].includes(widget.type)) {
      return (
        <div className="widget-state empty">
          <Text type="secondary">Select a dataset to preview.</Text>
        </div>
      );
    }

    switch (widget.type) {
      case "line":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={SAMPLE_DATA}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <RechartsTooltip />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        );
      case "bar":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={SAMPLE_DATA}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <RechartsTooltip />
              <Legend />
              <Bar dataKey="value" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        );
      case "area":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={SAMPLE_DATA}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <RechartsTooltip />
              <Area type="monotone" dataKey="value" stroke="#f97316" fill="#fdba74" />
            </AreaChart>
          </ResponsiveContainer>
        );
      case "pie":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={SAMPLE_DATA} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} fill="#38bdf8" />
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        );
      case "scatter":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid />
              <XAxis dataKey="value" />
              <YAxis dataKey="count" />
              <RechartsTooltip />
              <Scatter data={SAMPLE_DATA} fill="#a855f7" />
            </ScatterChart>
          </ResponsiveContainer>
        );
      case "kpi":
        return (
          <div className="widget-metric">
            <Text type="secondary">Total revenue</Text>
            <Title level={3} style={{ margin: 0 }}>
              ${METRIC_DATA.value.toLocaleString()}
            </Title>
            <Tag color={METRIC_DATA.delta > 0 ? "green" : "red"}>
              {METRIC_DATA.delta > 0 ? "+" : ""}{Math.round(METRIC_DATA.delta * 100)}%
            </Tag>
          </div>
        );
      case "progress":
        return (
          <div className="widget-metric">
            <Text type="secondary">Pipeline completion</Text>
            <div className="progress-bar">
              <span style={{ width: "72%" }} />
            </div>
            <Text>72%</Text>
          </div>
        );
      case "comparison":
        return (
          <div className="widget-metric">
            <Text type="secondary">This quarter vs last</Text>
            <div className="comparison-row">
              <span>Q4</span>
              <strong>$98k</strong>
            </div>
            <div className="comparison-row">
              <span>Q3</span>
              <strong>$84k</strong>
            </div>
          </div>
        );
      case "table":
      case "summary":
      case "pivot":
        return (
          <div className="widget-table">
            {SAMPLE_DATA.slice(0, 4).map((row) => (
              <div key={row.name} className="widget-table-row">
                <span>{row.name}</span>
                <span>{row.value}</span>
              </div>
            ))}
          </div>
        );
      case "date_filter":
      case "dropdown_filter":
      case "multi_filter":
        return (
          <div className="widget-filter">
            <Text type="secondary">Filter widget</Text>
            <Button size="small">Configure</Button>
          </div>
        );
      case "title":
      case "description":
      case "markdown":
        return (
          <div className="widget-text">
            <Title level={5} style={{ margin: 0 }}>
              {widget.config.title || WIDGET_LABEL[widget.type]}
            </Title>
            <Text type="secondary">Add context or markdown instructions here.</Text>
          </div>
        );
      default:
        return <Text type="secondary">Widget preview</Text>;
    }
  };

  const actionMenu = {
    items: [
      { key: "copy", label: "Copy" },
      { key: "duplicate", label: "Duplicate" },
      { key: "delete", label: "Delete" },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "copy") handleCopy();
      if (key === "duplicate") handleDuplicate();
      if (key === "delete") handleDelete();
    },
  };

  return (
    <div className="ai-first-layout">
      <div className="ai-first-main">
        <div className="dashboard-root">
      <div className="dashboard-toolbar">
        <Space>
          <Button type="primary" icon={<SaveOutlined />} onClick={() => { setDirty(false); notify.success("Dashboard saved"); }}>
            Save
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: "pdf", label: "Export PDF" },
                { key: "png", label: "Export PNG" },
                { key: "embed", label: "Embed code" },
                { key: "schedule", label: "Schedule email" },
              ],
              onClick: ({ key }) => notify.info(`Export: ${key}`),
            }}
          >
            <Button icon={<ExportOutlined />}>Export PDF</Button>
          </Dropdown>
          <Button icon={<ShareAltOutlined />} onClick={() => notify.success("Share link generated")}>Share</Button>
          <Button icon={<SettingOutlined />} onClick={() => notify.info("Dashboard settings opened")}>Settings</Button>
        </Space>
        <Space>
          <Switch checked={mobilePreview} onChange={setMobilePreview} />
          <Text type="secondary">Mobile preview</Text>
          <Button onClick={handleUndo} disabled={undoStack.length === 0}>Undo</Button>
          <Button onClick={handleRedo} disabled={redoStack.length === 0}>Redo</Button>
          <Button onClick={handleCopy} icon={<CopyOutlined />}>Copy</Button>
          <Button onClick={handlePaste}>Paste</Button>
          <Dropdown menu={actionMenu}>
            <Button>More</Button>
          </Dropdown>
          {dirty && <Tag color="orange">Unsaved changes</Tag>}
        </Space>
      </div>

      <div className="dashboard-layout">
        <div className="dashboard-sidebar">
          <div className="sidebar-title">
            <DragOutlined />
            <span>Widget Library</span>
          </div>
          <Collapse
            defaultActiveKey={["charts"]}
            items={WIDGET_LIBRARY.map((group) => ({
              key: group.key,
              label: group.label,
              children: (
                <div className="widget-library">
                  {group.items.map((item) => (
                    <div
                      key={item.type}
                      className="widget-library-item"
                      draggable
                      onDragStart={(event) => {
                        setDraggingType(item.type);
                        event.dataTransfer.setData("widget-type", item.type);
                      }}
                      onClick={() => handleAddWidget(item.type)}
                    >
                      <span>{getWidgetCategoryIcon(item.type)}</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              ),
            }))}
          />
          <Card className="template-card" title="Templates Gallery">
            <div className="template-grid">
              {TEMPLATE_LIBRARY.map((template) => (
                <div key={template.id} className="template-item">
                  <div className="template-thumb" />
                  <Text strong>{template.name}</Text>
                  <Button size="small" onClick={() => notify.success(`Template ${template.name} applied`)}>
                    Use Template
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="dashboard-canvas">
          <div className="canvas-header">
            <Space>
              <Title level={4} style={{ margin: 0 }}>
                {meta.name}
              </Title>
              <Text type="secondary">{meta.description}</Text>
            </Space>
            <Space>
              <Button icon={<VerticalAlignTopOutlined />} onClick={() => handleAlign("top")}>Align top</Button>
              <Button icon={<VerticalAlignBottomOutlined />} onClick={() => handleAlign("bottom")}>Align bottom</Button>
              <Button icon={<EyeOutlined />} onClick={() => handleZIndex("front")}>Bring front</Button>
              <Button icon={<EyeOutlined />} onClick={() => handleZIndex("back")}>Send back</Button>
            </Space>
          </div>
          <ResponsiveGridLayout
            className="grid-layout"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 2 }}
            rowHeight={30}
            isDroppable
            compactType="vertical"
            onDrop={handleDrop}
            onLayoutChange={(layout: Layout[]) => updateLayout(layout)}
            measureBeforeMount={false}
            useCSSTransforms
            preventCollision={false}
            droppingItem={{ i: "__drop", w: 4, h: 4 }}
          >
            {widgets.map((widget) => (
              <div
                key={widget.id}
                className={`grid-widget ${selectedIds.includes(widget.id) ? "selected" : ""}`}
                style={{ zIndex: widget.zIndex }}
                onClick={(event) => {
                  event.stopPropagation();
                  handleSelect(widget.id, event.shiftKey);
                }}
              >
                <div className="widget-header">
                  <span>{getWidgetCategoryIcon(widget.type)}</span>
                  <span>{WIDGET_LABEL[widget.type]}</span>
                  <Space size="small">
                    {selectedIds.includes(widget.id) && (
                      <>
                        <Button size="small" icon={<CopyOutlined />} onClick={handleDuplicate} />
                        <Button size="small" icon={<DeleteOutlined />} onClick={handleDelete} />
                      </>
                    )}
                  </Space>
                </div>
                <div className="widget-body">
                  {renderWidgetContent(widget)}
                </div>
              </div>
            ))}
          </ResponsiveGridLayout>
        </div>

        <div className="dashboard-config">
          <Card className="config-card" title="Widget Configuration">
            {selectedWidget ? (
              <Tabs
                items={[
                  {
                    key: "data",
                    label: "Data",
                    children: (
                      <Space direction="vertical" size="small" style={{ width: "100%" }}>
                        <Select
                          placeholder="Dataset"
                          value={selectedWidget.config.dataset}
                          onChange={(value) => updateSelectedConfig({ dataset: value })}
                          options={[
                            { label: "Sales", value: "sales" },
                            { label: "Marketing", value: "marketing" },
                            { label: "Finance", value: "finance" },
                          ]}
                        />
                        <Select
                          placeholder="Measure"
                          value={selectedWidget.config.measure}
                          onChange={(value) => updateSelectedConfig({ measure: value })}
                          options={[
                            { label: "revenue", value: "revenue" },
                            { label: "orders", value: "orders" },
                            { label: "customers", value: "customers" },
                          ]}
                        />
                        <Select
                          placeholder="Dimension"
                          value={selectedWidget.config.dimension}
                          onChange={(value) => updateSelectedConfig({ dimension: value })}
                          options={[
                            { label: "region", value: "region" },
                            { label: "channel", value: "channel" },
                            { label: "segment", value: "segment" },
                          ]}
                        />
                        <Select
                          placeholder="Aggregation"
                          value={selectedWidget.config.aggregation}
                          onChange={(value) => updateSelectedConfig({ aggregation: value })}
                          options={["sum", "avg", "count", "min", "max"].map((value) => ({
                            label: value,
                            value,
                          }))}
                        />
                        <Input placeholder="Filters" />
                      </Space>
                    ),
                  },
                  {
                    key: "style",
                    label: "Style",
                    children: (
                      <Space direction="vertical" size="small" style={{ width: "100%" }}>
                        <Input
                          placeholder="Title"
                          value={selectedWidget.config.title}
                          onChange={(event) => updateSelectedConfig({ title: event.target.value })}
                        />
                        <Select
                          placeholder="Palette"
                          value={selectedWidget.config.palette}
                          onChange={(value) => updateSelectedConfig({ palette: value })}
                          options={["indigo", "emerald", "amber", "rose"].map((value) => ({
                            label: value,
                            value,
                          }))}
                        />
                        <Switch
                          checked={selectedWidget.config.legend}
                          onChange={(value) => updateSelectedConfig({ legend: value })}
                        />
                        <Text type="secondary">Show legend</Text>
                        <Switch
                          checked={selectedWidget.config.axisLabels}
                          onChange={(value) => updateSelectedConfig({ axisLabels: value })}
                        />
                        <Text type="secondary">Axis labels</Text>
                        <Select
                          placeholder="Number format"
                          value={selectedWidget.config.numberFormat}
                          onChange={(value) => updateSelectedConfig({ numberFormat: value })}
                          options={["currency", "percentage", "decimal"].map((value) => ({
                            label: value,
                            value,
                          }))}
                        />
                      </Space>
                    ),
                  },
                  {
                    key: "advanced",
                    label: "Advanced",
                    children: (
                      <Space direction="vertical" size="small" style={{ width: "100%" }}>
                        <Select
                          placeholder="Sorting"
                          value={selectedWidget.config.sorting}
                          onChange={(value) => updateSelectedConfig({ sorting: value })}
                          options={["asc", "desc"].map((value) => ({ label: value, value }))}
                        />
                        <InputNumber
                          placeholder="Limit"
                          value={selectedWidget.config.limit}
                          onChange={(value) => updateSelectedConfig({ limit: Number(value) })}
                          style={{ width: "100%" }}
                        />
                        <Input
                          placeholder="Custom calculation"
                          value={selectedWidget.config.calc}
                          onChange={(event) => updateSelectedConfig({ calc: event.target.value })}
                        />
                        <Input
                          placeholder="Conditional formatting"
                          value={selectedWidget.config.conditionalFormat}
                          onChange={(event) => updateSelectedConfig({ conditionalFormat: event.target.value })}
                        />
                      </Space>
                    ),
                  },
                ]}
              />
            ) : (
              <Text type="secondary">Select a widget to configure.</Text>
            )}
          </Card>
          <Card className="config-card" title="Dashboard metadata">
            <Space direction="vertical" size="small">
              <Input
                value={meta.name}
                onChange={(event) => setMeta({ ...meta, name: event.target.value })}
              />
              <Input.TextArea
                value={meta.description}
                onChange={(event) => setMeta({ ...meta, description: event.target.value })}
              />
              <Input
                value={meta.owner}
                onChange={(event) => setMeta({ ...meta, owner: event.target.value })}
              />
            </Space>
          </Card>
        </div>
      </div>
        </div>
      </div>
      <div className="ai-first-chat">
        <AIChat
          context="dashboard"
          currentDataset={dataset}
          onAction={handleAIAction}
          suggestions={[
            "Create a sales dashboard",
            "Add a revenue trend chart",
            "Show top 10 products",
            "Add a KPI for total revenue",
          ]}
        />
      </div>
    </div>
  );
}
