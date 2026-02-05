import { Button, Card, Input, List, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { listWebhooks, registerWebhook } from "../api";
import { WebhookRegistration } from "../types";
import { notify } from "../utils/notify";

export function WebhooksPanel() {
  const [hooks, setHooks] = useState<WebhookRegistration[]>([]);
  const [targetUrl, setTargetUrl] = useState("");
  const [event, setEvent] = useState("");

  const refresh = async () => {
    const data = await listWebhooks();
    setHooks(data);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleRegister = async () => {
    if (!targetUrl.trim() || !event.trim()) return;
    try {
      await registerWebhook(targetUrl.trim(), event.trim());
      setTargetUrl("");
      setEvent("");
      await refresh();
      notify.success("Webhook registered");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to register webhook.";
      notify.error(detail);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Input
            placeholder="Target URL"
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            style={{ minWidth: 240 }}
          />
          <Input
            placeholder="Event (e.g. dataset.uploaded)"
            value={event}
            onChange={(event) => setEvent(event.target.value)}
            style={{ minWidth: 200 }}
          />
          <Button type="primary" onClick={handleRegister}>
            Register
          </Button>
          <Button onClick={refresh}>Refresh</Button>
        </Space>
        <List
          dataSource={hooks}
          locale={{ emptyText: "No webhooks registered." }}
          renderItem={(item) => (
            <List.Item>
              <Space direction="vertical">
                <Typography.Text strong>{item.event}</Typography.Text>
                <Typography.Text type="secondary">{item.target_url}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
