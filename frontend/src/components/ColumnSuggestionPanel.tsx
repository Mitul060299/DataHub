import { Button, Card, Input, List, Space, Tag, Typography } from "antd";
import { useState } from "react";
import { fetchColumnSuggestions } from "../api";
import { notify } from "../utils/notify";

interface Props {
  datasetId: string | null;
}

export function ColumnSuggestionPanel({ datasetId }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSuggest = async () => {
    if (!datasetId || !query.trim()) return;
    setLoading(true);
    try {
      const data = await fetchColumnSuggestions(datasetId, query.trim(), 8);
      setSuggestions(data.suggestions || []);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to fetch column suggestions.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          Type a column name and get "did you mean" suggestions.
        </Typography.Text>
        <Space wrap>
          <Input
            placeholder="Column name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ minWidth: 200 }}
          />
          <Button type="primary" onClick={handleSuggest} disabled={!datasetId} loading={loading}>
            Suggest
          </Button>
        </Space>
        <List
          dataSource={suggestions}
          locale={{ emptyText: datasetId ? "No suggestions yet." : "Select a dataset first." }}
          renderItem={(item) => (
            <List.Item>
              <Tag>{item}</Tag>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
