import { Button, Card, Input, List, Popconfirm, Select, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { fetchContext, listContextVersions, listWorkspaces, revertContext, saveContext } from "../api";
import { BusinessRule, ContextPayload, ContextVersion, WorkspaceOut } from "../types";
import { notify } from "../utils/notify";

interface Props {
  activeWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
}

export function ContextPanel({ activeWorkspaceId, onSelectWorkspace }: Props) {
  const [workspaces, setWorkspaces] = useState<WorkspaceOut[]>([]);
  const [glossaryText, setGlossaryText] = useState("{}");
  const [rulesText, setRulesText] = useState("[]");
  const [versions, setVersions] = useState<ContextVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const loadWorkspaces = async () => {
    try {
      const data = await listWorkspaces();
      setWorkspaces(data);
      if (!activeWorkspaceId && data[0]?.id) {
        onSelectWorkspace(data[0].id);
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to load workspaces.";
      notify.error(detail);
    }
  };

  const loadContext = async (workspaceId: string) => {
    setLoading(true);
    try {
      const data: ContextPayload = await fetchContext(workspaceId);
      setGlossaryText(JSON.stringify(data.glossary ?? {}, null, 2));
      setRulesText(JSON.stringify(data.rules ?? [], null, 2));
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Context not found.";
      notify.error(detail);
      setGlossaryText("{}");
      setRulesText("[]");
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async (workspaceId: string) => {
    try {
      const data = await listContextVersions(workspaceId);
      setVersions(data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to load context versions.";
      notify.error(detail);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  useEffect(() => {
    if (activeWorkspaceId) {
      loadContext(activeWorkspaceId);
      loadVersions(activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  const handleSave = async () => {
    if (!activeWorkspaceId) return;
    try {
      const glossary = JSON.parse(glossaryText || "{}") as Record<string, string>;
      const rules = JSON.parse(rulesText || "[]") as BusinessRule[];
      await saveContext({ workspace_id: activeWorkspaceId, glossary, rules });
      notify.success("Context saved");
      await loadVersions(activeWorkspaceId);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Invalid JSON or failed to save context.";
      notify.error(detail);
    }
  };

  const handleRevert = async (versionId: string) => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      await revertContext(activeWorkspaceId, versionId);
      notify.success("Context reverted");
      await loadContext(activeWorkspaceId);
      await loadVersions(activeWorkspaceId);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to revert context.";
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
            placeholder="Select workspace"
            style={{ minWidth: 220 }}
            value={activeWorkspaceId || undefined}
            options={workspaces.map((w) => ({ label: w.name, value: w.id }))}
            onChange={onSelectWorkspace}
          />
          <Button onClick={() => activeWorkspaceId && loadContext(activeWorkspaceId)} disabled={!activeWorkspaceId}>
            Reload
          </Button>
          <Button type="primary" onClick={handleSave} disabled={!activeWorkspaceId} loading={loading}>
            Save Context
          </Button>
        </Space>
        <Typography.Text type="secondary">Glossary (JSON object)</Typography.Text>
        <Input.TextArea
          rows={6}
          value={glossaryText}
          onChange={(event) => setGlossaryText(event.target.value)}
          placeholder='{"term": "definition"}'
        />
        <Typography.Text type="secondary">Rules (JSON array)</Typography.Text>
        <Input.TextArea
          rows={6}
          value={rulesText}
          onChange={(event) => setRulesText(event.target.value)}
          placeholder='[{"key": "rule", "description": "...", "severity": "info"}]'
        />
        <Typography.Text strong>Context Versions</Typography.Text>
        <List
          dataSource={versions}
          locale={{ emptyText: "No versions yet." }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="revert"
                  title="Revert to this context version?"
                  onConfirm={() => handleRevert(item.version_id)}
                  okText="Revert"
                  cancelText="Cancel"
                >
                  <Button size="small">Revert</Button>
                </Popconfirm>
              ]}
            >
              <Space direction="vertical">
                <Space>
                  <Typography.Text strong>{item.version_id}</Typography.Text>
                  <Tag>{item.rules?.length ?? 0} rules</Tag>
                  <Tag>{Object.keys(item.glossary || {}).length} glossary</Tag>
                </Space>
                <Typography.Text type="secondary">Created: {item.created_at}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
