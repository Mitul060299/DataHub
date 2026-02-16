import React, { useState, useEffect } from 'react';
import { Card, Button, Select, Modal, Space, message, Dropdown, Row, Col, Input, Switch } from 'antd';
import { PlusOutlined, BarChartOutlined, LineChartOutlined, PieChartOutlined, TableOutlined, DashboardOutlined, DownloadOutlined, ShareAltOutlined, BgColorsOutlined, MoreOutlined } from '@ant-design/icons';
import GridLayout from 'react-grid-layout';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './DataVisualizationTab.css';
import { api } from '../api';

const { Option } = Select;

interface Widget {
  id: string;
  type: string;
  title: string;
  config: any;
  position: { x: number; y: number; w: number; h: number };
  data?: any[];
}

interface Dashboard {
  id: number;
  name: string;
  widgets: Widget[];
}

const CHART_TYPES = [
  { value: 'bar', label: 'Bar Chart', icon: <BarChartOutlined /> },
  { value: 'line', label: 'Line Chart', icon: <LineChartOutlined /> },
  { value: 'pie', label: 'Pie Chart', icon: <PieChartOutlined /> },
  { value: 'scatter', label: 'Scatter Plot', icon: <DashboardOutlined /> },
  { value: 'area', label: 'Area Chart', icon: <LineChartOutlined /> },
  { value: 'kpi', label: 'KPI Card', icon: <DashboardOutlined /> },
  { value: 'table', label: 'Table', icon: <TableOutlined /> },
];

const DEFAULT_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0', '#ffb347'];

