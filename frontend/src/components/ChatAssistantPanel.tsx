import { Button, Input, List, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { createChatSession, streamChatSessionMessage } from "../api";
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
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    setSessionId(null);
    setHistory([]);
  }, [datasetId, workspaceId]);

  const ensureSession = async (initialRequest?: string) => {
    if (!datasetId) return null;
    if (sessionId) return sessionId;
    const response = await createChatSession(datasetId, initialRequest);
    const created = response?.data?.id;
    if (!created) {
      throw new Error("Failed to create chat session");
    }
    setSessionId(created);
    return created;
  };

  const canSend = useMemo(() => !!datasetId && message.trim().length > 0 && !loading, [datasetId, message, loading]);

  const handleSend = async () => {
    if (!datasetId || !message.trim()) return;
    const nextMessage = message.trim();
    const nextHistory = [...history, { role: "user", content: nextMessage }];
    setHistory(nextHistory);
    setMessage("");
    setLoading(true);
    try {
      const activeSessionId = await ensureSession(nextMessage);
      if (!activeSessionId) {
        throw new Error("No active session");
      }
      const events = await streamChatSessionMessage(activeSessionId, nextMessage);
      const assistantReplies = events.filter((event) => event.type === "message");
      if (assistantReplies.length === 0) {
        setHistory((current) => [...current, { role: "assistant", content: "No assistant response received." }]);
      } else {
        setHistory((current) => [
          ...current,
          ...assistantReplies.map((event) => ({
            role: "assistant" as const,
            content: event.content,
          })),
        ]);
      }
      const confirmationEvent = events.find((event) => event.type === "confirmation_needed");
      if (confirmationEvent?.data?.message) {
        notify.info(String(confirmationEvent.data.message));
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
