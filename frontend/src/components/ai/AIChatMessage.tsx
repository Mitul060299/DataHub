import { Space, Typography } from "antd";
import type { AIMessage, AIAction } from "./types";
import { AIChatActionButton } from "./AIChatActionButton";

const { Text } = Typography;

type Props = {
  message: AIMessage;
  onAction: (action: AIAction) => void;
};

export function AIChatMessage({ message, onAction }: Props) {
  return (
    <div className={`ai-message ${message.role === "user" ? "ai-message-user" : "ai-message-ai"}`}>
      <Text>{message.content}</Text>
      {message.actions && message.actions.length > 0 && (
        <Space wrap className="ai-message-actions">
          {message.actions.map((action) => (
            <AIChatActionButton key={`${message.id}-${action.type}`} action={action} onAction={onAction} />
          ))}
        </Space>
      )}
    </div>
  );
}
