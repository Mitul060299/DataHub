import { Button, Card, Input, List, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { createWorkspace, listWorkspaces, shareWorkspace, unshareWorkspace } from "../api";
import { WorkspaceOut } from "../types";
import { notify } from "../utils/notify";
import { getRoleFromToken } from "../utils/auth";

interface Props {
  activeWorkspaceId?: string | null;
  onSelectWorkspace?: (workspaceId: string) => void;
}

export function WorkspacePanel({ activeWorkspaceId, onSelectWorkspace }: Props) {
  const [name, setName] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceOut[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareExpiryHours, setShareExpiryHours] = useState<number>(0);
  const [shareScope, setShareScope] = useState<string>("");
  const role = getRoleFromToken();

  const refresh = async () => {
    const data = await listWorkspaces();
    setWorkspaces(data);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createWorkspace(name.trim());
      setName("");
      await refresh();
      notify.success("Workspace created");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to create workspace.";
      notify.error(detail);
    }
  };

  const handleShare = async (workspaceId: string) => {
    try {
      const data = await shareWorkspace(workspaceId, shareExpiryHours || undefined, shareScope || undefined);
      setShareLink(data.share_url || data.share_token || null);
      notify.success("Workspace share link generated");
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to share workspace.";
      if (detail.toLowerCase().includes("scope")) {
        notify.error("Share scope not allowed for your role.");
      } else {
        notify.error(detail);
      }
    }
  };

  const handleUnshare = async (workspaceId: string) => {
    try {
      await unshareWorkspace(workspaceId);
      notify.success("Workspace unshared");
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to unshare workspace.";
      notify.error(detail);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Input
            placeholder="Workspace name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ minWidth: 200 }}
          />
          <Button type="primary" onClick={handleCreate}>
            Create
          </Button>
          <Button onClick={refresh}>Refresh</Button>
          <Input
            placeholder="Share expiry (hours)"
            value={shareExpiryHours ? String(shareExpiryHours) : ""}
            onChange={(event) => setShareExpiryHours(Number(event.target.value) || 0)}
            style={{ minWidth: 160 }}
          />
          <Input
            placeholder="Share scope (optional)"
            value={shareScope}
            onChange={(event) => setShareScope(event.target.value)}
            style={{ minWidth: 180 }}
          />
        </Space>
        {shareLink && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Typography.Text type="secondary">Share link</Typography.Text>
            <Input value={shareLink} readOnly />
          </Space>
        )}
        {role && (
          <Typography.Text type="secondary">
            Current role: {role}. Some share scopes may require higher privileges.
          </Typography.Text>
        )}
        <List
          dataSource={workspaces}
          locale={{ emptyText: "No workspaces yet." }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="select" type="link" onClick={() => onSelectWorkspace?.(item.id)}>
                  Set Active
                </Button>,
                <Button key="share" onClick={() => handleShare(item.id)}>
                  Share
                </Button>,
                <Button key="unshare" onClick={() => handleUnshare(item.id)}>
                  Unshare
                </Button>
              ]}
            >
              <Space>
                <Typography.Text>{item.name}</Typography.Text>
                {activeWorkspaceId === item.id && <Tag color="blue">Active</Tag>}
                {item.is_shared && <Typography.Text type="secondary">Shared</Typography.Text>}
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
