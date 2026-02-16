/**
 * @deprecated This component uses the old simplified dashboard system.
 * Use DataVisualizationTab component instead for the new BI dashboard builder.
 * This file is kept for backwards compatibility only.
 */

import { Button, Card, Input, List, Space, Typography, Select, Input as TextInput } from "antd";
import { useEffect, useState } from "react";
import { createDashboard, fetchChartSummary, listDashboards, shareDashboard, unshareDashboard } from "../api";
import { ChartSummary } from "../types";
import { notify } from "../utils/notify";
import { getRoleFromToken } from "../utils/auth";

interface Dashboard {
  dashboard_id: string;
  name: string;
  is_shared?: boolean;
  share_token?: string | null;
}

interface Props {
  columns: string[];
  datasetId: string | null;
  onSelectDashboard: (dashboardId: string | null) => void;
}

export function DashboardPanel({ columns, datasetId, onSelectDashboard }: Props) {
  const [name, setName] = useState("");
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [widgetColumn, setWidgetColumn] = useState<string | undefined>(undefined);
  const [widgetSummary, setWidgetSummary] = useState<ChartSummary | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareExpiryHours, setShareExpiryHours] = useState<number>(0);
  const [shareScope, setShareScope] = useState<string>("");
  const role = getRoleFromToken();

  const refresh = async () => {
    const data = await listDashboards();
    setDashboards(data);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createDashboard(name.trim());
    setName("");
    await refresh();
    notify.success("Dashboard created");
  };

  const handleShare = async (dashboardId: string) => {
    try {
      const data = await shareDashboard(dashboardId, shareExpiryHours || undefined, shareScope || undefined);
      const link = data.share_url || data.share_token;
      setShareLink(link || null);
      notify.success("Share link generated");
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to share dashboard.";
      if (detail.toLowerCase().includes("scope")) {
        notify.error("Share scope not allowed for your role.");
      } else {
        notify.error(detail);
      }
    }
  };

  const handleUnshare = async (dashboardId: string) => {
    try {
      await unshareDashboard(dashboardId);
      notify.success("Dashboard unshared");
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to unshare dashboard.";
      notify.error(detail);
    }
  };

  useEffect(() => {
    if (!datasetId || !widgetColumn) {
        setWidgetSummary(null);
        return;
    }
    fetchChartSummary(datasetId, widgetColumn).then(setWidgetSummary);
  }, [datasetId, widgetColumn]);

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space>
          <Input
            placeholder="Dashboard name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="primary" onClick={handleCreate}>
            Create
          </Button>
          <Button onClick={refresh}>Refresh</Button>
          <Input
            placeholder="Share expiry (hours)"
            value={shareExpiryHours ? String(shareExpiryHours) : ""}
            onChange={(event) => setShareExpiryHours(Number(event.target.value) || 0)}
            style={{ width: 160 }}
          />
          <Input
            placeholder="Share scope (optional)"
            value={shareScope}
            onChange={(event) => setShareScope(event.target.value)}
            style={{ width: 180 }}
          />
        </Space>
        <List
          dataSource={dashboards}
          renderItem={(item) => (
            <List.Item
              onClick={() => onSelectDashboard(item.dashboard_id)}
              actions={[
                <Button key="share" onClick={() => handleShare(item.dashboard_id)}>
                  Share
                </Button>,
                <Button key="unshare" onClick={() => handleUnshare(item.dashboard_id)}>
                  Unshare
                </Button>
              ]}
            >
              <Space>
                <Typography.Text>{item.name}</Typography.Text>
                {item.is_shared && <Typography.Text type="secondary">Shared</Typography.Text>}
              </Space>
            </List.Item>
          )}
        />
        {shareLink && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Typography.Text type="secondary">Share link</Typography.Text>
            <TextInput value={shareLink} readOnly />
          </Space>
        )}
        {role && (
          <Typography.Text type="secondary">
            Current role: {role}. Some share scopes may require higher privileges.
          </Typography.Text>
        )}
        <Typography.Text type="secondary">
          Widget scaffold (summary column selector):
        </Typography.Text>
        <Select
          placeholder="Select column for widget"
          value={widgetColumn}
          onChange={setWidgetColumn}
          style={{ minWidth: 200 }}
          options={columns.map((col) => ({ label: col, value: col }))}
        />
        {widgetSummary && (
          <div>
            <Typography.Text type="secondary">
              {widgetSummary.kind} widget
            </Typography.Text>
            <div style={{ marginTop: 8 }}>
              {widgetSummary.series.map((item) => (
                <div key={item.label} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  <div style={{ minWidth: 120 }}>{item.label}</div>
                  <div style={{ flex: 1, background: "#f0f0f0" }}>
                    <div
                      style={{
                        width: `${Math.min(item.value * 8, 100)}%`,
                        background: "#1677ff",
                        height: 12
                      }}
                    />
                  </div>
                  <div>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Space>
    </Card>
  );
}
