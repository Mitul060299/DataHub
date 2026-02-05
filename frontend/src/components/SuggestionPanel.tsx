import { Card, List, Button, Typography, Space } from "antd";
import { AgentSuggestion } from "../types";
import { submitAgentFeedback } from "../api";
import { notify } from "../utils/notify";

interface Props {
  suggestion: AgentSuggestion | null;
  onApply: () => void;
}

export function SuggestionPanel({ suggestion, onApply }: Props) {
  if (!suggestion) {
    return (
      <Card>
        <Typography.Paragraph>
          No AI suggestions yet. Upload a dataset to generate them.
        </Typography.Paragraph>
      </Card>
    );
  }

  return (
    <Card>
      <Typography.Title level={5}>Recommended Steps</Typography.Title>
      {suggestion.notes?.length > 0 && (
        <List
          size="small"
          dataSource={suggestion.notes}
          renderItem={(item) => (
            <List.Item>
              <Typography.Text type="secondary">{item}</Typography.Text>
            </List.Item>
          )}
        />
      )}
      <List
        dataSource={suggestion.recommended_steps}
        renderItem={(item, index) => (
          <List.Item>
            {index + 1}. {item.name}
          </List.Item>
        )}
      />
      <Space style={{ marginTop: 12 }}>
        <Button type="primary" onClick={onApply}>
          Apply Suggested Recipe
        </Button>
        <Button
          onClick={async () => {
            try {
              await submitAgentFeedback(suggestion.dataset_id, "up", "suggestion");
              notify.success("Thanks for the feedback!");
            } catch (err: any) {
              const detail = err?.response?.data?.detail || "Failed to submit feedback.";
              notify.error(detail);
            }
          }}
        >
          Helpful
        </Button>
        <Button
          onClick={async () => {
            try {
              await submitAgentFeedback(suggestion.dataset_id, "down", "suggestion");
              notify.success("Thanks for the feedback!");
            } catch (err: any) {
              const detail = err?.response?.data?.detail || "Failed to submit feedback.";
              notify.error(detail);
            }
          }}
        >
          Not helpful
        </Button>
      </Space>
    </Card>
  );
}
