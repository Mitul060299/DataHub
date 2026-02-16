/**
 * @deprecated This component uses the old simplified dashboard system.
 * Use DataVisualizationTab component with /visualizations API instead.
 * This file is kept for backwards compatibility only.
 */

import { Button, Card, Divider, Descriptions, List, Popconfirm, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { notify } from "../utils/notify";
import { getRoleFromToken } from "../utils/auth";
import {
  fetchShareSettings,
  listDashboards,
  listWorkspaces,
  purgeExpiredDashboards,
  purgeExpiredWorkspaces,
  unshareAllDashboards,
  unshareAllWorkspaces,
  unshareDashboard,
  unshareWorkspace
} from "../api";
import { ShareSettings } from "../types";

interface SharedDashboard {
  dashboard_id: string;
  name: string;
  is_shared?: boolean;
  share_token?: string | null;
  share_expires_at?: string | null;
  share_scope?: string | null;
}

interface SharedWorkspace {
  id: string;
  name: string;
  is_shared?: boolean;
  share_token?: string | null;
  share_expires_at?: string | null;
  share_scope?: string | null;
}

export function ShareAdminPanel() {
  const [loading, setLoading] = useState(false);
  const [dashboards, setDashboards] = useState<SharedDashboard[]>([]);
  const [workspaces, setWorkspaces] = useState<SharedWorkspace[]>([]);
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const role = getRoleFromToken();

  const refresh = async () => {
    try {
      const shareSettingsPromise = role === "admin" ? fetchShareSettings() : Promise.resolve(null);
      const [dashData, wsData, shareSettings] = await Promise.all([
        listDashboards(),
        listWorkspaces(),
        shareSettingsPromise
      ]);
      setDashboards(dashData.filter((item: SharedDashboard) => item.is_shared));
      setWorkspaces(wsData.filter((item: SharedWorkspace) => item.is_shared));
      setSettings(shareSettings);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to load shared items.";
      notify.error(detail);
    }
  };

  const handleUnshareAllDashboards = async () => {
    setLoading(true);
    try {
      const result = await unshareAllDashboards();
      notify.success(`Unshared ${result?.count ?? 0} dashboards`);
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to unshare dashboards.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleUnshareAllWorkspaces = async () => {
    setLoading(true);
    try {
      const result = await unshareAllWorkspaces();
      notify.success(`Unshared ${result?.count ?? 0} workspaces`);
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to unshare workspaces.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handlePurgeExpiredDashboards = async () => {
    setLoading(true);
    try {
      const result = await purgeExpiredDashboards();
      notify.success(`Purged ${result?.count ?? 0} expired dashboards`);
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to purge expired dashboards.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handlePurgeExpiredWorkspaces = async () => {
    setLoading(true);
    try {
      const result = await purgeExpiredWorkspaces();
      notify.success(`Purged ${result?.count ?? 0} expired workspaces`);
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to purge expired workspaces.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleUnshareDashboard = async (dashboardId: string) => {
    setLoading(true);
    try {
      await unshareDashboard(dashboardId);
      notify.success("Dashboard unshared");
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to unshare dashboard.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleUnshareWorkspace = async (workspaceId: string) => {
    setLoading(true);
    try {
      await unshareWorkspace(workspaceId);
      notify.success("Workspace unshared");
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to unshare workspace.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space direction="vertical">
          <Typography.Text type="secondary">
            Admin-only share management. Current role: {role || "unknown"}
          </Typography.Text>
          {settings && (
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Public base URL">
                {settings.public_base_url || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Rate limit / min">
                {settings.shared_rate_limit_per_minute}
              </Descriptions.Item>
              <Descriptions.Item label="Signed links required">
                {settings.share_signing_required ? "Yes" : "No"}
              </Descriptions.Item>
              <Descriptions.Item label="Scope allowlist">
                {settings.share_scope_allowlist?.length ? settings.share_scope_allowlist.join(", ") : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Scope policy">
                {Object.keys(settings.share_scope_policy || {}).length
                  ? Object.entries(settings.share_scope_policy)
                      .map(([scope, role]) => `${scope}: ${role}`)
                      .join(" | ")
                  : "-"}
              </Descriptions.Item>
            </Descriptions>
          )}
          <Space>
            <Button onClick={refresh} disabled={loading}>
              Refresh
            </Button>
            <Popconfirm
              title="Purge expired dashboards?"
              description="This revokes expired dashboard links."
              onConfirm={handlePurgeExpiredDashboards}
              okText="Purge"
              cancelText="Cancel"
              disabled={role !== "admin"}
            >
              <Button danger loading={loading} disabled={role !== "admin"}>
                Purge Expired Dashboards
              </Button>
            </Popconfirm>
            <Popconfirm
              title="Unshare all dashboards?"
              description="This revokes all shared dashboard links."
              onConfirm={handleUnshareAllDashboards}
              okText="Unshare"
              cancelText="Cancel"
              disabled={role !== "admin"}
            >
              <Button danger loading={loading} disabled={role !== "admin"}>
                Unshare All Dashboards
              </Button>
            </Popconfirm>
            <Popconfirm
              title="Purge expired workspaces?"
              description="This revokes expired workspace links."
              onConfirm={handlePurgeExpiredWorkspaces}
              okText="Purge"
              cancelText="Cancel"
              disabled={role !== "admin"}
            >
              <Button danger loading={loading} disabled={role !== "admin"}>
                Purge Expired Workspaces
              </Button>
            </Popconfirm>
            <Popconfirm
              title="Unshare all workspaces?"
              description="This revokes all shared workspace links."
              onConfirm={handleUnshareAllWorkspaces}
              okText="Unshare"
              cancelText="Cancel"
              disabled={role !== "admin"}
            >
              <Button danger loading={loading} disabled={role !== "admin"}>
                Unshare All Workspaces
              </Button>
            </Popconfirm>
          </Space>
        </Space>
        <Divider />
        <Typography.Text strong>Shared Dashboards</Typography.Text>
        <List
          dataSource={dashboards}
          locale={{ emptyText: "No shared dashboards." }}
          renderItem={(item) => {
            const isExpired = item.share_expires_at
              ? new Date(item.share_expires_at).getTime() < Date.now()
              : false;
            return (
              <List.Item
                actions={[
                  <Popconfirm
                    key="unshare"
                    title="Revoke share?"
                    onConfirm={() => handleUnshareDashboard(item.dashboard_id)}
                    okText="Revoke"
                    cancelText="Cancel"
                    disabled={role !== "admin"}
                  >
                    <Button danger size="small" disabled={role !== "admin"}>
                      Revoke
                    </Button>
                  </Popconfirm>
                ]}
              >
                <Space direction="vertical">
                  <Space>
                    <Typography.Text>{item.name}</Typography.Text>
                    {item.share_scope && <Tag>{item.share_scope}</Tag>}
                    {isExpired && <Tag color="red">Expired</Tag>}
                  </Space>
                  <Typography.Text type="secondary">
                    Token: {item.share_token || "-"}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    Expires: {item.share_expires_at || "never"}
                  </Typography.Text>
                </Space>
              </List.Item>
            );
          }}
        />
        <Divider />
        <Typography.Text strong>Shared Workspaces</Typography.Text>
        <List
          dataSource={workspaces}
          locale={{ emptyText: "No shared workspaces." }}
          renderItem={(item) => {
            const isExpired = item.share_expires_at
              ? new Date(item.share_expires_at).getTime() < Date.now()
              : false;
            return (
              <List.Item
                actions={[
                  <Popconfirm
                    key="unshare"
                    title="Revoke share?"
                    onConfirm={() => handleUnshareWorkspace(item.id)}
                    okText="Revoke"
                    cancelText="Cancel"
                    disabled={role !== "admin"}
                  >
                    <Button danger size="small" disabled={role !== "admin"}>
                      Revoke
                    </Button>
                  </Popconfirm>
                ]}
              >
                <Space direction="vertical">
                  <Space>
                    <Typography.Text>{item.name}</Typography.Text>
                    {item.share_scope && <Tag>{item.share_scope}</Tag>}
                    {isExpired && <Tag color="red">Expired</Tag>}
                  </Space>
                  <Typography.Text type="secondary">
                    Token: {item.share_token || "-"}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    Expires: {item.share_expires_at || "never"}
                  </Typography.Text>
                </Space>
              </List.Item>
            );
          }}
        />
      </Space>
    </Card>
  );
}
