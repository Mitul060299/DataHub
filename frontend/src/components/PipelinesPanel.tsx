import { Button, Card, Input, List, Modal, Select, Space, Switch, Typography } from "antd";
import TextArea from "antd/es/input/TextArea";
import { useEffect, useMemo, useState } from "react";
import { createPipeline, deletePipeline, listConnectors, listDatasets, listPipelines, runPipeline, updatePipeline } from "../api";
import { PipelineSchedule } from "../types";
import { notify } from "../utils/notify";

const cadenceOptions = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" }
];

const weekdayOptions = [
  { label: "Mon", value: 0 },
  { label: "Tue", value: 1 },
  { label: "Wed", value: 2 },
  { label: "Thu", value: 3 },
  { label: "Fri", value: 4 },
  { label: "Sat", value: 5 },
  { label: "Sun", value: 6 }
];

export function PipelinesPanel() {
  const [pipelines, setPipelines] = useState<PipelineSchedule[]>([]);
  const [datasets, setDatasets] = useState<Array<{ dataset_id: string }>>([]);
  const [connectors, setConnectors] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly" | "monthly">("daily");
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState<number | undefined>(0);
  const [dayOfMonth, setDayOfMonth] = useState<number | undefined>(1);
  const [datasetId, setDatasetId] = useState<string | undefined>(undefined);
  const [connector, setConnector] = useState<string | undefined>(undefined);
  const [connectorConfig, setConnectorConfig] = useState("{}");
  const [applyRecipe, setApplyRecipe] = useState(false);
  const [runProfile, setRunProfile] = useState(true);
  const [runInsights, setRunInsights] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<PipelineSchedule | null>(null);
  const [editName, setEditName] = useState("");
  const [editCadence, setEditCadence] = useState<"daily" | "weekly" | "monthly">("daily");
  const [editTimeOfDay, setEditTimeOfDay] = useState("09:00");
  const [editDayOfWeek, setEditDayOfWeek] = useState<number | undefined>(0);
  const [editDayOfMonth, setEditDayOfMonth] = useState<number | undefined>(1);
  const [editDatasetId, setEditDatasetId] = useState<string | undefined>(undefined);
  const [editConnector, setEditConnector] = useState<string | undefined>(undefined);
  const [editConnectorConfig, setEditConnectorConfig] = useState("{}");
  const [editApplyRecipe, setEditApplyRecipe] = useState(false);
  const [editRunProfile, setEditRunProfile] = useState(true);
  const [editRunInsights, setEditRunInsights] = useState(true);
  const [editScheduleEnabled, setEditScheduleEnabled] = useState(false);

  const refresh = async () => {
    const [pipelineData, datasetData, connectorData] = await Promise.all([
      listPipelines(),
      listDatasets(),
      listConnectors()
    ]);
    setPipelines(pipelineData);
    setDatasets(datasetData);
    setConnectors(connectorData.connectors || []);
  };

  useEffect(() => {
    refresh();
  }, []);

  const datasetOptions = useMemo(() => datasets.map((item) => ({
    label: item.dataset_id,
    value: item.dataset_id
  })), [datasets]);

  const connectorOptions = useMemo(() => connectors.map((item) => ({
    label: item,
    value: item
  })), [connectors]);

  const handleCreate = async () => {
    if (!name.trim()) {
      notify.info("Pipeline name is required");
      return;
    }
    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = connectorConfig ? JSON.parse(connectorConfig) : {};
    } catch (error) {
      notify.error("Connector config must be valid JSON");
      return;
    }
    try {
      await createPipeline({
        name: name.trim(),
        cadence,
        time_of_day: timeOfDay,
        day_of_week: cadence === "weekly" ? dayOfWeek : undefined,
        day_of_month: cadence === "monthly" ? dayOfMonth : undefined,
        dataset_id: datasetId,
        connector: connector,
        connector_config: parsedConfig,
        apply_recipe: applyRecipe,
        run_profile: runProfile,
        run_insights: runInsights,
        enabled: scheduleEnabled
      });
      setName("");
      await refresh();
      notify.success("Pipeline created");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to create pipeline.";
      notify.error(detail);
    }
  };

  const handleRun = async (pipelineId: string) => {
    try {
      await runPipeline(pipelineId);
      notify.success("Pipeline triggered");
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to run pipeline.";
      notify.error(detail);
    }
  };

  const handleDelete = async (pipelineId: string) => {
    try {
      await deletePipeline(pipelineId);
      notify.success("Pipeline deleted");
      await refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to delete pipeline.";
      notify.error(detail);
    }
  };

  const openEdit = (pipeline: PipelineSchedule) => {
    setEditingPipeline(pipeline);
    setEditName(pipeline.name);
    setEditCadence(pipeline.cadence);
    setEditTimeOfDay(pipeline.time_of_day || "09:00");
    setEditDayOfWeek(pipeline.day_of_week ?? 0);
    setEditDayOfMonth(pipeline.day_of_month ?? 1);
    setEditDatasetId(pipeline.dataset_id || undefined);
    setEditConnector(pipeline.connector || undefined);
    setEditConnectorConfig(JSON.stringify(pipeline.connector_config || {}, null, 2));
    setEditApplyRecipe(pipeline.apply_recipe);
    setEditRunProfile(pipeline.run_profile);
    setEditRunInsights(pipeline.run_insights);
    setEditScheduleEnabled(pipeline.enabled);
    setIsEditing(true);
  };

  const handleUpdate = async () => {
    if (!editingPipeline) return;
    if (!editName.trim()) {
      notify.info("Pipeline name is required");
      return;
    }
    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = editConnectorConfig ? JSON.parse(editConnectorConfig) : {};
    } catch (error) {
      notify.error("Connector config must be valid JSON");
      return;
    }
    try {
      await updatePipeline(editingPipeline.pipeline_id, {
        name: editName.trim(),
        cadence: editCadence,
        time_of_day: editTimeOfDay,
        day_of_week: editCadence === "weekly" ? editDayOfWeek : undefined,
        day_of_month: editCadence === "monthly" ? editDayOfMonth : undefined,
        dataset_id: editDatasetId,
        connector: editConnector,
        connector_config: parsedConfig,
        apply_recipe: editApplyRecipe,
        run_profile: editRunProfile,
        run_insights: editRunInsights,
        enabled: editScheduleEnabled
      });
      setIsEditing(false);
      setEditingPipeline(null);
      await refresh();
      notify.success("Pipeline updated");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to update pipeline.";
      notify.error(detail);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Space wrap>
          <Input
            placeholder="Pipeline name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ minWidth: 200 }}
          />
          <Space>
            <Typography.Text>Enable schedule</Typography.Text>
            <Switch checked={scheduleEnabled} onChange={setScheduleEnabled} />
          </Space>
          <Select
            value={cadence}
            onChange={(value) => setCadence(value)}
            options={cadenceOptions}
            style={{ minWidth: 140 }}
            disabled={!scheduleEnabled}
          />
          <Input
            placeholder="Time (HH:MM)"
            value={timeOfDay}
            onChange={(event) => setTimeOfDay(event.target.value)}
            style={{ width: 120 }}
            disabled={!scheduleEnabled}
          />
          {cadence === "weekly" && (
            <Select
              value={dayOfWeek}
              onChange={(value) => setDayOfWeek(value)}
              options={weekdayOptions}
              style={{ minWidth: 120 }}
              disabled={!scheduleEnabled}
            />
          )}
          {cadence === "monthly" && (
            <Input
              placeholder="Day of month (1-28)"
              value={dayOfMonth ? String(dayOfMonth) : ""}
              onChange={(event) => setDayOfMonth(Number(event.target.value) || 1)}
              style={{ width: 160 }}
              disabled={!scheduleEnabled}
            />
          )}
        </Space>

        <Space wrap>
          <Select
            placeholder="Dataset (optional)"
            value={datasetId}
            onChange={(value) => setDatasetId(value)}
            options={datasetOptions}
            style={{ minWidth: 220 }}
            allowClear
          />
          <Select
            placeholder="Connector (optional)"
            value={connector}
            onChange={(value) => setConnector(value)}
            options={connectorOptions}
            style={{ minWidth: 200 }}
            allowClear
          />
        </Space>

        <TextArea
          value={connectorConfig}
          onChange={(event) => setConnectorConfig(event.target.value)}
          autoSize={{ minRows: 2, maxRows: 6 }}
          placeholder='Connector config JSON (e.g. {"url": "..."})'
        />

        <Space wrap>
          <Space>
            <Typography.Text>Apply recipe</Typography.Text>
            <Switch checked={applyRecipe} onChange={setApplyRecipe} />
          </Space>
          <Space>
            <Typography.Text>Run profile</Typography.Text>
            <Switch checked={runProfile} onChange={setRunProfile} />
          </Space>
          <Space>
            <Typography.Text>Run insights</Typography.Text>
            <Switch checked={runInsights} onChange={setRunInsights} />
          </Space>
        </Space>

        <Space>
          <Button type="primary" onClick={handleCreate}>
            Create pipeline
          </Button>
          <Button onClick={refresh}>Refresh</Button>
        </Space>

        <List
          dataSource={pipelines}
          locale={{ emptyText: "No pipelines yet." }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="run" onClick={() => handleRun(item.pipeline_id)}>
                  Run now
                </Button>,
                <Button key="edit" onClick={() => openEdit(item)}>
                  Edit
                </Button>,
                <Button key="delete" danger onClick={() => handleDelete(item.pipeline_id)}>
                  Delete
                </Button>
              ]}
            >
              <Space direction="vertical">
                <Typography.Text strong>{item.name}</Typography.Text>
                <Typography.Text type="secondary">Cadence: {item.cadence}</Typography.Text>
                <Typography.Text type="secondary">Scheduled: {item.enabled ? "Yes" : "No"}</Typography.Text>
                <Typography.Text type="secondary">Next run: {item.next_run_at || "-"}</Typography.Text>
                <Typography.Text type="secondary">Last run: {item.last_run_at || "-"}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Space>
      <Modal
        title="Edit pipeline"
        open={isEditing}
        onCancel={() => setIsEditing(false)}
        onOk={handleUpdate}
        okText="Save"
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Input
            placeholder="Pipeline name"
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
          />
          <Space wrap>
            <Space>
              <Typography.Text>Enable schedule</Typography.Text>
              <Switch checked={editScheduleEnabled} onChange={setEditScheduleEnabled} />
            </Space>
            <Select
              value={editCadence}
              onChange={(value) => setEditCadence(value)}
              options={cadenceOptions}
              style={{ minWidth: 140 }}
              disabled={!editScheduleEnabled}
            />
            <Input
              placeholder="Time (HH:MM)"
              value={editTimeOfDay}
              onChange={(event) => setEditTimeOfDay(event.target.value)}
              style={{ width: 120 }}
              disabled={!editScheduleEnabled}
            />
            {editCadence === "weekly" && (
              <Select
                value={editDayOfWeek}
                onChange={(value) => setEditDayOfWeek(value)}
                options={weekdayOptions}
                style={{ minWidth: 120 }}
                disabled={!editScheduleEnabled}
              />
            )}
            {editCadence === "monthly" && (
              <Input
                placeholder="Day of month (1-28)"
                value={editDayOfMonth ? String(editDayOfMonth) : ""}
                onChange={(event) => setEditDayOfMonth(Number(event.target.value) || 1)}
                style={{ width: 160 }}
                disabled={!editScheduleEnabled}
              />
            )}
          </Space>
          <Space wrap>
            <Select
              placeholder="Dataset (optional)"
              value={editDatasetId}
              onChange={(value) => setEditDatasetId(value)}
              options={datasetOptions}
              style={{ minWidth: 220 }}
              allowClear
            />
            <Select
              placeholder="Connector (optional)"
              value={editConnector}
              onChange={(value) => setEditConnector(value)}
              options={connectorOptions}
              style={{ minWidth: 200 }}
              allowClear
            />
          </Space>
          <TextArea
            value={editConnectorConfig}
            onChange={(event) => setEditConnectorConfig(event.target.value)}
            autoSize={{ minRows: 2, maxRows: 6 }}
            placeholder='Connector config JSON (e.g. {"url": "..."})'
          />
          <Space wrap>
            <Space>
              <Typography.Text>Apply recipe</Typography.Text>
              <Switch checked={editApplyRecipe} onChange={setEditApplyRecipe} />
            </Space>
            <Space>
              <Typography.Text>Run profile</Typography.Text>
              <Switch checked={editRunProfile} onChange={setEditRunProfile} />
            </Space>
            <Space>
              <Typography.Text>Run insights</Typography.Text>
              <Switch checked={editRunInsights} onChange={setEditRunInsights} />
            </Space>
          </Space>
        </Space>
      </Modal>
    </Card>
  );
}
