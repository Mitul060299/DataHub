import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api";

export interface ScheduleInfo {
  label: string;
  cron: string;
}

export interface PipelineStep {
  id: string;
  stepNumber: number;
  operation: string;
  description: string;
  sql?: string;
  affectedRows?: string;
  appliedAt: Date;
}

interface PipelineContextValue {
  steps: PipelineStep[];
  addStep: (step: PipelineStep) => void;
  removeStep: (stepId: string) => void;
  clearSteps: () => void;
  runPipeline: () => Promise<void>;
  scheduleInfo: ScheduleInfo | null;
  setScheduleInfo: (info: ScheduleInfo | null) => void;
}

const PipelineContext = createContext<PipelineContextValue | undefined>(undefined);

export function PipelineProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [scheduleInfo, setScheduleInfo] = useState<ScheduleInfo | null>(null);

  const addStep = (step: PipelineStep) => {
    setSteps((current) => [...current, step]);
  };

  const removeStep = (stepId: string) => {
    setSteps((current) => current.filter((step) => step.id !== stepId));
  };

  const clearSteps = () => {
    setSteps([]);
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
    () => ({ steps, addStep, removeStep, clearSteps, runPipeline, scheduleInfo, setScheduleInfo }),
    [steps, scheduleInfo],
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
