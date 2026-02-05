import { Button, Space, Tag, Typography } from "antd";
import { MinusOutlined, RobotOutlined } from "@ant-design/icons";
import type { AIContext, DatasetSummary } from "./types";

const { Text } = Typography;

const CONTEXT_LABELS: Record<AIContext, string> = {
  import: "Data Import",
  clean: "Data Cleaning",
  transform: "Transformations",
  model: "Data Modeling",
  dashboard: "Dashboards",
  ml: "ML Modeling",
};

type Props = {
  context: AIContext;
  dataset?: DatasetSummary;
  onToggleCompact: () => void;
};

export function AIChatHeader({ context, dataset, onToggleCompact }: Props) {
  return (
    <div className="ai-chat-header">
      <Space align="center" size="middle">
        <span className="ai-indicator" aria-hidden="true" />
        <RobotOutlined />
        <Text className="ai-chat-title">AI Assistant</Text>
      </Space>
      <Space align="center">
        <Tag color="blue">Context: {CONTEXT_LABELS[context]}</Tag>
        {dataset && <Tag color="geekblue">Dataset: {dataset.name}</Tag>}
        <Button type="text" size="small" icon={<MinusOutlined />} onClick={onToggleCompact}>
          Minimize
        </Button>
      </Space>
    </div>
  );
}
