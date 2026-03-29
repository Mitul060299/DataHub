import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api";

export interface ScheduleInfo {
  label: string;
  cron: string;
  autoRefreshOnUpload?: boolean;
}

export interface PipelineStep {
  id: string;
  stepNumber: number;
  operation: string;
  description: string;
  sql?: string;
  affectedRows?: string;
  appliedAt: Date;
  inputDataset?: {
    id: string;
    name: string;
    rows: number;
  };
  outputDataset?: {
    id: string;
    name: string;
    rowCount: number;
    parentId?: string | null;
  };
  // Extended fields populated by execute_step / pipeline_recorder
  input_tables?: string[];
  output_table?: string;
  row_count_before?: number | null;
  row_count_after?: number | null;
  execution_time_ms?: number | null;
  status?: "completed" | "failed" | "pending";
  error_message?: string | null;
  /** Full raw config dict from the agent, used for surgical step replay */
  rawConfig?: Record<string, unknown>;
}

interface PipelineContextValue {
  steps: PipelineStep[];
  addStep: (step: PipelineStep) => void;
  removeStep: (stepId: string) => void;
  renameStep: (stepId: string, newLabel: string) => void;
  keepStepsThrough: (stepId: string) => void;
  clearSteps: () => void;
  replaceSteps: (newSteps: PipelineStep[]) => void;
  updateStep: (stepId: string, updates: Partial<PipelineStep>) => void;
  runPipeline: () => Promise<void>;
  scheduleInfo: ScheduleInfo | null;
  setScheduleInfo: (info: ScheduleInfo | null) => void;
}

const PipelineContext = createContext<PipelineContextValue | undefined>(undefined);
const PIPELINE_STEPS_STORAGE_KEY = "datahub_pipeline_steps_v1";


const loadPersistedSteps = (): PipelineStep[] => {
  try {
    const raw = localStorage.getItem(PIPELINE_STEPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<PipelineStep, "appliedAt"> & { appliedAt: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((step) => ({
      ...step,
      appliedAt: new Date(step.appliedAt),
    }));
  } catch {
    return [];
  }
};

export function PipelineProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<PipelineStep[]>(() => loadPersistedSteps());
  const [scheduleInfo, setScheduleInfo] = useState<ScheduleInfo | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PIPELINE_STEPS_STORAGE_KEY, JSON.stringify(steps));
    } catch {
      return;
    }
  }, [steps]);

  const addStep = (step: PipelineStep) => {
    setSteps((current) => [...current, step]);
  };

  const removeStep = (stepId: string) => {
    setSteps((current) => current.filter((step) => step.id !== stepId));
  };

  const renameStep = (stepId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setSteps((current) =>
      current.map((step) =>
        step.id === stepId ? { ...step, description: trimmed } : step
      )
    );
  };

  const keepStepsThrough = (stepId: string) => {
    setSteps((current) => {
      const index = current.findIndex((step) => step.id === stepId);
      if (index < 0) return current;
      return current.slice(0, index + 1);
    });
  };

  const clearSteps = () => {
    setSteps([]);
  };

  const replaceSteps = (newSteps: PipelineStep[]) => {
    setSteps(newSteps);
  };

  const updateStep = (stepId: string, updates: Partial<PipelineStep>) => {
    setSteps((current) =>
      current.map((step) => (step.id === stepId ? { ...step, ...updates } : step))
    );
  };

  const runPipeline = async () => {
    if (!steps.length) return;
    try {
      await api.post("/pipelines/default/run");
    } catch {
      await Promise.resolve();
    }
  };

  const value = useMemo(
    () => ({ steps, addStep, removeStep, renameStep, keepStepsThrough, clearSteps, replaceSteps, updateStep, runPipeline, scheduleInfo, setScheduleInfo }),
    [steps, scheduleInfo],  // eslint-disable-line react-hooks/exhaustive-deps
  );

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}

export function usePipelineContext() {
  const context = useContext(PipelineContext);
  if (!context) {
    throw new Error("usePipelineContext must be used inside PipelineProvider");
  }
  return context;
}
