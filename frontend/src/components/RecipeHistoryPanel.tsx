import { Button, Card, List, Popconfirm, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { listRecipeVersions, revertRecipe } from "../api";
import { RecipeVersion } from "../types";
import { notify } from "../utils/notify";

interface Props {
  datasetId: string | null;
}

export function RecipeHistoryPanel({ datasetId }: Props) {
  const [versions, setVersions] = useState<RecipeVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!datasetId) {
      setVersions([]);
      return;
    }
    try {
      const data = await listRecipeVersions(datasetId);
      setVersions(data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to load recipe history.";
      notify.error(detail);
    }
  };

  useEffect(() => {
    refresh();
  }, [datasetId]);

  const handleRevert = async (versionId: string) => {
    if (!datasetId) return;
    setLoading(true);
    try {
      await revertRecipe(datasetId, versionId);
      notify.success("Recipe reverted");
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to revert recipe.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          Recipe version history for the selected dataset.
        </Typography.Text>
        <List
          dataSource={versions}
          locale={{ emptyText: datasetId ? "No recipe versions yet." : "Select a dataset to view history." }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="revert"
                  title="Revert to this version?"
                  onConfirm={() => handleRevert(item.version_id)}
                  okText="Revert"
                  cancelText="Cancel"
                  disabled={loading || !datasetId}
                >
                  <Button size="small" disabled={loading || !datasetId}>
                    Revert
                  </Button>
                </Popconfirm>
              ]}
            >
              <Space direction="vertical">
                <Space>
                  <Typography.Text strong>Version {item.version_id}</Typography.Text>
                  <Tag>{item.steps?.length ?? 0} steps</Tag>
                </Space>
                <Typography.Text type="secondary">Created: {item.created_at}</Typography.Text>
                {item.notes && <Typography.Text>{item.notes}</Typography.Text>}
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
