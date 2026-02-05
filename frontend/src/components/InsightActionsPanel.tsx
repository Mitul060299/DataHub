import { Button, Card, List, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { fetchInsightActions, applyRecipe, saveRecipe } from "../api";
import { InsightActionSummary } from "../types";
import { notify } from "../utils/notify";

interface Props {
  datasetId: string | null;
}

export function InsightActionsPanel({ datasetId }: Props) {
  const [summary, setSummary] = useState<InsightActionSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasetId) {
      setSummary(null);
      return;
    }
    fetchInsightActions(datasetId)
      .then(setSummary)
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || "Failed to load insight actions.";
        notify.error(detail);
      });
  }, [datasetId]);

  const handleApply = async () => {
    if (!datasetId || !summary?.actions?.length) return;
    setLoading(true);
    try {
      await saveRecipe(datasetId, summary.actions.map((action) => ({ name: action.name, params: action.params })));
      await applyRecipe(datasetId);
      notify.success("Insight actions applied");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to apply insight actions.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          Recommended fixes based on detected issues.
        </Typography.Text>
        <List
          dataSource={summary?.actions ?? []}
          locale={{ emptyText: "No automated actions suggested." }}
          renderItem={(item) => (
            <List.Item>
              <Space direction="vertical">
                <Typography.Text strong>{item.name}</Typography.Text>
                <Typography.Text type="secondary">{item.reason}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
        <Button type="primary" onClick={handleApply} disabled={!summary?.actions?.length} loading={loading}>
          Apply Suggested Fixes
        </Button>
      </Space>
    </Card>
  );
}
