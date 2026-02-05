import { Card, List, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { fetchCorrelationSummary } from "../api";
import { CorrelationSummary } from "../types";

interface Props {
  datasetId: string | null;
}

export function CorrelationPanel({ datasetId }: Props) {
  const [summary, setSummary] = useState<CorrelationSummary | null>(null);

  useEffect(() => {
    if (!datasetId) {
      setSummary(null);
      return;
    }
    fetchCorrelationSummary(datasetId).then(setSummary);
  }, [datasetId]);

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          Top correlations (numeric columns)
        </Typography.Text>
        <List
          dataSource={summary?.pairs ?? []}
          locale={{ emptyText: "No numeric correlations available." }}
          renderItem={(item) => (
            <List.Item>
              <Typography.Text>
                {item.column_a} ↔ {item.column_b}: {item.value.toFixed(3)}
              </Typography.Text>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
