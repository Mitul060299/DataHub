import { Button, Card, List, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { createDashboard, addWidget, listDashboardTemplates } from "../api";
import { notify } from "../utils/notify";

interface TemplateWidget {
  title: string;
  chart_type: string;
  config: Record<string, unknown>;
}

interface Template {
  template_id: string;
  name: string;
  description: string;
  widgets: TemplateWidget[];
}

interface Props {
  datasetId: string | null;
  columns: string[];
}

export function TemplateGalleryPanel({ datasetId, columns }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listDashboardTemplates().then(setTemplates).catch(() => {
      notify.error("Failed to load templates");
    });
  }, []);

  const handleApply = async (template: Template) => {
    if (!datasetId) {
      notify.error("Select a dataset first");
      return;
    }
    setLoading(true);
    try {
      const dashboard = await createDashboard(template.name);
      const column = columns[0];
      for (const widget of template.widgets) {
        const config = { ...widget.config } as Record<string, unknown>;
        if (typeof config.dataset_id === "string") {
          config.dataset_id = datasetId;
        }
        if (typeof config.column === "string") {
          config.column = column;
        }
        await addWidget({
          dashboard_id: dashboard.dashboard_id,
          title: widget.title,
          chart_type: widget.chart_type,
          dataset_id: config.dataset_id as string,
          column: (config.column as string | undefined) || undefined,
          bins: config.bins as number | undefined,
          top_n: config.top_n as number | undefined
        });
      }
      notify.success("Template applied");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to apply template.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <List
        dataSource={templates}
        loading={loading}
        locale={{ emptyText: "No templates available." }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button key="apply" type="primary" onClick={() => handleApply(item)}>
                Apply
              </Button>
            ]}
          >
            <Space direction="vertical">
              <Typography.Text strong>{item.name}</Typography.Text>
              <Typography.Text type="secondary">{item.description}</Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}
