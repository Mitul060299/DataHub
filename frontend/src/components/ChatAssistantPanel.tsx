import { Button, Input, List, Space, Typography } from "antd";
import { useMemo, useState } from "react";
import { chatWithAgent } from "../api";
import { ChatMessage } from "../types";
import { notify } from "../utils/notify";

interface Props {
  datasetId: string | null;
  workspaceId?: string | null;
}

export function ChatAssistantPanel({ datasetId, workspaceId }: Props) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);

  const canSend = useMemo(() => !!datasetId && message.trim().length > 0 && !loading, [datasetId, message, loading]);

  const handleSend = async () => {
    if (!datasetId || !message.trim()) return;
    const nextMessage = message.trim();
    const nextHistory = [...history, { role: "user", content: nextMessage }];
    setHistory(nextHistory);
    setMessage("");
    setLoading(true);
    try {
      const response = await chatWithAgent(datasetId, nextMessage, nextHistory, workspaceId || undefined);
      setHistory((current) => [...current, { role: "assistant", content: response.reply }]);
      if (response?.notes?.length) {
        notify.info(response.notes.join(" "));
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to get assistant response.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      {!datasetId && (
        <Typography.Text type="secondary">
          Select a dataset to enable chat.
        </Typography.Text>
      )}
      <List
        bordered
        dataSource={history}
        locale={{ emptyText: "Ask questions about your dataset." }}
        renderItem={(item) => (
          <List.Item>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Typography.Text type={item.role === "assistant" ? "secondary" : undefined}>
                <strong>{item.role === "assistant" ? "Assistant" : "You"}:</strong> {item.content}
              </Typography.Text>
            </Space>
          </List.Item>
        )}
        style={{ maxHeight: 320, overflow: "auto" }}
      />
      <Input.TextArea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Ask about columns, missing values, anomalies, or chart ideas..."
        autoSize={{ minRows: 2, maxRows: 4 }}
        disabled={!datasetId || loading}
      />
      <Button type="primary" onClick={handleSend} disabled={!canSend} loading={loading}>
        Ask AI Assistant
      </Button>
    </Space>
  );
}