const DataVisualizationTab: React.FC = () => {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [currentDashboard, setCurrentDashboard] = useState<Dashboard | null>(null);
  const [isAddWidgetModalVisible, setIsAddWidgetModalVisible] = useState(false);
  const [isCreateDashboardModalVisible, setIsCreateDashboardModalVisible] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [selectedChartType, setSelectedChartType] = useState<string>('bar');
  const [widgetTitle, setWidgetTitle] = useState('');
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [chartConfig, setChartConfig] = useState<any>({});
  const [availableColumns, setAvailableColumns] = useState<any>({});
  const [layout, setLayout] = useState<any[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);

  useEffect(() => {
    loadDashboards();
    loadDatasets();
  }, []);

  useEffect(() => {
    if (selectedDataset && selectedChartType) {
      loadColumnSuggestions();
    }
  }, [selectedDataset, selectedChartType]);

  useEffect(() => {
    if (autoRefresh && currentDashboard) {
      const interval = setInterval(() => {
        refreshDashboardData();
      }, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, currentDashboard]);

  const loadDashboards = async () => {
    try {
      const response = await api.get('/visualizations/dashboards');
      setDashboards(response.data);
      if (response.data.length > 0) {
        loadDashboard(response.data[0].id);
      }
    } catch (error) {
      console.error('Error loading dashboards:', error);
    }
  };

  const loadDashboard = async (dashboardId: number) => {
    try {
      const response = await api.get(`/visualizations/dashboards/${dashboardId}`);
      const dashboard = response.data;
      
      // Load data for each widget
      const widgetsWithData = await Promise.all(
        dashboard.widgets.map(async (widget: any) => {
          try {
            const data = await loadWidgetData(widget);
            return { ...widget, data };
          } catch (error) {
            console.error(`Error loading data for widget ${widget.id}:`, error);
            return { ...widget, data: [] };
          }
        })
      );

      setCurrentDashboard({ ...dashboard, widgets: widgetsWithData });
      setLayout(dashboard.widgets.map((w: any) => ({
        i: w.id.toString(),
        ...w.position
      })));
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  const loadWidgetData = async (widget: any) => {
    if (!widget.dataset_id) return [];

    if (widget.widget_type === 'kpi') {
      const response = await api.post(`/visualizations/kpi/${widget.dataset_id}`, widget.config);
      return response.data;
    } else if (widget.widget_type === 'table') {
      const response = await api.post(`/visualizations/chart-data/${widget.dataset_id}`, widget.config);
      return response.data.data;
    } else {
      const response = await api.post(`/visualizations/chart-data/${widget.dataset_id}`, widget.config);
      return response.data.data;
    }
  };

  const loadDatasets = async () => {
    try {
      const response = await api.get('/datasets');
      setDatasets(response.data);
    } catch (error) {
      console.error('Error loading datasets:', error);
    }
  };

  const loadColumnSuggestions = async () => {
    if (!selectedDataset) return;
    
    try {
      const response = await api.get(`/visualizations/suggest-columns/${selectedDataset}?chart_type=${selectedChartType}`);
      setAvailableColumns(response.data);
      
      // Auto-fill config with recommendations
      if (response.data.recommendations) {
        setChartConfig(response.data.recommendations);
      }
    } catch (error) {
      console.error('Error loading column suggestions:', error);
    }
  };

  const createDashboard = async () => {
    if (!newDashboardName.trim()) {
      message.error('Please enter a dashboard name');
      return;
    }

    try {
      await api.post('/visualizations/dashboards', {
        name: newDashboardName,
        workspace_id: 1, // TODO: Get from context
      });
      message.success('Dashboard created successfully');
      setIsCreateDashboardModalVisible(false);
      setNewDashboardName('');
      await loadDashboards();
    } catch (error) {
      message.error('Failed to create dashboard');
      console.error('Error creating dashboard:', error);
    }
  };

  const addWidget = async () => {
    if (!currentDashboard || !widgetTitle.trim() || !selectedDataset || !selectedChartType) {
      message.error('Please fill in all required fields');
      return;
    }

    try {
      const newWidget = {
        dashboard_id: currentDashboard.id,
        widget_type: selectedChartType,
        title: widgetTitle,
        dataset_id: parseInt(selectedDataset),
        config: {
          chart_type: selectedChartType,
          ...chartConfig,
        },
        position: {
          x: 0,
          y: Infinity, // Place at bottom
          w: 6,
          h: 4,
        },
      };

      await api.post('/visualizations/widgets', newWidget);
      message.success('Widget added successfully');
      setIsAddWidgetModalVisible(false);
      resetWidgetForm();
      await loadDashboard(currentDashboard.id);
    } catch (error) {
      message.error('Failed to add widget');
      console.error('Error adding widget:', error);
    }
  };

  const resetWidgetForm = () => {
    setWidgetTitle('');
    setSelectedChartType('bar');
    setSelectedDataset(null);
    setChartConfig({});
  };

  const deleteWidget = async (widgetId: string) => {
    try {
      await api.delete(`/visualizations/widgets/${widgetId}`);
      message.success('Widget deleted successfully');
      if (currentDashboard) {
        await loadDashboard(currentDashboard.id);
      }
    } catch (error) {
      message.error('Failed to delete widget');
      console.error('Error deleting widget:', error);
    }
  };

  const onLayoutChange = async (newLayout: any[]) => {
    setLayout(newLayout);
    
    // Update widget positions in backend
    if (currentDashboard) {
      try {
        const updates = newLayout.map((item) => ({
          widget_id: parseInt(item.i),
          position: { x: item.x, y: item.y, w: item.w, h: item.h },
        }));

        for (const update of updates) {
          await api.put(`/visualizations/widgets/${update.widget_id}`, {
            position: update.position,
          });
        }
      } catch (error) {
        console.error('Error updating layout:', error);
      }
    }
  };

  const exportDashboard = async (format: 'pdf' | 'png') => {
    message.info(`Exporting as ${format.toUpperCase()}...`);
    // TODO: Implement export using html2canvas + jspdf
  };

  const shareDashboard = async () => {
    if (!currentDashboard) return;

    try {
      const response = await api.post(`/visualizations/dashboards/${currentDashboard.id}/share`);
      const shareUrl = `${window.location.origin}${response.data.share_url}`;
      
      // Copy to clipboard
      await navigator.clipboard.writeText(shareUrl);
      message.success('Share link copied to clipboard!');
    } catch (error) {
      message.error('Failed to generate share link');
      console.error('Error sharing dashboard:', error);
    }
  };

  const refreshDashboardData = async () => {
    if (currentDashboard) {
      await loadDashboard(currentDashboard.id);
    }
  };

  const renderWidget = (widget: Widget) => {
    const { type, title, data, config } = widget;

    return (
      <Card
        key={widget.id}
        title={title}
        extra={
          <Dropdown
            menu={{
              items: [
                { key: 'refresh', label: 'Refresh' },
                { key: 'edit', label: 'Edit' },
                { key: 'delete', label: 'Delete', danger: true, onClick: () => deleteWidget(widget.id) },
              ],
            }}
          >
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        }
        className="dashboard-widget-card"
      >
        {renderChart(type, data || [], config)}
      </Card>
    );
  };

  const renderChart = (type: string, data: any[], config: any) => {
    if (!data || data.length === 0) {
      return <div style={{ textAlign: 'center', padding: '40px' }}>No data available</div>;
    }

    switch (type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.x_axis || 'category'} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={config.y_axis || 'value'} fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.x_axis || 'x'} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={config.y_axis || 'y'} stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data} dataKey={config.value || 'value'} nameKey={config.label || 'name'} cx="50%" cy="50%" outerRadius={80} label>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'kpi':
        return (
          <div className="kpi-widget">
            <div className="kpi-value">{data.formatted || data.value}</div>
            {data.trend && (
              <div className={`kpi-trend ${data.trend > 0 ? 'positive' : 'negative'}`}>
                {data.trend > 0 ? '↑' : '↓'} {Math.abs(data.trend)}%
              </div>
            )}
          </div>
        );

      case 'table':
        return (
          <div className="table-widget">
            <table>
              <thead>
                <tr>
                  {Object.keys(data[0] || {}).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 10).map((row, index) => (
                  <tr key={index}>
                    {Object.values(row).map((value: any, i) => (
                      <td key={i}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      default:
        return <div>Unsupported chart type</div>;
    }
  };

  return (
    <div className="data-visualization-tab">
      <div className="visualization-header">
        <div className="header-left">
          <h2>📊 Visualization</h2>
          <Select
            value={currentDashboard?.id}
            onChange={(id) => loadDashboard(id)}
            style={{ width: 250, marginLeft: 20 }}
            placeholder="Select Dashboard"
          >
            {dashboards.map((d) => (
              <Option key={d.id} value={d.id}>
                {d.name}
              </Option>
            ))}
          </Select>
          <Button
            icon={<PlusOutlined />}
            onClick={() => setIsCreateDashboardModalVisible(true)}
            style={{ marginLeft: 10 }}
          >
            New Dashboard
          </Button>
        </div>

        <Space>
          <div className="auto-refresh-control">
            <Switch checked={autoRefresh} onChange={setAutoRefresh} size="small" />
            <span style={{ marginLeft: 8 }}>Auto Refresh ({refreshInterval}s)</span>
          </div>
          <Button icon={<DownloadOutlined />} onClick={() => exportDashboard('pdf')}>
            Export PDF
          </Button>
          <Button icon={<ShareAltOutlined />} onClick={shareDashboard}>
            Share
          </Button>
          <Button icon={<BgColorsOutlined />}>Theme</Button>
        </Space>
      </div>

      {currentDashboard ? (
        <>
          <div className="dashboard-actions">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsAddWidgetModalVisible(true)}>
              Add Widget
            </Button>
          </div>

          <div className="dashboard-grid">
            <GridLayout
              className="layout"
              layout={layout}
              cols={12}
              rowHeight={80}
              width={1200}
              onLayoutChange={onLayoutChange}
              draggableHandle=".ant-card-head"
            >
              {currentDashboard.widgets.map((widget) => (
                <div key={widget.id} data-grid={layout.find((l) => l.i === widget.id.toString())}>
                  {renderWidget(widget)}
                </div>
              ))}
            </GridLayout>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <DashboardOutlined style={{ fontSize: 64, color: '#ccc' }} />
          <h3>No Dashboard Selected</h3>
          <p>Create a new dashboard to get started with data visualization</p>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setIsCreateDashboardModalVisible(true)}>
            Create Dashboard
          </Button>
        </div>
      )}

      {/* Create Dashboard Modal */}
      <Modal
        title="Create New Dashboard"
        open={isCreateDashboardModalVisible}
        onOk={createDashboard}
        onCancel={() => setIsCreateDashboardModalVisible(false)}
        okText="Create"
      >
        <Input
          placeholder="Dashboard Name"
          value={newDashboardName}
          onChange={(e) => setNewDashboardName(e.target.value)}
          onPressEnter={createDashboard}
        />
      </Modal>

      {/* Add Widget Modal */}
      <Modal
        title="Add Widget"
        open={isAddWidgetModalVisible}
        onOk={addWidget}
        onCancel={() => {
          setIsAddWidgetModalVisible(false);
          resetWidgetForm();
        }}
        okText="Add Widget"
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <label>Widget Title</label>
            <Input
              placeholder="Enter widget title"
              value={widgetTitle}
              onChange={(e) => setWidgetTitle(e.target.value)}
            />
          </div>

          <div>
            <label>Chart Type</label>
            <Select value={selectedChartType} onChange={setSelectedChartType} style={{ width: '100%' }}>
              {CHART_TYPES.map((type) => (
                <Option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label>Dataset</label>
            <Select
              value={selectedDataset}
              onChange={setSelectedDataset}
              style={{ width: '100%' }}
              placeholder="Select a dataset"
            >
              {datasets.map((ds) => (
                <Option key={ds.id} value={ds.id}>
                  {ds.name}
                </Option>
              ))}
            </Select>
          </div>

          {selectedDataset && availableColumns && (
            <div className="chart-config">
              {(selectedChartType === 'bar' || selectedChartType === 'line' || selectedChartType === 'area') && (
                <>
                  <div>
                    <label>X-Axis</label>
                    <Select
                      value={chartConfig.x_axis}
                      onChange={(val) => setChartConfig({ ...chartConfig, x_axis: val })}
                      style={{ width: '100%' }}
                    >
                      {[...availableColumns.categorical_columns, ...availableColumns.datetime_columns].map((col) => (
                        <Option key={col} value={col}>
                          {col}
                        </Option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label>Y-Axis</label>
                    <Select
                      value={chartConfig.y_axis}
                      onChange={(val) => setChartConfig({ ...chartConfig, y_axis: val })}
                      style={{ width: '100%' }}
                    >
                      {availableColumns.numeric_columns.map((col: string) => (
                        <Option key={col} value={col}>
                          {col}
                        </Option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label>Aggregation</label>
                    <Select
                      value={chartConfig.aggregation || 'sum'}
                      onChange={(val) => setChartConfig({ ...chartConfig, aggregation: val })}
                      style={{ width: '100%' }}
                    >
                      <Option value="sum">Sum</Option>
                      <Option value="avg">Average</Option>
                      <Option value="count">Count</Option>
                      <Option value="min">Min</Option>
                      <Option value="max">Max</Option>
                    </Select>
                  </div>
                </>
              )}

              {selectedChartType === 'pie' && (
                <>
                  <div>
                    <label>Label Column</label>
                    <Select
                      value={chartConfig.label}
                      onChange={(val) => setChartConfig({ ...chartConfig, label: val })}
                      style={{ width: '100%' }}
                    >
                      {availableColumns.categorical_columns.map((col: string) => (
                        <Option key={col} value={col}>
                          {col}
                        </Option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label>Value Column</label>
                    <Select
                      value={chartConfig.value}
                      onChange={(val) => setChartConfig({ ...chartConfig, value: val })}
                      style={{ width: '100%' }}
                    >
                      {availableColumns.numeric_columns.map((col: string) => (
                        <Option key={col} value={col}>
                          {col}
                        </Option>
                      ))}
                    </Select>
                  </div>
                </>
              )}

              {selectedChartType === 'scatter' && (
                <>
                  <div>
                    <label>X-Axis</label>
                    <Select
                      value={chartConfig.x_axis}
                      onChange={(val) => setChartConfig({ ...chartConfig, x_axis: val })}
                      style={{ width: '100%' }}
                    >
                      {availableColumns.numeric_columns.map((col: string) => (
                        <Option key={col} value={col}>
                          {col}
                        </Option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label>Y-Axis</label>
                    <Select
                      value={chartConfig.y_axis}
                      onChange={(val) => setChartConfig({ ...chartConfig, y_axis: val })}
                      style={{ width: '100%' }}
                    >
                      {availableColumns.numeric_columns.map((col: string) => (
                        <Option key={col} value={col}>
                          {col}
                        </Option>
                      ))}
                    </Select>
                  </div>
                </>
              )}

              {selectedChartType === 'kpi' && (
                <>
                  <div>
                    <label>Column (optional for count)</label>
                    <Select
                      value={chartConfig.column}
                      onChange={(val) => setChartConfig({ ...chartConfig, column: val })}
                      style={{ width: '100%' }}
                      allowClear
                    >
                      {availableColumns.numeric_columns.map((col: string) => (
                        <Option key={col} value={col}>
                          {col}
                        </Option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label>Aggregation</label>
                    <Select
                      value={chartConfig.aggregation || 'count'}
                      onChange={(val) => setChartConfig({ ...chartConfig, aggregation: val })}
                      style={{ width: '100%' }}
                    >
                      <Option value="count">Count</Option>
                      <Option value="sum">Sum</Option>
                      <Option value="avg">Average</Option>
                      <Option value="min">Min</Option>
                      <Option value="max">Max</Option>
                    </Select>
                  </div>
                  <div>
                    <label>Format</label>
                    <Select
                      value={chartConfig.format || 'number'}
                      onChange={(val) => setChartConfig({ ...chartConfig, format: val })}
                      style={{ width: '100%' }}
                    >
                      <Option value="number">Number</Option>
                      <Option value="currency">Currency</Option>
                      <Option value="percentage">Percentage</Option>
                    </Select>
                  </div>
                </>
              )}
            </div>
          )}
        </Space>
      </Modal>
    </div>
  );
};

export default DataVisualizationTab;
