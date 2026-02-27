import { useState } from "react";
import { api } from "../api";

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
      const response = await api.post<{
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
