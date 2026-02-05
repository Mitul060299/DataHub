import { Card, Typography } from "antd";
import { useEffect, useState } from "react";
import { fetchSharedWorkspace } from "../api";
import { WorkspaceOut } from "../types";
import { notify } from "../utils/notify";

interface Props {
  shareToken: string | null;
}

export function SharedWorkspacePanel({ shareToken }: Props) {
  const [workspace, setWorkspace] = useState<WorkspaceOut | null>(null);

  useEffect(() => {
    if (!shareToken) {
      setWorkspace(null);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const scope = params.get("scope") || undefined;
    fetchSharedWorkspace(shareToken, scope)
      .then(setWorkspace)
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || "Failed to load shared workspace.";
        notify.error(detail);
      });
  }, [shareToken]);

  if (!shareToken) return null;

  return (
    <Card>
      <Typography.Title level={4}>{workspace?.name || "Shared Workspace"}</Typography.Title>
      <Typography.Text type="secondary">
        This workspace is shared read-only.
      </Typography.Text>
    </Card>
  );
}
