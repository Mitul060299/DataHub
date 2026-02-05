import { Button, Card, Input, List, Select, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { fetchSyncStatus, listConnectors, syncConnector } from "../api";
import { notify } from "../utils/notify";

export function SyncPanel() {
  const [connectors, setConnectors] = useState<string[]>([]);
  const [connector, setConnector] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<"pull" | "push">("pull");
  const [datasetId, setDatasetId] = useState("");
  const [configText, setConfigText] = useState("{}");
  const [status, setStatus] = useState<Array<{ key: string; last_synced_at: string; mode: string; dataset_id?: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      const data = await fetchSyncStatus();
      setStatus(data.status || []);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to load sync status.";
      notify.error(detail);
    }
  };

  useEffect(() => {
    listConnectors()
      .then((data) => setConnectors(data.connectors || []))
      .catch(() => notify.error("Failed to load connectors"));
    refresh();
  }, []);

  const handleSync = async () => {
    if (!connector) return;
    setLoading(true);
    try {
      const config = JSON.parse(configText || "{}");
      const payload: any = { connector, config, mode };
      if (mode === "push" && datasetId.trim()) payload.dataset_id = datasetId.trim();
      const result = await syncConnector(payload);
      notify.success(`Sync complete (${result.mode})`);
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to sync connector.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Select
            placeholder="Connector"
            value={connector}
            onChange={setConnector}
            options={connectors.map((item) => ({ label: item, value: item }))}
            style={{ minWidth: 200 }}
          />
          <Select
            value={mode}
            onChange={(value) => setMode(value)}
            options={[
              { label: "Pull", value: "pull" },
              { label: "Push", value: "push" }
            ]}
            style={{ minWidth: 120 }}
          />
          <Input
            placeholder="Dataset ID (push)"
            value={datasetId}
            onChange={(event) => setDatasetId(event.target.value)}
            style={{ minWidth: 200 }}
          />
          <Button type="primary" onClick={handleSync} loading={loading} disabled={!connector}>
            Sync
          </Button>
          <Button onClick={refresh} disabled={loading}>
            Refresh Status
          </Button>
        </Space>
        <Typography.Text type="secondary">Connector config (JSON)</Typography.Text>
        <Input.TextArea
          value={configText}
          onChange={(event) => setConfigText(event.target.value)}
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
        <List
          dataSource={status}
          locale={{ emptyText: "No syncs yet." }}
          renderItem={(item) => (
            <List.Item>
              <Space direction="vertical">
                <Typography.Text>{item.key}</Typography.Text>
                <Typography.Text type="secondary">
                  {item.mode} at {item.last_synced_at} (dataset: {item.dataset_id || "-"})
                </Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
