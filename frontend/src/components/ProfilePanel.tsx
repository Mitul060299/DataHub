import { Card, List, Space, Table, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { fetchProfile } from "../api";
import { ProfileSummary } from "../types";
import { notify } from "../utils/notify";

interface Props {
  datasetId: string | null;
}

interface ProfileRow {
  key: string;
  column: string;
  inferred_type?: string;
  inference_confidence?: number;
  dtype?: string;
  missing?: number;
  unique?: number;
  min?: number | null;
  max?: number | null;
  mean?: number | null;
  top?: string | null;
}

export function ProfilePanel({ datasetId }: Props) {
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasetId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    fetchProfile(datasetId)
      .then(setSummary)
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || "Failed to load profiling.";
        notify.error(detail);
      })
      .finally(() => setLoading(false));
  }, [datasetId]);

  const rows = useMemo<ProfileRow[]>(() => {
    if (!summary?.column_profiles) return [];
    return Object.entries(summary.column_profiles).map(([column, profile]) => {
      const p = profile as Record<string, unknown>;
      return {
        key: column,
        column,
        inferred_type: p.inferred_type as string | undefined,
        inference_confidence: p.inference_confidence as number | undefined,
        dtype: p.dtype as string | undefined,
        missing: p.missing as number | undefined,
        unique: p.unique as number | undefined,
        min: (p.min as number) ?? null,
        max: (p.max as number) ?? null,
        mean: (p.mean as number) ?? null,
        top: (p.top as string) ?? null
      };
    });
  }, [summary]);

  if (!datasetId) {
    return (
      <Card>
        <Typography.Paragraph>Select a dataset to view profiling.</Typography.Paragraph>
      </Card>
    );
  }

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        {summary?.issues?.length ? (
          <List
            size="small"
            header={<Typography.Text strong>Detected issues</Typography.Text>}
            dataSource={summary.issues}
            renderItem={(item) => (
              <List.Item>
                <Typography.Text type="secondary">{item}</Typography.Text>
              </List.Item>
            )}
          />
        ) : (
          <Typography.Text type="secondary">No issues detected.</Typography.Text>
        )}
        <Table
          size="small"
          loading={loading}
          rowKey="key"
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Column", dataIndex: "column", key: "column" },
            {
              title: "Inferred type",
              dataIndex: "inferred_type",
              key: "inferred_type",
              render: (value: string | undefined) => (value ? <Tag>{value}</Tag> : "-")
            },
            {
              title: "Confidence",
              dataIndex: "inference_confidence",
              key: "inference_confidence",
              render: (value: number | undefined) => (value ? `${Math.round(value * 100)}%` : "-")
            },
            { title: "Dtype", dataIndex: "dtype", key: "dtype" },
            { title: "Missing", dataIndex: "missing", key: "missing" },
            { title: "Unique", dataIndex: "unique", key: "unique" },
            { title: "Min", dataIndex: "min", key: "min" },
            { title: "Max", dataIndex: "max", key: "max" },
            { title: "Mean", dataIndex: "mean", key: "mean" },
            { title: "Top", dataIndex: "top", key: "top" }
          ]}
        />
      </Space>
    </Card>
  );
}
