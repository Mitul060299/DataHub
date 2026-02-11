import { Button, Card, Input, List, Space, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { notify } from "../utils/notify";
import { getAuthToken } from "../utils/auth";

export function RealtimePresencePanel() {
  const [workspaceId, setWorkspaceId] = useState("default");
  const [user, setUser] = useState("alice");
  const [users, setUsers] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<{ user: string; text: string }[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  const wsUrl = useMemo(() => {
    const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
    const wsBase = base.replace(/^http/, "ws");
    const token = getAuthToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
    return `${wsBase}/realtime/presence?workspace_id=${encodeURIComponent(workspaceId)}&user=${encodeURIComponent(user)}${tokenParam}`;
  }, [workspaceId, user]);

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnected(false);
  };

  const connect = () => {
    disconnect();
    try {
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      socket.onopen = () => {
        setConnected(true);
        notify.success("Connected to presence");
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "presence" && Array.isArray(payload.users)) {
            setUsers(payload.users);
          }
          if (payload.type === "history" && Array.isArray(payload.messages)) {
            setMessages(payload.messages);
          }
          if (payload.type === "message" && payload.message) {
            setMessages((prev) => [...prev, payload.message]);
          }
        } catch {
          // ignore parse errors
        }
      };
      socket.onclose = () => {
        setConnected(false);
      };
      socket.onerror = () => {
        notify.error("Presence connection error");
      };
    } catch (err: any) {
      notify.error(err?.message || "Failed to connect presence.");
    }
  };

  useEffect(() => () => disconnect(), []);

  const sendMessage = () => {
    if (!socketRef.current || !message.trim()) return;
    socketRef.current.send(JSON.stringify({ type: "message", text: message.trim() }));
    setMessage("");
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Input
            placeholder="Workspace ID"
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            style={{ minWidth: 160 }}
          />
          <Input
            placeholder="User name"
            value={user}
            onChange={(event) => setUser(event.target.value)}
            style={{ minWidth: 160 }}
          />
          <Button type="primary" onClick={connect} disabled={connected}>
            Connect
          </Button>
          <Button onClick={disconnect} disabled={!connected}>
            Disconnect
          </Button>
        </Space>
        <List
          dataSource={users}
          locale={{ emptyText: "No active users." }}
          renderItem={(item) => (
            <List.Item>
              <Typography.Text>{item}</Typography.Text>
            </List.Item>
          )}
        />
        <Typography.Text type="secondary">Live messages</Typography.Text>
        <List
          dataSource={messages}
          locale={{ emptyText: "No messages yet." }}
          renderItem={(item, idx) => (
            <List.Item key={`${item.user}-${idx}`}>
              <Typography.Text>
                {item.user}: {item.text}
              </Typography.Text>
            </List.Item>
          )}
          style={{ maxHeight: 200, overflow: "auto" }}
        />
        <Space wrap>
          <Input
            placeholder="Type a message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            style={{ minWidth: 220 }}
          />
          <Button onClick={sendMessage} disabled={!connected || !message.trim()}>
            Send
          </Button>
        </Space>
      </Space>
    </Card>
  );
}
