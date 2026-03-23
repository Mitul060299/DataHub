import { useState } from "react";
import { getAuthToken } from "../utils/auth";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PlanStep = {
  step_number: number;
  operation: string;
  description: string;
  parameters?: Record<string, unknown>;
  template_id?: string | null;
  estimated_rows: string;
  reversible: boolean;
};

export type AgentEvent = {
  type: string;
  [key: string]: unknown;
};

export type TransformationPayload = {
  operation: string;
  sql?: string;
  description: string;
  affectedRows?: string;
};

export type ChatResponsePayload = {
  session_id: string;
  response: string;
  runId?: string | null;
  needsConfirmation?: boolean;
  transformation?: TransformationPayload;
  plan?: PlanStep[];
  artifact?: {
    type: string;
    title?: string;
    content?: string;
  };
};

export function useChatSession() {
  const [sessionId, setSessionId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);

  const sendMessage = async (payload: {
    message: string;
    dataset_id: string;
    workspace_id: string;
    project_id: string;
    conversation_history: ConversationMessage[];
    pipeline_steps?: Array<Record<string, unknown>>;
    plan_approved?: boolean;
    onEvent?: (event: AgentEvent) => void;
    onRunCompleted?: (runId: string | null) => void;
  }) => {
    setSending(true);
    try {
      const sid = sessionId || crypto.randomUUID();
      const token = getAuthToken();
      if (!sessionId) setSessionId(sid);

      const response = await fetch(`/api/cleaning/datasets/${payload.dataset_id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload.workspace_id ? { "X-Workspace-Id": payload.workspace_id } : {}),
        },
        body: JSON.stringify({
          message: payload.message,
          session_id: sid,
          dataset_id: payload.dataset_id,
          workspace_id: payload.workspace_id,
          project_id: payload.project_id,
          pipeline_steps: payload.pipeline_steps ?? [],
          plan_approved: payload.plan_approved ?? false,
          conversation_history: payload.conversation_history,
        }),
      });

      if (!response.ok) {
        let detail = "Request failed";
        try {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const body = await response.json() as { detail?: string; message?: string; error?: string };
            detail = body.detail || body.message || body.error || detail;
          } else {
            const text = (await response.text()).trim();
            if (text) {
              detail = text;
            }
          }
        } catch {
        }
        throw new Error(detail);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResponse = "";
      let plan: PlanStep[] | undefined;
      let completedRunId: string | null = null;
      const suppressPlanEvents = Boolean(payload.plan_approved);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as AgentEvent;
            if (!(suppressPlanEvents && event.type === "agent.plan")) {
              payload.onEvent?.(event);
            }
            if (event.type === "agent.plan" && Array.isArray(event.plan)) {
              plan = event.plan as PlanStep[];
            }
            if (event.type === "agent.done" && typeof event.response === "string") {
              finalResponse = event.response;
              completedRunId = typeof event.run_id === "string" ? event.run_id : null;
              setRunId(completedRunId);
              payload.onRunCompleted?.(completedRunId);
            }
            if (event.type === "agent.error") {
              // Let the onEvent handler (AIPanel) display the error bubble.
              // Do NOT also throw here — that would create a second duplicate error bubble.
              return {
                session_id: sid,
                response: "",
                runId: null,
                transformation: undefined,
                needsConfirmation: false,
                plan: undefined,
                artifact: undefined,
              };
            }
          } catch (error) {
            if (error instanceof Error) {
              throw error;
            }
          }
        }
      }

      return {
        session_id: sid,
        response: finalResponse.trim() || (plan?.length ? "Plan ready for approval" : "No response returned from AI service."),
        runId: completedRunId,
        transformation: undefined,
        needsConfirmation: false,
        plan,
        artifact: undefined,
      } satisfies ChatResponsePayload;
    } finally {
      setSending(false);
    }
  };

  const resetSession = () => {
    setSessionId("");
    setRunId(null);
  };

  return { sessionId, runId, sending, sendMessage, resetSession };
}
