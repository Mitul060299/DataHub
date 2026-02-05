import { Button } from "antd";
import type { AIAction } from "./types";

type Props = {
  action: AIAction;
  onAction: (action: AIAction) => void;
};

export function AIChatActionButton({ action, onAction }: Props) {
  return (
    <Button size="small" className="ai-action-button" onClick={() => onAction(action)}>
      {action.label ?? action.type}
    </Button>
  );
}
