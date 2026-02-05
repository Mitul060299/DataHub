import { Button, Card, Input, List, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { listAuditLogs } from "../api";
import { AuditEntry } from "../types";
import { notify } from "../utils/notify";

export function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [target, setTarget] = useState("");
  const [sinceMinutes, setSinceMinutes] = useState("");
  const [limit, setLimit] = useState("200");

  const refresh = async () => {
    try {
      const data = await listAuditLogs({
        action: action || undefined,
        actor: actor || undefined,
        target: target || undefined,
        since_minutes: sinceMinutes ? Number(sinceMinutes) || undefined : undefined,
        limit: limit ? Number(limit) || undefined : undefined
      });
      setEntries(data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to load audit logs.";
      notify.error(detail);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Input
            placeholder="Action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            style={{ minWidth: 160 }}
          />
          <Space size={4} wrap>
            <Button size="small" onClick={() => setAction("share.dashboard")}>Share dashboard</Button>
            <Button size="small" onClick={() => setAction("unshare.dashboard")}>Unshare dashboard</Button>
            <Button size="small" onClick={() => setAction("share.workspace")}>Share workspace</Button>
            <Button size="small" onClick={() => setAction("unshare.workspace")}>Unshare workspace</Button>
            <Button size="small" onClick={() => setAction("view.shared.dashboard")}>View shared dashboard</Button>
            <Button size="small" onClick={() => setAction("view.shared.workspace")}>View shared workspace</Button>
            <Button size="small" onClick={() => setAction("unshare.dashboard.all")}>Unshare all dashboards</Button>
            <Button size="small" onClick={() => setAction("unshare.workspace.all")}>Unshare all workspaces</Button>
            <Button size="small" onClick={() => setAction("purge.dashboard.expired")}>Purge expired dashboards</Button>
            <Button size="small" onClick={() => setAction("purge.workspace.expired")}>Purge expired workspaces</Button>
            <Button size="small" onClick={() => setAction("approval.request.create")}>Approval create</Button>
            <Button size="small" onClick={() => setAction("approval.request.approve")}>Approval approve</Button>
            <Button size="small" onClick={() => setAction("approval.request.reject")}>Approval reject</Button>
            <Button size="small" onClick={() => setAction("recipe.save")}>Recipe save</Button>
            <Button size="small" onClick={() => setAction("recipe.apply")}>Recipe apply</Button>
            <Button size="small" onClick={() => setAction("recipe.revert")}>Recipe revert</Button>
            <Button size="small" onClick={() => setAction("")}>Clear action</Button>
          </Space>
          <Input
            placeholder="Actor"
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            style={{ minWidth: 160 }}
          />
          <Input
            placeholder="Target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            style={{ minWidth: 160 }}
          />
          <Input
            placeholder="Since minutes"
            value={sinceMinutes}
            onChange={(event) => setSinceMinutes(event.target.value)}
            style={{ width: 140 }}
          />
          <Input
            placeholder="Limit"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            style={{ width: 100 }}
          />
          <Button onClick={refresh}>Refresh</Button>
        </Space>
        <List
          dataSource={entries}
          locale={{ emptyText: "No audit entries yet." }}
          renderItem={(item) => (
            <List.Item>
              <Space direction="vertical">
                <Typography.Text strong>
                  {item.action} {item.target}
                </Typography.Text>
                {item.created_at && (
                  <Typography.Text type="secondary">
                    At: {item.created_at}
                  </Typography.Text>
                )}
                <Typography.Text type="secondary">Actor: {item.actor}</Typography.Text>
                {item.metadata && (
                  <Typography.Text type="secondary">
                    Metadata: {JSON.stringify(item.metadata)}
                  </Typography.Text>
                )}
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
