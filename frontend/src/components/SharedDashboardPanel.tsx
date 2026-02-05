import { Card, List, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { fetchSharedDashboard } from "../api";
import { DashboardWidget } from "../types";
import { notify } from "../utils/notify";
import { WidgetRenderer } from "./WidgetRenderer";

interface Props {
  shareToken: string | null;
}

interface SharedDashboard {
  name: string;
  widgets: DashboardWidget[];
}

export function SharedDashboardPanel({ shareToken }: Props) {
  const [dashboard, setDashboard] = useState<SharedDashboard | null>(null);

  useEffect(() => {
    if (!shareToken) {
      setDashboard(null);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const scope = params.get("scope") || undefined;
    fetchSharedDashboard(shareToken, scope)
      .then(setDashboard)
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || "Failed to load shared dashboard.";
        notify.error(detail);
      });
  }, [shareToken]);

  if (!shareToken) {
    return null;
  }

  return (
    <Card>
      <Typography.Title level={4}>{dashboard?.name || "Shared Dashboard"}</Typography.Title>
      <List
        dataSource={dashboard?.widgets ?? []}
        locale={{ emptyText: "No widgets available." }}
        renderItem={(item) => (
          <List.Item>
            <Space direction="vertical" style={{ width: "100%" }}>
              <WidgetRenderer widget={item} />
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}
