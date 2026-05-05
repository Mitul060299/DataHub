/**
 * useAutoRunSession.ts
 * Hook that manages an Auto Mode run: POST /api/auto/run (SSE), resume, cancel.
 */
import { useCallback, useRef, useState } from "react";
import { getAuthToken } from "../utils/auth";

export interface AutoRunEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface AutoRunStep {
  step_number: number;
  operation: string;
  description: string;
  rule_id: number;
  justification: string;
  needs_validator: boolean;
}

export interface GoalReport {
  rules_satisfied: number;
  rules_failed: number;
  rules_skipped: number;
  total_rules: number;
  duration_seconds: number;
}

export interface InterruptQuestion {
  rule_id: number;
  question: string;
  options: Array<{ option_id: string; label: string; implication: string }>;
  sample_rows: Record<string, unknown>[];
  allow_freeform: boolean;
  blocks_other_rules: boolean;
}

export interface AutoRunState {
  runId: string | null;
  status: "idle" | "running" | "interrupted" | "complete" | "error";
  goalSummary: string;
  totalRules: number;
  planSteps: AutoRunStep[];
  preRunReview: boolean;
  planApproved: boolean;
  driftAmber: number;
  driftRed: number;
  interruptQuestion: InterruptQuestion | null;
  goalReport: GoalReport | null;
  events: AutoRunEvent[];
  error: string | null;
}

const INITIAL_STATE: AutoRunState = {
  runId: null,
  status: "idle",
  goalSummary: "",
  totalRules: 0,
  planSteps: [],
  preRunReview: false,
  planApproved: false,
  driftAmber: 0,
  driftRed: 0,
  interruptQuestion: null,
  goalReport: null,
  events: [],
  error: null,
};

export function useAutoRunSession() {
  const [state, setState] = useState<AutoRunState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);

  const start = useCallback(
    async (params: {
      datasetId: string;
      projectId: string;
      sessionId?: string;
      goal: string;
      dryRun?: boolean;
      priorPipeline?: { format: string; content: string; trust_level: string } | null;
    }) => {
      // Cancel any running stream
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setState({ ...INITIAL_STATE, status: "running" });

      const token = getAuthToken();
      let response: Response;
      try {
        response = await fetch("/api/auto/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            dataset_id: params.datasetId,
            project_id: params.projectId,
            session_id: params.sessionId ?? "",
            goal: params.goal,
            dry_run: params.dryRun ?? false,
            prior_pipeline: params.priorPipeline ?? null,
          }),
          signal: abort.signal,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setState((s) => ({ ...s, status: "error", error: String(err) }));
        return;
      }

      if (!response.body) {
        setState((s) => ({ ...s, status: "error", error: "No response body" }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        try {
          const ev = JSON.parse(line.slice(6)) as { type: string; data?: Record<string, unknown> };
          const evType = ev.type ?? "";
          const evData = (ev as unknown as Record<string, unknown>).data as Record<string, unknown> ?? {};

          setState((s) => {
            const nextEvents = [...s.events, { type: evType, data: evData }].slice(-200);

            if (evType === "auto.run.started") {
              const newRunId = evData.run_id as string ?? s.runId;
              runIdRef.current = newRunId;
              return {
                ...s,
                runId: newRunId,
                preRunReview: Boolean(evData.pre_run_review),
                events: nextEvents,
              };
            }
            if (evType === "auto.goal.parsed") {
              return {
                ...s,
                goalSummary: evData.goal_summary as string ?? "",
                totalRules: evData.total_rules as number ?? 0,
                events: nextEvents,
              };
            }
            if (evType === "auto.plan.ready") {
              return {
                ...s,
                planSteps: (evData.steps as AutoRunStep[]) ?? [],
                // If pre_run_review is on, wait for user approval
                planApproved: !s.preRunReview,
                events: nextEvents,
              };
            }
            if (evType === "auto.drift.report") {
              return {
                ...s,
                driftAmber: evData.amber as number ?? 0,
                driftRed: evData.red as number ?? 0,
                events: nextEvents,
              };
            }
            if (evType === "auto.interrupt.question") {
              return {
                ...s,
                status: "interrupted",
                interruptQuestion: evData.question as InterruptQuestion ?? null,
                events: nextEvents,
              };
            }
            if (evType === "auto.goal.report") {
              return {
                ...s,
                goalReport: evData as unknown as GoalReport,
                events: nextEvents,
              };
            }
            if (evType === "auto.run.complete") {
              return { ...s, status: "complete", events: nextEvents };
            }
            if (evType === "auto.run.error") {
              return {
                ...s,
                status: "error",
                error: evData.error as string ?? "Unknown error",
                events: nextEvents,
              };
            }
            return { ...s, events: nextEvents };
          });
        } catch {
          // ignore parse errors for keep-alives
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          lines.forEach(processLine);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setState((s) => ({ ...s, status: "error", error: String(err) }));
        }
      }
    },
    []
  );

  const resume = useCallback(async (runId: string, response: string) => {
    const token = getAuthToken();
    try {
      const res = await fetch("/api/auto/run/resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ run_id: runId, interrupt_response: response }),
      });
      if (res.ok) {
        setState((s) => ({
          ...s,
          status: "running",
          interruptQuestion: null,
        }));
      }
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
    }
  }, []);

  const cancel = useCallback(async () => {
    abortRef.current?.abort();
    const runId = runIdRef.current;
    if (!runId) return;
    const token = getAuthToken();
    await fetch(`/api/auto/run/${runId}/cancel`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
    setState((s) => ({ ...s, status: "idle" }));
  }, []);

  const approvePlan = useCallback(() => {
    setState((s) => ({ ...s, planApproved: true }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    runIdRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  return { state, start, resume, cancel, approvePlan, reset };
}
