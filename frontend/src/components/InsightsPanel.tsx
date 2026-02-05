import { Card, List, Typography } from "antd";
import { InsightSummary } from "../types";

interface Props {
  insights: InsightSummary | null;
}

export function InsightsPanel({ insights }: Props) {
  if (!insights) {
    return (
      <Card>
        <Typography.Paragraph>
          Upload a dataset to generate insights.
        </Typography.Paragraph>
      </Card>
    );
  }

  return (
    <Card>
      {insights.narrative && (
        <>
          <Typography.Title level={5}>Narrative Summary</Typography.Title>
          <Typography.Paragraph>{insights.narrative}</Typography.Paragraph>
        </>
      )}
      <Typography.Title level={5}>Highlights</Typography.Title>
      <List dataSource={insights.highlights} renderItem={(item) => <List.Item>{item}</List.Item>} />
      <Typography.Title level={5} style={{ marginTop: 16 }}>Anomalies</Typography.Title>
      <List dataSource={insights.anomalies} renderItem={(item) => <List.Item>{item}</List.Item>} />
      <Typography.Title level={5} style={{ marginTop: 16 }}>Recommendations</Typography.Title>
      <List dataSource={insights.recommendations} renderItem={(item) => <List.Item>{item}</List.Item>} />
      {insights.explanations?.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16 }}>Why these matter</Typography.Title>
          <List dataSource={insights.explanations} renderItem={(item) => <List.Item>{item}</List.Item>} />
        </>
      )}
    </Card>
  );
}
