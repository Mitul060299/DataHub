import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { api } from "../api";

export interface PipelineRunStatus {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed";
  error_message: string | null;
}

/**
 * Subscribe to Supabase Realtime broadcast events for a specific pipeline.
 *
 * The backend emits `run_status_changed` events on the `pipeline:{pipelineId}`
 * channel at run start, failure, and completion, so the frontend never needs
 * to poll the `/pipelines/runs/{runId}/status` endpoint.
 *
 * `triggerRun()` starts the pipeline and returns the run_id.
 * `runStatus` is updated in real-time as the backend progresses.
 * `isRunning` is true while status is "pending" or "running".
 */
export function useRealtimePipelineRun(pipelineId: string | null | undefined) {
  const [runStatus, setRunStatus] = useState<PipelineRunStatus | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  // Track the run_id we triggered so we ignore stale events from concurrent runs
  const activeRunId = useRef<string | null>(null);

  useEffect(() => {
    if (!pipelineId) return;

    const channel = supabase.channel(`pipeline:${pipelineId}`);

    channel.on(
      "broadcast",
      { event: "run_status_changed" },
      (msg: {
        payload?: {
          run_id?: string;
          status?: string;
          error_message?: string | null;
        };
      }) => {
        const payload = msg.payload ?? {};
        const eventRunId = payload.run_id ?? "";

        // Ignore events for runs we didn't trigger from this session
        if (activeRunId.current && eventRunId !== activeRunId.current) return;

        const status = payload.status as PipelineRunStatus["status"];
        setRunStatus({
          run_id: eventRunId,
          status,
          error_message: payload.error_message ?? null,
        });

        if (status === "completed" || status === "failed") {
          setIsRunning(false);
          activeRunId.current = null;
        }
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pipelineId]);

  const triggerRun = useCallback(async (): Promise<string | null> => {
    if (!pipelineId) return null;
    try {
      const res = await api.post<{ run_id: string; status: string }>(
        `/pipelines/${pipelineId}/run`,
      );
      const runId = res.data.run_id;
      activeRunId.current = runId;
      setIsRunning(true);
      setRunStatus({ run_id: runId, status: "pending", error_message: null });
      return runId;
    } catch {
      return null;
    }
  }, [pipelineId]);

  const clearRunStatus = useCallback(() => {
    setRunStatus(null);
    setIsRunning(false);
    activeRunId.current = null;
  }, []);

  return { runStatus, isRunning, triggerRun, clearRunStatus };
}
