import { api } from "../api";

export type TransformationOutputDataset = {
  id: string;
  name: string;
  rowCount: number;
  parentId?: string | null;
};

export type ExecuteTransformationResponse = {
  jobId?: string;
  result?: {
    success: boolean;
    rowCount: number;
    previewData: Record<string, unknown>[];
    columns: string[];
    outputDataset?: TransformationOutputDataset;
  };
};

export type PipelineWorkflowStep = {
  id?: string;
  action_type?: string;
  description?: string;
  sql?: string;
  query?: string;
  parameters?: Record<string, unknown>;
};

export type PipelineWorkflowCreatePayload = {
  name: string;
  steps: PipelineWorkflowStep[];
  description?: string;
  is_public?: boolean;
  execution_config?: {
    default_parameters?: Record<string, unknown>;
    [key: string]: unknown;
  };
};

export type PipelineWorkflowRunPayload = {
  input_dataset_id: string;
  session_id?: string;
  runtime_parameters?: Record<string, unknown>;
  triggered_by?: string;
};

export type PipelineRunArtifact = {
  run: {
    id: string;
    pipeline_id: string;
    status: string;
    triggered_by: string;
    input_dataset_id?: string | null;
    output_dataset_id?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
  };
  pipeline_snapshot: Record<string, unknown>;
  runtime_parameters: Record<string, unknown>;
  step_results: Record<string, unknown>;
  execution_log: Array<Record<string, unknown>>;
  metrics: Record<string, unknown>;
  output: {
    row_count: number;
    columns: string[];
    preview_rows: Record<string, unknown>[];
  };
};

export function usePipeline() {
  const run = async (pipelineId: string) => {
    const response = await api.post(`/pipelines/${pipelineId}/run`);
    return response.data;
  };

  const schedule = async (pipelineId: string, cron: string, autoRefreshOnUpload?: boolean) => {
    const response = await api.post(`/pipelines/${pipelineId}/schedule`, {
      cron,
      auto_refresh_on_upload: autoRefreshOnUpload ?? false,
      is_active: true,
    });
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
  }): Promise<ExecuteTransformationResponse> => {
    const response = await api.post(`/cleaning/datasets/${payload.dataset_id}/transform`, {
      transformation: {
        operation: payload.operation ?? "custom_sql",
        sql: payload.sql,
        description: payload.description ?? "Run SQL transformation",
        affectedRows: payload.affectedRows,
        columns: payload.columns,
      },
    });
    return response.data as ExecuteTransformationResponse;
  };

  const undoLastTransformation = async (datasetId: string) => {
    const response = await api.post(`/cleaning/datasets/${datasetId}/undo`);
    return response.data;
  };

  const createPipelineWorkflow = async (payload: PipelineWorkflowCreatePayload) => {
    const response = await api.post("/api/pipelines", {
      name: payload.name,
      steps: payload.steps,
      description: payload.description,
      is_public: payload.is_public ?? false,
      execution_config: payload.execution_config ?? {},
    });
    return response.data as {
      success: boolean;
      data: {
        id: string;
        name: string;
        status: string;
        version: number;
        steps_count: number;
      };
    };
  };

  const updatePipelineWorkflow = async (
    pipelineId: string,
    payload: {
      name?: string;
      description?: string;
      steps?: PipelineWorkflowStep[];
      execution_config?: Record<string, unknown>;
    },
  ) => {
    const response = await api.patch(`/api/pipelines/${pipelineId}`, payload);
    return response.data as {
      success: boolean;
      data: {
        id: string;
        version: number;
        updated: boolean;
      };
    };
  };

  const runPipelineWorkflow = async (pipelineId: string, payload: PipelineWorkflowRunPayload) => {
    const response = await api.post(`/api/pipelines/${pipelineId}/run`, {
      input_dataset_id: payload.input_dataset_id,
      session_id: payload.session_id,
      runtime_parameters: payload.runtime_parameters ?? {},
      triggered_by: payload.triggered_by ?? "manual",
    });
    return response.data;
  };

  const clonePipelineWorkflow = async (
    pipelineId: string,
    payload?: { name?: string; description?: string },
  ) => {
    const response = await api.post(`/api/pipelines/${pipelineId}/clone`, {
      name: payload?.name,
      description: payload?.description,
    });
    return response.data as {
      success: boolean;
      data: {
        id: string;
        name: string;
        status: string;
        version: number;
        parent_pipeline_id?: string | null;
      };
    };
  };

  const getPipelineRunArtifact = async (runId: string, previewLimit = 100) => {
    const response = await api.get(`/api/pipelines/runs/${runId}/artifact`, {
      params: { preview_limit: previewLimit },
    });
    return response.data as {
      success: boolean;
      data: PipelineRunArtifact;
    };
  };

  return {
    run,
    schedule,
    exportPipeline,
    executeTransformation,
    undoLastTransformation,
    createPipelineWorkflow,
    updatePipelineWorkflow,
    runPipelineWorkflow,
    clonePipelineWorkflow,
    getPipelineRunArtifact,
  };
}
