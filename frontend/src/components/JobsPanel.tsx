import { Button, Card, Input, List, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { createJob, listJobs } from "../api";
import { ScheduledJob } from "../types";
import { notify } from "../utils/notify";

export function JobsPanel() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [name, setName] = useState("");
  const [cron, setCron] = useState("");
  const [action, setAction] = useState("");

  const refresh = async () => {
    const data = await listJobs();
    setJobs(data);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !cron.trim() || !action.trim()) return;
    try {
      await createJob(name.trim(), cron.trim(), action.trim());
      setName("");
      setCron("");
      setAction("");
      await refresh();
      notify.success("Job created");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to create job.";
      notify.error(detail);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Input
            placeholder="Job name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ minWidth: 180 }}
          />
          <Input
            placeholder="Cron (e.g. 0 9 * * *)"
            value={cron}
            onChange={(event) => setCron(event.target.value)}
            style={{ minWidth: 180 }}
          />
          <Input
            placeholder="Action (e.g. dataset.exported)"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            style={{ minWidth: 200 }}
          />
          <Button type="primary" onClick={handleCreate}>
            Create
          </Button>
          <Button onClick={refresh}>Refresh</Button>
        </Space>
        <List
          dataSource={jobs}
          locale={{ emptyText: "No scheduled jobs yet." }}
          renderItem={(item) => (
            <List.Item>
              <Space direction="vertical">
                <Typography.Text strong>{item.name}</Typography.Text>
                <Typography.Text type="secondary">Cron: {item.cron}</Typography.Text>
                <Typography.Text type="secondary">Action: {item.action}</Typography.Text>
                <Typography.Text type="secondary">Status: {item.status}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
