import { Card, List, Space, Statistic, Typography } from "antd";
import { useEffect, useState } from "react";
import { fetchUsageSummary } from "../api";
import { UsageSummary } from "../types";
import { notify } from "../utils/notify";

export function UsageAnalyticsPanel() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);

  useEffect(() => {
    fetchUsageSummary()
      .then(setSummary)
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || "Failed to load usage summary.";
        notify.error(detail);
      });
  }, []);

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }} size="large">
        <Space wrap>
          <Statistic title="Total Events" value={summary?.total_events ?? 0} />
          <Statistic title="Unique Actors" value={summary?.unique_actors ?? 0} />
        </Space>
        <Space align="start" wrap>
          <Card size="small" title="Top Actions" style={{ minWidth: 260 }}>
            <List
              dataSource={summary?.actions ?? []}
              locale={{ emptyText: "No actions yet." }}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text>
                    {item.action} ({item.count})
                  </Typography.Text>
                </List.Item>
              )}
            />
          </Card>
          <Card size="small" title="Top Targets" style={{ minWidth: 260 }}>
            <List
              dataSource={summary?.targets ?? []}
              locale={{ emptyText: "No targets yet." }}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text>
                    {item.target} ({item.count})
                  </Typography.Text>
                </List.Item>
              )}
            />
          </Card>
        </Space>
      </Space>
    </Card>
  );
}
