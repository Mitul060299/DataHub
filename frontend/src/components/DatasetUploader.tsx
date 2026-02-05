import { Upload, Button, Table, Space, Typography } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { useState } from "react";
import { fetchAgentSuggestions, fetchInsights, fetchProfile, uploadDataset } from "../api";
import { DatasetPreview, ProfileSummary, InsightSummary, AgentSuggestion } from "../types";
import { notify } from "../utils/notify";

interface Props {
  onInsights: (insights: InsightSummary) => void;
  onSuggestion: (suggestion: AgentSuggestion) => void;
  onDatasetId: (datasetId: string) => void;
  workspaceId?: string | null;
}

export function DatasetUploader({ onInsights, onSuggestion, onDatasetId, workspaceId }: Props) {
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [insights, setInsights] = useState<InsightSummary | null>(null);

  const props = {
    name: "file",
    accept: ".csv",
    customRequest: async (options: any) => {
      try {
        const result = await uploadDataset(options.file as File);
        setPreview(result);
        onDatasetId(result.dataset_id);
        const [profileResult, insightResult] = await Promise.all([
          fetchProfile(result.dataset_id),
          fetchInsights(result.dataset_id, workspaceId || undefined)
        ]);
        setProfile(profileResult);
        setInsights(insightResult);
        onInsights(insightResult);
        const suggestionResult = await fetchAgentSuggestions(result.dataset_id, workspaceId || undefined);
        onSuggestion(suggestionResult);
        notify.success("Dataset uploaded");
        options.onSuccess(result, options.file);
      } catch (error) {
        notify.error("Upload failed");
        options.onError(error);
      }
    }
  };

  const columns = preview?.columns.map((col) => ({
    title: col,
    dataIndex: col,
    key: col
  }));

  return (
    <div>
      <Upload {...props}>
        <Button icon={<UploadOutlined />}>Upload CSV</Button>
      </Upload>
      {preview && (
        <div style={{ marginTop: 16 }}>
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Typography.Text>
              Rows: {preview.row_count}
            </Typography.Text>
            {profile && (
              <Typography.Text type="secondary">
                Issues: {profile.issues.length}
              </Typography.Text>
            )}
          </Space>
          <Table
            dataSource={preview.sample_rows.map((row, index) => ({ key: index, ...row }))}
            columns={columns}
            pagination={false}
            scroll={{ x: true }}
          />
        </div>
      )}
      {insights && (
        <div style={{ marginTop: 16 }}>
          <Typography.Title level={5}>Top Insights</Typography.Title>
          <ul>
            {insights.highlights.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
