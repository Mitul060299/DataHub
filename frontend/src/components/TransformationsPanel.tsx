import { Button, Card, Input, List, Select, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { applyRecipe, fetchRecipe, saveRecipe } from "../api";
import { TransformationRecipe, TransformationStep } from "../types";
import { notify } from "../utils/notify";

interface Props {
  datasetId: string | null;
}

const STEP_OPTIONS = [
  "drop_missing",
  "fill_missing",
  "rename_columns",
  "cast_type",
  "filter_rows",
  "pivot",
  "join",
  "add_column_formula",
  "drop_duplicates"
];

export function TransformationsPanel({ datasetId }: Props) {
  const [steps, setSteps] = useState<TransformationStep[]>([]);
  const [newStep, setNewStep] = useState<string | undefined>(undefined);
  const [paramsText, setParamsText] = useState("{}");
  const [loading, setLoading] = useState(false);

  const loadRecipe = async () => {
    if (!datasetId) {
      setSteps([]);
      return;
    }
    try {
      const recipe: TransformationRecipe = await fetchRecipe(datasetId);
      setSteps(recipe.steps || []);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail && detail.toLowerCase().includes("not found")) {
        setSteps([]);
      } else if (detail) {
        notify.error(detail);
      }
    }
  };

  useEffect(() => {
    loadRecipe();
  }, [datasetId]);

  const handleAddStep = () => {
    if (!newStep) return;
    try {
      const params = JSON.parse(paramsText || "{}");
      setSteps((prev) => [...prev, { name: newStep, params }]);
      setParamsText("{}");
    } catch (err: any) {
      notify.error("Invalid JSON for params.");
    }
  };

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      await saveRecipe(datasetId, steps);
      notify.success("Recipe saved");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to save recipe.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      await saveRecipe(datasetId, steps);
      await applyRecipe(datasetId);
      notify.success("Recipe applied");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to apply recipe.";
      notify.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          Build transformation recipes for the selected dataset.
        </Typography.Text>
        <Space wrap>
          <Select
            placeholder="Step"
            value={newStep}
            onChange={setNewStep}
            options={STEP_OPTIONS.map((item) => ({ label: item, value: item }))}
            style={{ minWidth: 220 }}
            disabled={!datasetId}
          />
          <Input.TextArea
            value={paramsText}
            onChange={(event) => setParamsText(event.target.value)}
            placeholder='{"columns": ["col"], "value": 0}'
            autoSize={{ minRows: 2, maxRows: 4 }}
            style={{ minWidth: 300 }}
            disabled={!datasetId}
          />
          <Button onClick={handleAddStep} disabled={!datasetId || !newStep}>
            Add Step
          </Button>
        </Space>
        <Space>
          <Button onClick={loadRecipe} disabled={!datasetId}>
            Reload
          </Button>
          <Button type="primary" onClick={handleSave} disabled={!datasetId} loading={loading}>
            Save Recipe
          </Button>
          <Button onClick={handleApply} disabled={!datasetId} loading={loading}>
            Save & Apply
          </Button>
        </Space>
        <List
          dataSource={steps}
          locale={{ emptyText: datasetId ? "No steps yet." : "Select a dataset." }}
          renderItem={(item, index) => (
            <List.Item
              actions={[
                <Button key="remove" danger size="small" onClick={() => handleRemoveStep(index)}>
                  Remove
                </Button>
              ]}
            >
              <Space direction="vertical">
                <Typography.Text strong>
                  {index + 1}. {item.name}
                </Typography.Text>
                <Typography.Text type="secondary">{JSON.stringify(item.params)}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
