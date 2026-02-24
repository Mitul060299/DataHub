import React from "react";
import { Button, Space, Tag } from "antd";
import {
  DownloadOutlined,
  SaveOutlined,
  ShareAltOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";

interface WorkspaceHeaderActionsProps {
  persistence: {
    color: string;
    label: string;
  };
  onHelp: () => void;
  onExport: () => void;
  onSave: () => void;
  onShare: () => void;
}

export const WorkspaceHeaderActions: React.FC<WorkspaceHeaderActionsProps> = ({
  persistence,
  onHelp,
  onExport,
  onSave,
  onShare,
}) => {
  return (
    <Space>
      <Tag color={persistence.color}>{persistence.label}</Tag>
      <Button size="small" icon={<QuestionCircleOutlined />} onClick={onHelp}>
        What can I do here?
      </Button>
      <Button size="small" icon={<DownloadOutlined />} onClick={onExport} title="Download as CSV">
        Export
      </Button>
      <Button size="small" icon={<SaveOutlined />} onClick={onSave} title="Save as pipeline">
        Save
      </Button>
      <Button size="small" icon={<ShareAltOutlined />} onClick={onShare} title="Share pipeline">
        Share
      </Button>
    </Space>
  );
};

export default WorkspaceHeaderActions;
