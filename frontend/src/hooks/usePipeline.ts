import { api } from "../api";

export function usePipeline() {
  const run = async (pipelineId: string) => {
    const response = await api.post(`/pipelines/${pipelineId}/run`);
    return response.data;
  };

  const schedule = async (pipelineId: string, cron: string) => {
    const response = await api.post(`/pipelines/${pipelineId}/schedule`, { cron });
    return response.data;
  };

  const exportPipeline = (steps: Array<unknown>) => {
    const json = JSON.stringify({ steps }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pipeline.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const executeTransformation = async (payload: {
    dataset_id: string;
    sql: string;
    operation?: string;
    description?: string;
    affectedRows?: string;
    columns?: string[];
  }) => {
    const response = await api.post(`/cleaning/datasets/${payload.dataset_id}/transform`, {
      transformation: {
        operation: payload.operation ?? "custom_sql",
        sql: payload.sql,
        description: payload.description ?? "Run SQL transformation",
        affectedRows: payload.affectedRows,
        columns: payload.columns,
      },
    });
    return response.data;
  };

  const undoLastTransformation = async (datasetId: string) => {
    const response = await api.post(`/cleaning/datasets/${datasetId}/undo`);
    return response.data;
  };

  return { run, schedule, exportPipeline, executeTransformation, undoLastTransformation };
}
