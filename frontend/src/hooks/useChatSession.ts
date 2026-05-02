import { useRef, useState } from "react";
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
  sql?: string;
  template_id?: string | null;
  estimated_rows: string;
  reversible: boolean;
  depends_on?: number[];
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
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>("");

  const sendMessage = async (payload: {
    message: string;
    dataset_id: string;
    project_id: string;
    conversation_history: ConversationMessage[];
    pipeline_steps?: Array<Record<string, unknown>>;
    plan_approved?: boolean;
    plan_pending_modification?: boolean;
    pending_plan?: PlanStep[];
    secondary_dataset_ids?: string[];
    onEvent?: (event: AgentEvent) => void;
    onRunCompleted?: (runId: string | null) => void;
  }) => {
    if (sending) return;
    setSending(true);
    try {
      const sid = sessionId || crypto.randomUUID();
      const token = getAuthToken();
      if (!sessionId) {
        setSessionId(sid);
        sessionIdRef.current = sid;
        // Persist so AIPanel can load history on next mount
        if (payload.dataset_id) {
          localStorage.setItem(`datahub_chat_session_${payload.dataset_id}`, sid);
          // Mirror to server-side dataset_sessions (arch #2) so refresh /
          // multi-tab / multi-device all bind to the same chat session.
          // Best-effort: localStorage is the working fallback if this fails.
          import("../api").then(({ saveDatasetSession }) => {
            void saveDatasetSession(payload.dataset_id, { chat_session_id: sid })
              .catch(() => { /* silent */ });
          }).catch(() => { /* silent */ });
        }
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch(`/api/cleaning/datasets/${payload.dataset_id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          message: payload.message,
          session_id: sid,
          dataset_id: payload.dataset_id,
          project_id: payload.project_id,
          pipeline_steps: payload.pipeline_steps ?? [],
          plan_approved: payload.plan_approved ?? false,
          plan_pending_modification: payload.plan_pending_modification ?? false,
          pending_plan: payload.pending_plan ?? [],
          conversation_history: payload.conversation_history,
          secondary_dataset_ids: payload.secondary_dataset_ids ?? [],
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
        let done: boolean;
        let value: Uint8Array | undefined;
        try {
          ({ done, value } = await reader.read());
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") break;
          throw err;
        }
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
      abortRef.current = null;
    }
  };

  const cancelMessage = () => {
    abortRef.current?.abort();
  };

  const resetSession = () => {
    setSessionId("");
    sessionIdRef.current = "";
    setRunId(null);
  };

  const restoreSession = (id: string) => {
    setSessionId(id);
    sessionIdRef.current = id;
  };

  const saveHistory = async (datasetId: string, messages: ConversationMessage[]) => {
    const sid = sessionIdRef.current || sessionId;
    if (!sid) return;
    const token = getAuthToken();
    try {
      const res = await fetch(`/api/chat/sessions/${sid}/history`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ dataset_id: datasetId, messages }),
      });
      if (!res.ok) {
        // Surface non-2xx failures in browser devtools Network tab.
        console.warn("[useChatSession] saveHistory failed:", res.status, res.statusText);
      }
    } catch {
      // Network-level failure — fire-and-forget.
    }
  };

  return { sessionId, sessionIdRef, runId, sending, sendMessage, resetSession, cancelMessage, restoreSession, saveHistory };
}
