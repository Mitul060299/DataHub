import { useState } from "react";
import { api } from "../api";
import { getAuthToken } from "../utils/auth";

const RENDER_API_BASE_URL = "https://datahub-0dbp.onrender.com";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
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
  needsConfirmation?: boolean;
  transformation?: TransformationPayload;
  plan?: string[];
  artifact?: {
    type: string;
    title?: string;
    content?: string;
  };
};

export function useChatSession() {
  const [sessionId, setSessionId] = useState<string>("default");
  const [sending, setSending] = useState(false);

  const sendMessage = async (payload: {
    message: string;
    dataset_id: string;
    workspace_id: string;
    project_id: string;
    conversation_history: ConversationMessage[];
  }) => {
    setSending(true);
    try {
      let response;
      try {
        response = await api.post<{
          response?: string;
          transformation?: TransformationPayload;
          needsConfirmation?: boolean;
          plan?: string[];
          artifact?: {
            type: string;
            title?: string;
            content?: string;
          };
        }>(`/cleaning/datasets/${payload.dataset_id}/chat`, {
          message: payload.message,
          conversationHistory: payload.conversation_history,
        });
      } catch (error: unknown) {
        const maybeError = error as { message?: string };
        const isNetworkFailure = (maybeError.message || "").toLowerCase().includes("network error");
        if (!isNetworkFailure) {
          throw error;
        }

        const token = getAuthToken();
        response = await api.post<{
          response?: string;
          transformation?: TransformationPayload;
          needsConfirmation?: boolean;
          plan?: string[];
          artifact?: {
            type: string;
            title?: string;
            content?: string;
          };
        }>(`${RENDER_API_BASE_URL}/cleaning/datasets/${payload.dataset_id}/chat`, {
          message: payload.message,
          conversationHistory: payload.conversation_history,
        }, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
      }

      const typedResponse = response as {
        data: {
          response?: string;
          transformation?: TransformationPayload;
          needsConfirmation?: boolean;
          plan?: string[];
          artifact?: {
            type: string;
            title?: string;
            content?: string;
          };
        };
      };

      return {
        session_id: sessionId,
        response: (typedResponse.data.response ?? "").trim() || "No response returned from AI service.",
        transformation: typedResponse.data.transformation,
        needsConfirmation: typedResponse.data.needsConfirmation,
        plan: typedResponse.data.plan,
        artifact: typedResponse.data.artifact,
      } satisfies ChatResponsePayload;
    } finally {
      setSending(false);
    }
  };

  const resetSession = () => {
    setSessionId("default");
  };

  return { sessionId, sending, sendMessage, resetSession };
}
